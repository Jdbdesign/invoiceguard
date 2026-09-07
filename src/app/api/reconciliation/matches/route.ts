import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction, mapPayment } from "@/lib/mappers";
import { computeMatchCandidates } from "@/lib/reconciliationMatching";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";
import { BANK_TRANSACTION_CURRENCY, formatCurrency } from "@/lib/utils";

const AMOUNT_EPSILON = 0.01;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = session.user.id;

  const [confirmedPayments, unmatchedPaymentRows, candidateTransactionRows] = await Promise.all([
    prisma.payment.findMany({
      where: { bankTransactionId: { not: null }, invoice: { client: { ownerId } } },
      include: { invoice: { select: { invoiceNumber: true } }, bankTransaction: true },
    }),
    prisma.payment.findMany({
      where: { reconciledAt: null, invoice: { client: { ownerId } } },
      include: { invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.bankTransaction.findMany({
      where: { ownerId, ignoredAt: null, amount: { gt: 0 }, payment: null },
    }),
  ]);

  const matched = confirmedPayments
    .filter((p) => p.bankTransaction)
    .map((p) => ({
      payment: mapPayment(p),
      transaction: mapBankTransaction(p.bankTransaction!),
    }));

  const candidateResults = computeMatchCandidates(
    candidateTransactionRows.map((t) => ({ id: t.id, amount: t.amount, dateIso: t.date.toISOString().slice(0, 10) })),
    unmatchedPaymentRows.map((p) => ({ id: p.id, amount: p.amount, paidDateIso: p.paidDate.toISOString().slice(0, 10) }))
  );

  const paymentById = new Map(unmatchedPaymentRows.map((p) => [p.id, p]));
  const transactionById = new Map(candidateTransactionRows.map((t) => [t.id, t]));

  const needsReview: { transaction: ReturnType<typeof mapBankTransaction>; candidates: ReturnType<typeof mapPayment>[] }[] = [];
  const autoMatchable: { transactionId: string; paymentId: string }[] = [];
  const unmatchedBankIds = new Set(candidateTransactionRows.map((t) => t.id));
  const matchedPaymentIds = new Set<string>();

  for (const result of candidateResults) {
    if (result.candidatePaymentIds.length === 1) {
      autoMatchable.push({ transactionId: result.transactionId, paymentId: result.candidatePaymentIds[0] });
      matchedPaymentIds.add(result.candidatePaymentIds[0]);
      unmatchedBankIds.delete(result.transactionId);
    } else if (result.candidatePaymentIds.length > 1) {
      needsReview.push({
        transaction: mapBankTransaction(transactionById.get(result.transactionId)!),
        candidates: result.candidatePaymentIds.map((id) => mapPayment(paymentById.get(id)!)),
      });
      for (const id of result.candidatePaymentIds) matchedPaymentIds.add(id);
      unmatchedBankIds.delete(result.transactionId);
    }
  }

  const unmatchedOurs = unmatchedPaymentRows.filter((p) => !matchedPaymentIds.has(p.id)).map(mapPayment);
  const unmatchedBank = candidateTransactionRows.filter((t) => unmatchedBankIds.has(t.id)).map(mapBankTransaction);

  const suggested = autoMatchable.map(({ transactionId, paymentId }) => ({
    payment: mapPayment(paymentById.get(paymentId)!),
    transaction: mapBankTransaction(transactionById.get(transactionId)!),
  }));

  return NextResponse.json({
    matched,
    suggested,
    needsReview,
    unmatchedOurs,
    unmatchedBank,
  });
}

interface ConfirmBody {
  paymentId?: unknown;
  invoiceId?: unknown;
  bankTransactionId?: unknown;
}

// Thrown inside the $transaction below when server-side re-validation of an
// invoice-direct link fails — caught outside to return a 409 instead of the
// generic 500 an uncaught error would produce.
class InvoiceNotLinkableError extends Error {}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const body = (await request.json()) as ConfirmBody;
  if (typeof body.bankTransactionId !== "string") {
    return NextResponse.json({ error: "bankTransactionId is required" }, { status: 400 });
  }

  if (typeof body.invoiceId === "string") {
    return linkInvoiceDirect(session.user.id, body.invoiceId, body.bankTransactionId);
  }

  if (typeof body.paymentId !== "string") {
    return NextResponse.json(
      { error: "paymentId or invoiceId is required alongside bankTransactionId" },
      { status: 400 }
    );
  }

  const payment = await prisma.payment.findFirst({
    where: { id: body.paymentId, reconciledAt: null, invoice: { client: { ownerId: session.user.id } } },
  });
  if (!payment) return NextResponse.json({ error: "payment not found" }, { status: 404 });

  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: body.bankTransactionId, ownerId: session.user.id, payment: null },
  });
  if (!transaction) return NextResponse.json({ error: "bank transaction not found or already matched" }, { status: 404 });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { reconciledAt: new Date(), bankTransactionId: transaction.id },
    include: { invoice: { select: { invoiceNumber: true } }, bankTransaction: true },
  });

  return NextResponse.json({ payment: mapPayment(updated) });
}

// "Link manually" can also target an unpaid invoice directly (no Payment
// recorded yet — the normal state for an overdue invoice) instead of an
// existing unreconciled Payment. Only offered by the search endpoint when the
// invoice's remaining balance exactly matches the transaction's amount and
// its currency matches BANK_TRANSACTION_CURRENCY, but both are re-checked
// here inside the transaction rather than trusted from the client, same
// TOCTOU-safety reasoning as the payment path above and the review-confirm
// idempotency guard in bank-statements/[id]/route.ts. On success this
// creates the Payment, marks the invoice paid in full, and logs the same
// "payment_received" activity mark-paid would — mirroring what marking the
// invoice paid manually and then reconciling it would have produced, minus
// the receipt-send side effect (out of scope for a reconciliation action).
async function linkInvoiceDirect(ownerId: string, invoiceId: string, bankTransactionId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.bankTransaction.findFirst({
        where: { id: bankTransactionId, ownerId, payment: null },
      });
      if (!transaction) throw new InvoiceNotLinkableError("bank transaction not found or already matched");

      const invoice = await tx.invoice.findFirst({
        where: {
          id: invoiceId,
          status: { not: "paid" },
          paymentPlan: null,
          client: { ownerId, currency: BANK_TRANSACTION_CURRENCY },
        },
        include: { client: true },
      });
      if (!invoice) throw new InvoiceNotLinkableError("invoice not found or not eligible for direct linking");
      if (Math.abs(invoice.balance - transaction.amount) > AMOUNT_EPSILON) {
        throw new InvoiceNotLinkableError("invoice balance no longer matches this transaction's amount");
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: transaction.amount,
          paidDate: transaction.date,
          reconciledAt: new Date(),
          bankTransactionId: transaction.id,
        },
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "paid", balance: 0 } });
      await tx.activityLog.create({
        data: {
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          type: "payment_received",
          message: `Invoice ${invoice.invoiceNumber} paid in full — ${formatCurrency(transaction.amount, invoice.client.currency)} received (matched from bank statement).`,
        },
      });

      return tx.payment.findFirstOrThrow({
        where: { id: payment.id },
        include: { invoice: { select: { invoiceNumber: true } }, bankTransaction: true },
      });
    });

    return NextResponse.json({ payment: mapPayment(result) });
  } catch (error) {
    if (error instanceof InvoiceNotLinkableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
