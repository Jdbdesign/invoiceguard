import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapPaymentPlan } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { formatCurrency } from "@/lib/utils";
import {
  computeInstallmentSchedule,
  isValidFrequency,
  isValidInstallmentCount,
} from "@/lib/paymentPlan";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;
  const body = await request.json();
  const installmentCount = Number(body.installmentCount);
  const firstDueDate = String(body.firstDueDate ?? "");
  const frequency = String(body.frequency ?? "");

  if (
    !isValidInstallmentCount(installmentCount) ||
    !ISO_DATE.test(firstDueDate) ||
    !isValidFrequency(frequency)
  ) {
    return NextResponse.json(
      { error: "invalid payment plan input" },
      { status: 400 }
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber },
    include: { client: true, paymentPlan: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.paymentPlan) {
    return NextResponse.json(
      { error: "invoice already has a payment plan" },
      { status: 400 }
    );
  }
  if (invoice.status === "paid" || invoice.balance <= 0) {
    return NextResponse.json(
      { error: "invoice is already fully paid" },
      { status: 400 }
    );
  }

  const remaining = invoice.balance;
  const schedule = computeInstallmentSchedule(
    remaining,
    installmentCount,
    firstDueDate,
    frequency
  );
  const amountLabel = formatCurrency(remaining, invoice.client.currency);

  const [plan, , activity] = await prisma.$transaction([
    prisma.paymentPlan.create({
      data: {
        invoiceId: invoice.id,
        totalAmount: remaining,
        startDate: fromIsoDate(firstDueDate),
        installments: {
          create: schedule.map((installment, index) => ({
            installmentNumber: index + 1,
            amount: installment.amount,
            dueDate: fromIsoDate(installment.dueDate),
            status: "pending",
          })),
        },
      },
      include: { installments: true, invoice: true },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "payment_plan" },
    }),
    prisma.activityLog.create({
      data: {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        type: "plan_created",
        message: `Payment plan established for ${invoice.invoiceNumber} — ${amountLabel} across ${installmentCount} ${frequency} installments.`,
      },
      include: { invoice: true },
    }),
  ]);

  return NextResponse.json({
    plan: mapPaymentPlan(plan),
    activity: mapActivity(activity),
  });
}
