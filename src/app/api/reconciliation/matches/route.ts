import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction, mapPayment } from "@/lib/mappers";
import { computeMatchCandidates } from "@/lib/reconciliationMatching";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

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
  bankTransactionId?: unknown;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const body = (await request.json()) as ConfirmBody;
  if (typeof body.paymentId !== "string" || typeof body.bankTransactionId !== "string") {
    return NextResponse.json({ error: "paymentId and bankTransactionId are required" }, { status: 400 });
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
