import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity } from "@/lib/mappers";
import type { ReminderStage } from "@/lib/types";

const VALID_STAGES: ReminderStage[] = ["friendly", "firm", "final"];

function isReminderStage(value: unknown): value is ReminderStage {
  return typeof value === "string" && (VALID_STAGES as string[]).includes(value);
}

interface SendReminderRequestBody {
  subject?: unknown;
  body?: unknown;
  stage?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;

  let body: SendReminderRequestBody;
  try {
    body = (await request.json()) as SendReminderRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const emailBody = typeof body.body === "string" ? body.body.trim() : "";
  const stage: ReminderStage | null = isReminderStage(body.stage) ? body.stage : null;

  if (!subject || !emailBody) {
    return NextResponse.json(
      { error: "a drafted subject and body are required to send a reminder" },
      { status: 400 }
    );
  }

  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber },
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

  const activity = await prisma.activityLog.create({
    data: {
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      type: "reminder_sent",
      stage,
      message: `${subject}\n\n${emailBody}`,
    },
    include: { invoice: true },
  });

  return NextResponse.json({
    activity: mapActivity(activity),
  });
}
