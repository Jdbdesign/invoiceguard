import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInstallment } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { formatCurrency, todayIso } from "@/lib/utils";
import { auth } from "@/auth";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

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
    const amountLabel = formatCurrency(
      installment.amount,
      installment.paymentPlan.invoice.client.currency
    );

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
