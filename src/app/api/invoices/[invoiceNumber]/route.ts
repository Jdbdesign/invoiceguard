import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapInvoice } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";
import { INVOICE_ITEMS_INCLUDE, parseInvoiceItems, sumInvoiceItems } from "@/lib/invoiceItems";

const EDITABLE_STATUSES = new Set(["unpaid", "partial", "paid"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { invoiceNumber } = await params;
  const body = await request.json();
  const clientId = String(body.clientId ?? "");
  const dueDate = String(body.dueDate ?? "");
  const description = String(body.description ?? "").trim();
  const status = String(body.status ?? "");

  const itemsInput = parseInvoiceItems(body.items);
  if (itemsInput === null) {
    return NextResponse.json({ error: "invalid line item input" }, { status: 400 });
  }
  const submittedAmount =
    itemsInput.length > 0 ? sumInvoiceItems(itemsInput) : Number(body.amount);

  if (
    !clientId ||
    !Number.isFinite(submittedAmount) ||
    submittedAmount <= 0 ||
    !dueDate ||
    !description ||
    !EDITABLE_STATUSES.has(status)
  ) {
    return NextResponse.json({ error: "invalid invoice input" }, { status: 400 });
  }

  const existing = await prisma.invoice.findFirst({
    where: { invoiceNumber, client: { ownerId: session.user.id } },
    include: { paymentPlan: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, ownerId: session.user.id },
  });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const amountPaid = Math.max(0, existing.amount - existing.balance);
  const hasPaymentPlan = Boolean(existing.paymentPlan);
  const amountLocked = hasPaymentPlan || amountPaid > 0;

  // Amount/status/items are locked once a payment plan exists or any payment
  // has been recorded — ignore client-submitted changes to those fields
  // rather than trusting the request body, so a direct API call can't bypass
  // the same rule the Edit Invoice modal enforces. Items follow the same
  // rule as amount since they're what the amount is derived from.
  const finalAmount = amountLocked ? existing.amount : submittedAmount;
  const finalClientId = hasPaymentPlan ? existing.clientId : clientId;
  const finalStatus = hasPaymentPlan ? existing.status : status;
  const balance =
    finalStatus === "paid" ? 0 : Math.max(0, finalAmount - amountPaid);

  const invoice = await prisma.$transaction(async (tx) => {
    if (!amountLocked) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      if (itemsInput.length > 0) {
        await tx.invoiceItem.createMany({
          data: itemsInput.map((item, index) => ({
            invoiceId: existing.id,
            description: item.description,
            amount: item.amount,
            position: index,
          })),
        });
      }
    }
    return tx.invoice.update({
      where: { invoiceNumber },
      data: {
        clientId: finalClientId,
        amount: finalAmount,
        balance,
        dueDate: fromIsoDate(dueDate),
        description,
        status: finalStatus,
      },
      include: { items: INVOICE_ITEMS_INCLUDE },
    });
  });

  return NextResponse.json(mapInvoice(invoice));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { invoiceNumber } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber, client: { ownerId: session.user.id } },
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
    prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } }),
    prisma.invoice.delete({ where: { id: invoice.id } }),
  ]);

  return NextResponse.json({ success: true });
}
