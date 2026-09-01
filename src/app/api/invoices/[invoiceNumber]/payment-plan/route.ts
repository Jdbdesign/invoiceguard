import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapActivity, mapPaymentPlan } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";
import { formatCurrency } from "@/lib/utils";
import {
  computeInstallmentSchedule,
  isValidFrequency,
  isValidInstallmentCount,
  sanitizeInstallmentLabel,
} from "@/lib/paymentPlan";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface PaymentPlanRequestBody {
  installmentCount?: unknown;
  firstDueDate?: unknown;
  frequency?: unknown;
  labels?: unknown;
}

// `new Date("YYYY-MM-DDT...")` silently rolls over out-of-range days/months
// (e.g. "2026-02-31" becomes 2026-03-03) instead of producing an Invalid
// Date, so a NaN check alone can't detect a calendar-invalid date. Round-trip
// the parsed components against the original string instead.
function isValidCalendarDate(iso: string): boolean {
  const parsed = fromIsoDate(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  const [year, month, day] = iso.split("-").map(Number);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { invoiceNumber } = await params;
  let body: PaymentPlanRequestBody;
  try {
    body = (await request.json()) as PaymentPlanRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const installmentCount = Number(body.installmentCount);
  const firstDueDate = String(body.firstDueDate ?? "");
  const frequency = String(body.frequency ?? "");
  const rawLabels = Array.isArray(body.labels) ? body.labels : [];
  const labels = rawLabels.map(sanitizeInstallmentLabel);

  if (
    !isValidInstallmentCount(installmentCount) ||
    !ISO_DATE.test(firstDueDate) ||
    !isValidCalendarDate(firstDueDate) ||
    !isValidFrequency(frequency)
  ) {
    return NextResponse.json(
      { error: "invalid payment plan input" },
      { status: 400 }
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber, client: { ownerId: session.user.id } },
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

  try {
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
              label: labels[index] ?? null,
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "invoice already has a payment plan" },
        { status: 400 }
      );
    }
    throw error;
  }
}
