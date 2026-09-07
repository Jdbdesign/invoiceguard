import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction, mapPayment } from "@/lib/mappers";

const RESULT_LIMIT = 20;
const AMOUNT_EPSILON = 0.01;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = session.user.id;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();

  if (type !== "payment" && type !== "transaction") {
    return NextResponse.json({ error: "type must be 'payment' or 'transaction'" }, { status: 400 });
  }
  if (!q) return NextResponse.json({ results: [] });

  const numericQuery = Number(q);
  const isAmountQuery = Number.isFinite(numericQuery);

  if (type === "payment") {
    const payments = await prisma.payment.findMany({
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
    });
    return NextResponse.json({ results: payments.map(mapPayment) });
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      ownerId,
      ignoredAt: null,
      payment: null,
      ...(isAmountQuery
        ? { amount: { gte: numericQuery - AMOUNT_EPSILON, lte: numericQuery + AMOUNT_EPSILON } }
        : { description: { contains: q, mode: "insensitive" } }),
    },
    take: RESULT_LIMIT,
  });
  return NextResponse.json({ results: transactions.map(mapBankTransaction) });
}
