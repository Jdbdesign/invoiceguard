import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInstallment, mapInvoice } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { formatCurrency, todayIso } from "@/lib/utils";
import { auth } from "@/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json({
    installments: installmentRows.map(mapInstallment),
    invoice: mapInvoice(updatedInvoice),
    activity: mapActivity(activity),
  });
}
