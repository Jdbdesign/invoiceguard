import type { ReminderStage } from "./types";

export function getTemplatePreview(
  stage: ReminderStage,
  days: number
): { subject: string; tone: string; body: string } {
  if (stage === "friendly") {
    return {
      subject: "A friendly reminder about invoice INV-1042",
      tone: "Warm, low-pressure — assumes an oversight.",
      body: `Hi there,\n\nJust a friendly note that invoice INV-1042 for $2,450.00 was due ${days} day${
        days === 1 ? "" : "s"
      } ago. It's possible this slipped through, so no worries if it's already on its way.\n\nYou can view and pay the invoice here: [Pay invoice]\n\nLet us know if you have any questions — happy to help.\n\nThanks,\nThe InvoiceGuard team`,
    };
  }
  if (stage === "firm") {
    return {
      subject: "Action needed: invoice INV-1042 is past due",
      tone: "Direct and clear — states the amount and asks for a plan.",
      body: `Hello,\n\nInvoice INV-1042 for $2,450.00 is now ${days} days past due. We haven't received payment or a response to our earlier reminder.\n\nPlease submit payment as soon as possible, or reply to this email if you'd like to set up a payment plan.\n\nView invoice: [Pay invoice]\n\nBest,\nThe InvoiceGuard team`,
    };
  }
  return {
    subject: "Final notice: invoice INV-1042 requires immediate attention",
    tone: "Firm, clear, and urgent — no invented consequences.",
    body: `This is a final notice.\n\nInvoice INV-1042 for $2,450.00 is now ${days} days past due. Despite previous reminders, this balance remains unpaid.\n\nPlease remit payment in full within 5 business days. Continued non-payment may affect our ongoing business relationship.\n\nView invoice: [Pay invoice]\n\nRegards,\nThe InvoiceGuard team`,
  };
}
