import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { paymentId } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { client: { ownerId: session.user.id } } },
  });
  if (!payment) return NextResponse.json({ error: "payment not found" }, { status: 404 });

  await prisma.payment.update({
    where: { id: paymentId },
    data: { reconciledAt: null, bankTransactionId: null },
  });

  return NextResponse.json({ ok: true });
}
