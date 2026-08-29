import Anthropic from "@anthropic-ai/sdk";
import type { ReminderStage } from "./types";
import { formatCurrency } from "./utils";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

const STAGE_TONE: Record<ReminderStage, string> = {
  friendly:
    "Warm and low-pressure. Assume the missed payment was an oversight — no accusatory language.",
  firm: "Direct and clear. State the amount owed plainly and ask for payment now or a payment plan.",
  final:
    "Firm, clear, and urgent — this is the last reminder before the business reconsiders the relationship. State the amount owed and how overdue it is plainly, and request immediate payment by a firm deadline. Do NOT invent or imply specific consequences: no mention of collections agencies, service suspension, late fees, interest, or legal action unless those are given explicitly as real details in the invoice information below. It is fine to note, in general terms, that continued non-payment may affect the business relationship — without specifying what that means.",
};

export interface DraftReminderInput {
  stage: ReminderStage;
  clientName: string;
  invoiceNumber: string;
  description: string;
  balance: number;
  currency: string;
  dueDateIso: string;
  daysOverdue: number;
}

export interface DraftedReminder {
  subject: string;
  body: string;
}

export async function draftReminderEmail(
  input: DraftReminderInput
): Promise<DraftedReminder> {
  const amount = formatCurrency(input.balance, input.currency);

  const prompt = `Draft a ${input.stage} payment reminder email from InvoiceGuard, an accounts-receivable collections tool, to a client on behalf of the business they owe money to.

Tone: ${STAGE_TONE[input.stage]}

Details:
- Client: ${input.clientName}
- Invoice: ${input.invoiceNumber} — ${input.description}
- Amount owed: ${amount} (currency: ${input.currency})
- Original due date: ${input.dueDateIso}
- Days past due: ${Math.max(0, input.daysOverdue)}

Important: the client's currency is ${input.currency}. Write every amount in the email exactly as formatted above (e.g. "${amount}") — use that currency's correct symbol/format, never a "$" sign unless the currency is actually USD.

Important: do NOT invite the client to reply to this email for questions, clarification, or to arrange a payment plan (e.g. "just reply to this email" or "reply to let us know"). This inbox is not monitored. If the draft needs to reference getting in touch, phrase it generally (e.g. "get in touch with us") without implying email reply.

Respond with exactly this format and nothing else — no preamble, no markdown:
SUBJECT: <subject line>
BODY:
<email body as plain text, sign off as "The InvoiceGuard team">`;

  const response = await getClient().messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parseDraft(text, input);
}

function parseDraft(text: string, input: DraftReminderInput): DraftedReminder {
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]*)/i);
  const subject =
    subjectMatch?.[1]?.trim() || `Reminder: invoice ${input.invoiceNumber}`;
  const body = bodyMatch?.[1]?.trim() || text.trim();
  return { subject, body };
}
