import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapInvoice } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";

const EDITABLE_STATUSES = new Set(["unpaid", "partial", "paid"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;
  const body = await request.json();
  const clientId = String(body.clientId ?? "");
  const amount = Number(body.amount);
  const dueDate = String(body.dueDate ?? "");
  const description = String(body.description ?? "").trim();
  const status = String(body.status ?? "");

  if (
    !clientId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !dueDate ||
    !description ||
    !EDITABLE_STATUSES.has(status)
  ) {
    return NextResponse.json({ error: "invalid invoice input" }, { status: 400 });
  }

  const existing = await prisma.invoice.findUnique({
    where: { invoiceNumber },
    include: { paymentPlan: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const amountPaid = Math.max(0, existing.amount - existing.balance);
  const hasPaymentPlan = Boolean(existing.paymentPlan);
  const amountLocked = hasPaymentPlan || amountPaid > 0;

  // Amount/status are locked once a payment plan exists or any payment has
  // been recorded — ignore client-submitted changes to those fields rather
  // than trusting the request body, so a direct API call can't bypass the
  // same rule the Edit Invoice modal enforces.
  const finalAmount = amountLocked ? existing.amount : amount;
  const finalClientId = hasPaymentPlan ? existing.clientId : clientId;
  const finalStatus = hasPaymentPlan ? existing.status : status;
  const balance =
    finalStatus === "paid" ? 0 : Math.max(0, finalAmount - amountPaid);

  const invoice = await prisma.invoice.update({
    where: { invoiceNumber },
    data: {
      clientId: finalClientId,
      amount: finalAmount,
      balance,
      dueDate: fromIsoDate(dueDate),
      description,
      status: finalStatus,
    },
  });

  return NextResponse.json(mapInvoice(invoice));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber },
    include: { paymentPlan: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }

  await prisma.$transaction([
    ...(invoice.paymentPlan
      ? [
          prisma.installment.deleteMany({
            where: { paymentPlanId: invoice.paymentPlan.id },
          }),
          prisma.paymentPlan.delete({ where: { id: invoice.paymentPlan.id } }),
        ]
      : []),
    prisma.activityLog.deleteMany({ where: { invoiceId: invoice.id } }),
    prisma.invoice.delete({ where: { id: invoice.id } }),
  ]);

  return NextResponse.json({ success: true });
}
