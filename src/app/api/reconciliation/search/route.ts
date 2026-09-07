import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction, mapLinkableInvoice, mapPayment } from "@/lib/mappers";
import { BANK_TRANSACTION_CURRENCY } from "@/lib/utils";

const RESULT_LIMIT = 20;
const AMOUNT_EPSILON = 0.01;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = session.user.id;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();
  const transactionId = searchParams.get("transactionId");

  if (type !== "payment" && type !== "transaction") {
    return NextResponse.json({ error: "type must be 'payment' or 'transaction'" }, { status: 400 });
  }
  if (!q) return NextResponse.json({ results: [] });

  const numericQuery = Number(q);
  const isAmountQuery = Number.isFinite(numericQuery);

  if (type === "payment") {
    const [payments, targetTransaction] = await Promise.all([
      prisma.payment.findMany({
        where: {
          reconciledAt: null,
          invoice: {
            client: { ownerId },
            ...(isAmountQuery
              ? {}
              : {
                  OR: [
                    { invoiceNumber: { contains: q, mode: "insensitive" } },
                    { client: { name: { contains: q, mode: "insensitive" } } },
                  ],
                }),
          },
          ...(isAmountQuery
            ? { amount: { gte: numericQuery - AMOUNT_EPSILON, lte: numericQuery + AMOUNT_EPSILON } }
            : {}),
        },
        include: { invoice: { select: { invoiceNumber: true } } },
        take: RESULT_LIMIT,
      }),
      // Only offered when the caller tells us which bank transaction this
      // search is for — an unpaid invoice is only a valid link target when
      // its remaining balance exactly matches THAT transaction's amount, not
      // whatever number the user happens to be typing (unlike the payment
      // search above, which is intentionally loose — "Link manually" exists
      // precisely for matches outside the auto-match window).
      transactionId
        ? prisma.bankTransaction.findFirst({
            where: { id: transactionId, ownerId, payment: null },
          })
        : null,
    ]);

    const eligibleInvoices = targetTransaction
      ? await prisma.invoice.findMany({
          where: {
            status: { not: "paid" },
            paymentPlan: null,
            balance: {
              gte: targetTransaction.amount - AMOUNT_EPSILON,
              lte: targetTransaction.amount + AMOUNT_EPSILON,
            },
            client: { ownerId, currency: BANK_TRANSACTION_CURRENCY },
            ...(isAmountQuery
              ? {}
              : {
                  OR: [
                    { invoiceNumber: { contains: q, mode: "insensitive" } },
                    { client: { name: { contains: q, mode: "insensitive" } } },
                  ],
                }),
          },
          include: { client: true },
          take: RESULT_LIMIT,
        })
      : [];

    return NextResponse.json({
      results: [
        ...payments.map((p) => ({ kind: "payment" as const, ...mapPayment(p) })),
        ...eligibleInvoices.map((inv) => ({ kind: "invoice" as const, ...mapLinkableInvoice(inv) })),
      ],
    });
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      ownerId,
      ignoredAt: null,
      payment: null,
      ...(isAmountQuery
        ? { amount: { gte: numericQuery - AMOUNT_EPSILON, lte: numericQuery + AMOUNT_EPSILON, gt: 0 } }
        : { amount: { gt: 0 }, description: { contains: q, mode: "insensitive" } }),
    },
    take: RESULT_LIMIT,
  });
  return NextResponse.json({
    results: transactions.map((t) => ({ kind: "transaction" as const, ...mapBankTransaction(t) })),
  });
}
