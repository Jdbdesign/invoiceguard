import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity } from "@/lib/mappers";
import type { ReminderStage } from "@/lib/types";
import { auth } from "@/auth";
import { sendReminderEmail } from "@/lib/email";
import { toIsoDate } from "@/lib/dateSerialization";

const VALID_STAGES: ReminderStage[] = ["friendly", "firm", "final"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber, client: { ownerId: session.user.id } },
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

  if (!EMAIL_RE.test(invoice.client.email)) {
    return NextResponse.json(
      { error: "client has no valid email on file" },
      { status: 400 }
    );
  }

  const sent = await sendReminderEmail(
    invoice.client.email,
    subject,
    emailBody,
    invoice.invoiceNumber,
    invoice.description,
    invoice.balance,
    invoice.client.currency,
    toIsoDate(invoice.dueDate)
  );
  if (!sent) {
    return NextResponse.json(
      { error: "failed to send reminder email — please try again" },
      { status: 502 }
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
