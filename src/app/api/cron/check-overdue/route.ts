import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapSettings } from "@/lib/mappers";
import { toIsoDate } from "@/lib/dateSerialization";
import { daysBetween, todayIso } from "@/lib/utils";
import { crossedStageToday } from "@/lib/reminderStage";
import { draftReminderEmail } from "@/lib/claude";
import { getOrCreateSettings } from "@/lib/settings";

const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000;

async function alreadyRemindedRecently(
  invoiceId: string,
  stage: string | null
): Promise<boolean> {
  const recent = await prisma.activityLog.findFirst({
    where: {
      invoiceId,
      type: "reminder_sent",
      stage,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
  });
  return recent !== null;
}

export async function POST() {
  const settingsRow = await getOrCreateSettings();
  const schedule = mapSettings(settingsRow);
  const today = todayIso();

  const results: { invoiceNumber: string; stage: string; clientName: string }[] = [];

  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["unpaid", "partial"] } },
    include: { client: true },
  });

  for (const invoice of invoices) {
    const dueDateIso = toIsoDate(invoice.dueDate);
    const daysOverdue = daysBetween(dueDateIso, today);
    const stage = crossedStageToday(daysOverdue, schedule);
    if (!stage) continue;
    if (await alreadyRemindedRecently(invoice.id, stage)) continue;

    try {
      const drafted = await draftReminderEmail({
        stage,
        clientName: invoice.client.name,
        invoiceNumber: invoice.invoiceNumber,
        description: invoice.description,
        balance: invoice.balance,
        dueDateIso,
        daysOverdue,
      });

      await prisma.activityLog.create({
        data: {
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          type: "reminder_sent",
          stage,
          message: `${drafted.subject}\n\n${drafted.body}`,
        },
      });

      results.push({
        invoiceNumber: invoice.invoiceNumber,
        stage,
        clientName: invoice.client.name,
      });
    } catch (error) {
      console.error(`Failed to draft reminder for ${invoice.invoiceNumber}`, error);
    }
  }

  const pendingInstallments = await prisma.installment.findMany({
    where: { status: "pending" },
    include: {
      paymentPlan: { include: { invoice: { include: { client: true } } } },
    },
  });

  for (const installment of pendingInstallments) {
    const dueDateIso = toIsoDate(installment.dueDate);
    const daysOverdue = daysBetween(dueDateIso, today);
    if (daysOverdue !== 0) continue;

    const invoice = installment.paymentPlan.invoice;
    if (await alreadyRemindedRecently(invoice.id, null)) continue;

    try {
      const drafted = await draftReminderEmail({
        stage: "friendly",
        clientName: invoice.client.name,
        invoiceNumber: invoice.invoiceNumber,
        description: `Payment plan installment for ${invoice.description}`,
        balance: installment.amount,
        dueDateIso,
        daysOverdue: 0,
      });

      await prisma.activityLog.create({
        data: {
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          type: "reminder_sent",
          stage: null,
          message: `${drafted.subject}\n\n${drafted.body}`,
        },
      });

      results.push({
        invoiceNumber: invoice.invoiceNumber,
        stage: "installment due",
        clientName: invoice.client.name,
      });
    } catch (error) {
      console.error(
        `Failed to draft installment reminder for ${invoice.invoiceNumber}`,
        error
      );
    }
  }

  return NextResponse.json({ remindersSent: results.length, results });
}
