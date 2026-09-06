import { Resend } from "resend";
import { render } from "react-email";
import { ReminderEmail } from "@/emails/ReminderEmail";
import { getActiveReceiptTemplate } from "@/lib/receiptTemplates";
import { formatCurrency, formatDate } from "@/lib/utils";

// VERCEL_ENV (not NODE_ENV, which is "production" for Preview builds too)
// is the only reliable signal that this is the real production deployment.
const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

// A missing FROM-address env var must never silently fall back to Resend's
// sandbox sender in production — onboarding@resend.dev can only deliver to
// the Resend account's own verified email, so every send to a real
// recipient would be rejected with no visible error anywhere (this is
// exactly what happened to RECEIPT_FROM_ADDRESS: it shipped without ever
// being added to Vercel, and receipts silently stopped sending). Outside
// production (local dev, Preview) the sandbox address is a fine default
// since no real inbox is on the line.
function resolveFromAddress(envVarName: string): string | null {
  const configured = process.env[envVarName];
  if (configured) return configured;
  if (IS_PRODUCTION) {
    console.error(
      `[CONFIG ERROR] ${envVarName} is not set in production — refusing to fall back to the Resend sandbox address (onboarding@resend.dev), which cannot deliver to real recipients.`
    );
    return null;
  }
  return "Remitrak <onboarding@resend.dev>";
}

const RESET_PASSWORD_FROM_ADDRESS = resolveFromAddress("RESET_PASSWORD_FROM_ADDRESS");
const REMINDER_FROM_ADDRESS = resolveFromAddress("REMINDER_FROM_ADDRESS");
const RECEIPT_FROM_ADDRESS = resolveFromAddress("RECEIPT_FROM_ADDRESS");
const BUSINESS_NAME = "Remitrak";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  if (!RESET_PASSWORD_FROM_ADDRESS) return false;
  try {
    // Constructed lazily (not at module scope) because the Resend SDK throws
    // synchronously in its constructor when the API key is missing/empty —
    // that throw must land inside this try/catch, not at import time, or it
    // takes down every route that imports this module before any request
    // handler code runs.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: RESET_PASSWORD_FROM_ADDRESS,
      to: [to],
      subject: "Reset your Remitrak password",
      html: `
        <p>We received a request to reset your Remitrak password.</p>
        <p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 45 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error("Failed to send password reset email:", error);
      return false;
    }
    return true;
  } catch (err) {
    // Resend's SDK returns { error } for API-level failures (bad/missing key,
    // unverified domain), but network-level failures (DNS, timeout) can still
    // throw. This path must never throw uncaught — forgot-password always
    // returns its generic response regardless of email delivery outcome.
    console.error("Failed to send password reset email:", err);
    return false;
  }
}

export async function sendReminderEmail(
  to: string,
  subject: string,
  body: string,
  invoiceNumber: string,
  description: string,
  balance: number,
  currency: string,
  dueDateIso: string,
  items?: { description: string; amount: number }[]
): Promise<boolean> {
  if (!REMINDER_FROM_ADDRESS) return false;
  try {
    const amountDue = formatCurrency(balance, currency);
    const dueDate = formatDate(dueDateIso);
    const element = ReminderEmail({
      invoiceNumber,
      description,
      amountDue,
      dueDate,
      body,
      items: items?.map((item) => ({
        description: item.description,
        amount: formatCurrency(item.amount, currency),
      })),
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    // See sendPasswordResetEmail above for why the client is constructed
    // lazily inside the try/catch rather than at module scope.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: REMINDER_FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error("Failed to send reminder email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send reminder email:", err);
    return false;
  }
}

// A receipt is a financial document — its content must be deterministic,
// fixed-template markup merged with real invoice data via plain string
// interpolation, never AI-drafted, so a hallucinated total or date can never
// reach a client. Unlike sendReminderEmail, none of the inputs here are
// free-text drafted elsewhere; every field is real, already-persisted data.
//
// Returns a discriminated result (rather than a bare boolean like the other
// send functions) because callers need to tell a config problem apart from
// a real delivery failure: sendPaymentReceipt's manual "Send receipt" route
// shows the user something actionable ("misconfigured — contact support")
// instead of implying the email bounced.
export type SendReceiptEmailResult =
  | { sent: true }
  | { sent: false; reason: "missing_from_address" | "send_failed" };

export async function sendReceiptEmail(
  to: string,
  clientName: string,
  invoiceNumber: string,
  description: string,
  amountPaid: number,
  currency: string,
  datePaidIso: string,
  activeReceiptTemplateId: string,
  businessName: string | null,
  logoUrl: string | null,
  items?: { description: string; amount: number }[]
): Promise<SendReceiptEmailResult> {
  if (!RECEIPT_FROM_ADDRESS) return { sent: false, reason: "missing_from_address" };
  try {
    const { Component } = getActiveReceiptTemplate(activeReceiptTemplateId);
    const element = Component({
      businessName: businessName ?? BUSINESS_NAME,
      logoUrl: logoUrl ?? undefined,
      clientName,
      invoiceNumber,
      description,
      amountPaid: formatCurrency(amountPaid, currency),
      datePaid: formatDate(datePaidIso),
      items: items?.map((item) => ({
        description: item.description,
        amount: formatCurrency(item.amount, currency),
      })),
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    // See sendPasswordResetEmail above for why the client is constructed
    // lazily inside the try/catch rather than at module scope.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: RECEIPT_FROM_ADDRESS,
      to: [to],
      subject: `Receipt for invoice ${invoiceNumber}`,
      html,
      text,
    });

    if (error) {
      console.error("Failed to send receipt email:", error);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("Failed to send receipt email:", err);
    return { sent: false, reason: "send_failed" };
  }
}
