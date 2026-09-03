import { Resend } from "resend";
import { render } from "react-email";
import { ReminderEmail } from "@/emails/ReminderEmail";
import { getActiveReceiptTemplate } from "@/lib/receiptTemplates";
import { formatCurrency, formatDate } from "@/lib/utils";

const FROM_ADDRESS = "Remitrak <onboarding@resend.dev>";
const REMINDER_FROM_ADDRESS =
  process.env.REMINDER_FROM_ADDRESS ?? "Remitrak <onboarding@resend.dev>";
const RECEIPT_FROM_ADDRESS =
  process.env.RECEIPT_FROM_ADDRESS ?? "Remitrak <onboarding@resend.dev>";
const BUSINESS_NAME = "Remitrak";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  try {
    // Constructed lazily (not at module scope) because the Resend SDK throws
    // synchronously in its constructor when the API key is missing/empty —
    // that throw must land inside this try/catch, not at import time, or it
    // takes down every route that imports this module before any request
    // handler code runs.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
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
export async function sendReceiptEmail(
  to: string,
  clientName: string,
  invoiceNumber: string,
  description: string,
  amountPaid: number,
  currency: string,
  datePaidIso: string,
  activeReceiptTemplateId: string,
  items?: { description: string; amount: number }[]
): Promise<boolean> {
  try {
    const { Component } = getActiveReceiptTemplate(activeReceiptTemplateId);
    const element = Component({
      businessName: BUSINESS_NAME,
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
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send receipt email:", err);
    return false;
  }
}
