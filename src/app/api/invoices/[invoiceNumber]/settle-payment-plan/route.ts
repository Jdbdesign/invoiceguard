import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInstallment, mapInvoice } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { formatCurrency, todayIso } from "@/lib/utils";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";
import { getOrCreateSettings } from "@/lib/settings";
import { sendPaymentReceipt } from "@/lib/receipts";
import { INVOICE_ITEMS_INCLUDE } from "@/lib/invoiceItems";

export async function POST(
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
    include: {
      client: true,
      paymentPlan: { include: { installments: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  // Deriving the plan from the invoice's own relation (rather than
  // trusting a client-supplied plan id) means it can never belong to a
  // different invoice.
  if (!invoice.paymentPlan) {
    return NextResponse.json(
      { error: "invoice has no associated payment plan" },
      { status: 400 }
    );
  }

  const plan = invoice.paymentPlan;
  const unpaid = plan.installments.filter((i) => i.status !== "paid");
  if (unpaid.length === 0) {
    return NextResponse.json(
      { error: "payment plan is already settled" },
      { status: 400 }
    );
  }

  const remaining = unpaid.reduce((sum, i) => sum + i.amount, 0);
  const paidDate = fromIsoDate(todayIso());
  const amountLabel = formatCurrency(remaining, invoice.client.currency);
  const countLabel = `${unpaid.length} installment${unpaid.length === 1 ? "" : "s"}`;

  const [, installmentRows, updatedInvoice, activity] = await prisma.$transaction([
    prisma.installment.updateMany({
      where: { paymentPlanId: plan.id, status: { not: "paid" } },
      data: { status: "paid", paidDate },
    }),
    prisma.installment.findMany({ where: { paymentPlanId: plan.id } }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", balance: 0 },
      include: { items: INVOICE_ITEMS_INCLUDE },
    }),
    prisma.activityLog.create({
      data: {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        type: "payment_received",
        message: `Remaining balance of ${amountLabel} (${countLabel}) paid in full — settled by ${session.user.email}.`,
      },
      include: { invoice: true },
    }),
  ]);

  let finalInvoice = updatedInvoice;
  let receiptActivity = null;
  const settings = await getOrCreateSettings(session.user.id);
  if (settings.sendReceiptImmediately && !updatedInvoice.receiptSentAt) {
    const receiptResult = await sendPaymentReceipt(
      {
        id: updatedInvoice.id,
        clientId: updatedInvoice.clientId,
        invoiceNumber: updatedInvoice.invoiceNumber,
        description: updatedInvoice.description,
        amount: updatedInvoice.amount,
        client: invoice.client,
        items: updatedInvoice.items,
      },
      settings.activeReceiptTemplateId
    );
    if (receiptResult) {
      finalInvoice = receiptResult.invoice;
      receiptActivity = mapActivity(receiptResult.activity);
    }
  }

  return NextResponse.json({
    installments: installmentRows.map(mapInstallment),
    invoice: mapInvoice(finalInvoice),
    activity: mapActivity(activity),
    receiptActivity,
  });
}
