import { prisma } from "./db";
import { sendReceiptEmail } from "./email";
import { formatCurrency, todayIso } from "./utils";
import { INVOICE_ITEMS_INCLUDE } from "./invoiceItems";

interface ReceiptInvoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  client: { email: string; name: string; currency: string };
  items?: { description: string; amount: number }[];
}

// Shared by every trigger point (mark-paid, settle-payment-plan,
// installments/[id]'s auto-flip, and the manual "Send receipt" route) so
// duplicate-send prevention and the ActivityLog entry are written in exactly
// one place. Sends the email first, then persists — a failed send leaves
// receiptSentAt untouched so the invoice still surfaces "Send receipt" for a
// retry, and never fabricates a log entry for an email that didn't go out.
export async function sendPaymentReceipt(invoice: ReceiptInvoice) {
  const datePaidIso = todayIso();
  const sent = await sendReceiptEmail(
    invoice.client.email,
    invoice.client.name,
    invoice.invoiceNumber,
    invoice.description,
    invoice.amount,
    invoice.client.currency,
    datePaidIso,
    invoice.items
  );
  if (!sent) return null;

  const amountLabel = formatCurrency(invoice.amount, invoice.client.currency);
  const [updatedInvoice, activity] = await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { receiptSentAt: new Date() },
      include: { items: INVOICE_ITEMS_INCLUDE },
    }),
    prisma.activityLog.create({
      data: {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        type: "receipt_sent",
        message: `Payment receipt for invoice ${invoice.invoiceNumber} (${amountLabel}) sent to ${invoice.client.email}.`,
      },
      include: { invoice: true },
    }),
  ]);

  return { invoice: updatedInvoice, activity };
}
