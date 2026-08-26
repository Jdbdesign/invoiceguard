import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInstallment } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { todayIso } from "@/lib/utils";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const installment = await prisma.installment.findUnique({
    where: { id },
    include: {
      paymentPlan: {
        include: { installments: true, invoice: true },
      },
    },
  });
  if (!installment) {
    return NextResponse.json({ error: "installment not found" }, { status: 404 });
  }

  const nowPaid = installment.status !== "paid";

  const updated = await prisma.installment.update({
    where: { id },
    data: {
      status: nowPaid ? "paid" : "pending",
      paidDate: nowPaid ? fromIsoDate(todayIso()) : null,
    },
  });

  let activity = null;
  if (nowPaid) {
    const orderedInstallments = installment.paymentPlan.installments
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const position =
      orderedInstallments.findIndex((i) => i.id === installment.id) + 1;
    const amountLabel = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(installment.amount);

    const created = await prisma.activityLog.create({
      data: {
        clientId: installment.paymentPlan.invoice.clientId,
        invoiceId: installment.paymentPlan.invoiceId,
        type: "installment_paid",
        message: `Installment ${position} of ${orderedInstallments.length} received — ${amountLabel} toward payment plan for invoice ${installment.paymentPlan.invoice.invoiceNumber}.`,
      },
      include: { invoice: true },
    });
    activity = mapActivity(created);
  }

  return NextResponse.json({
    installment: mapInstallment(updated),
    activity,
  });
}
