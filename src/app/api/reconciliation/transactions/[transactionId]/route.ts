import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction } from "@/lib/mappers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transactionId } = await params;
  const body = (await request.json()) as { ignored?: unknown };
  if (body.ignored !== true) {
    return NextResponse.json({ error: "only { ignored: true } is supported" }, { status: 400 });
  }

  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, ownerId: session.user.id },
  });
  if (!transaction) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  const updated = await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { ignoredAt: new Date() },
  });

  return NextResponse.json({ transaction: mapBankTransaction(updated) });
}
