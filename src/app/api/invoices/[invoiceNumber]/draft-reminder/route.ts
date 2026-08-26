import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toIsoDate } from "@/lib/dateSerialization";
import { daysBetween, todayIso } from "@/lib/utils";
import { determineReminderStage } from "@/lib/reminderStage";
import { draftReminderEmail } from "@/lib/claude";
import { mapSettings } from "@/lib/mappers";
import { getOrCreateSettings } from "@/lib/settings";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber },
    include: { client: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json(
      { error: "invoice is already paid" },
      { status: 400 }
    );
  }

  const settingsRow = await getOrCreateSettings();
  const schedule = mapSettings(settingsRow);
  const dueDateIso = toIsoDate(invoice.dueDate);
  const daysOverdue = daysBetween(dueDateIso, todayIso());
  const stage = determineReminderStage(daysOverdue, schedule);

  try {
    const drafted = await draftReminderEmail({
      stage,
      clientName: invoice.client.name,
      invoiceNumber: invoice.invoiceNumber,
      description: invoice.description,
      balance: invoice.balance,
      currency: invoice.client.currency,
      dueDateIso,
      daysOverdue,
    });

    return NextResponse.json({
      subject: drafted.subject,
      body: drafted.body,
      stage,
    });
  } catch (error) {
    console.error("Claude reminder drafting failed", error);
    return NextResponse.json(
      { error: "Failed to draft reminder email via Claude API" },
      { status: 502 }
    );
  }
}
