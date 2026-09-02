import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInstallment, mapInvoice } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { formatCurrency, todayIso } from "@/lib/utils";
import { defaultInstallmentLabel, sanitizeInstallmentLabel } from "@/lib/paymentPlan";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

interface InstallmentPatchBody {
  label?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { id } = await params;

  // A body with a `label` key means "rename this installment" — distinct
  // from the paid/unpaid toggle, which every existing caller triggers with
  // no request body at all.
  let body: InstallmentPatchBody = {};
  const rawBody = await request.text();
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as InstallmentPatchBody;
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
  }
  const isLabelUpdate = "label" in body;

  const installment = await prisma.installment.findFirst({
    where: { id, paymentPlan: { invoice: { client: { ownerId: session.user.id } } } },
    include: {
      paymentPlan: {
        include: { installments: true, invoice: { include: { client: true } } },
      },
    },
  });
  if (!installment) {
    return NextResponse.json({ error: "installment not found" }, { status: 404 });
  }

  if (isLabelUpdate) {
    const updated = await prisma.installment.update({
      where: { id },
      data: { label: sanitizeInstallmentLabel(body.label) },
    });
    return NextResponse.json({ installment: mapInstallment(updated), activity: null });
  }

  const nowPaid = installment.status !== "paid";
  const invoice = installment.paymentPlan.invoice;

  // Marking an installment paid/unpaid moves money on the parent invoice
  // too — Invoice.balance must stay in lockstep or every "total owed"
  // figure derived from it (client detail, clients list, CSV export)
  // silently goes stale. Paying off the last installment completes the
  // invoice, matching how mark-paid/settle-payment-plan pair balance: 0
  // with status: "paid"; undoing that reverses both together.
  const newBalance = Math.max(
    0,
    invoice.balance + (nowPaid ? -installment.amount : installment.amount)
  );
  let newStatus = invoice.status;
  if (nowPaid && newBalance <= 0) {
    newStatus = "paid";
  } else if (!nowPaid && invoice.status === "paid" && newBalance > 0) {
    newStatus = "payment_plan";
  }

  const [updated, updatedInvoice] = await prisma.$transaction([
    prisma.installment.update({
      where: { id },
      data: {
        status: nowPaid ? "paid" : "pending",
        paidDate: nowPaid ? fromIsoDate(todayIso()) : null,
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { balance: newBalance, status: newStatus },
    }),
  ]);

  let activity = null;
  if (nowPaid) {
    const orderedInstallments = installment.paymentPlan.installments
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const position =
      orderedInstallments.findIndex((i) => i.id === installment.id) + 1;
    const amountLabel = formatCurrency(
      installment.amount,
      installment.paymentPlan.invoice.client.currency
    );
    const installmentLabel = installment.label || defaultInstallmentLabel(position);

    const created = await prisma.activityLog.create({
      data: {
        clientId: installment.paymentPlan.invoice.clientId,
        invoiceId: installment.paymentPlan.invoiceId,
        type: "installment_paid",
        message: `${installmentLabel} (${position} of ${orderedInstallments.length}) received — ${amountLabel} toward payment plan for invoice ${installment.paymentPlan.invoice.invoiceNumber}.`,
      },
      include: { invoice: true },
    });
    activity = mapActivity(created);
  }

  return NextResponse.json({
    installment: mapInstallment(updated),
    invoice: mapInvoice(updatedInvoice),
    activity,
  });
}
