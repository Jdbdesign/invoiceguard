import type { BadgeVariant } from "@/components/ui/Badge";
import type { BankStatementUploadStatus, ClientStatus, Invoice } from "./types";
import { getAgingBucket } from "./utils";

export function invoiceStatusLabel(invoice: Invoice): {
  label: string;
  variant: BadgeVariant;
} {
  if (invoice.status === "paid") return { label: "Paid", variant: "success" };
  if (invoice.status === "payment_plan")
    return { label: "Payment Plan", variant: "info" };

  const bucket = getAgingBucket(invoice);
  const prefix = invoice.status === "partial" ? "Partial · " : "";

  if (bucket === "not_due") return { label: `${prefix}Current`, variant: "neutral" };
  if (bucket === "0-30")
    return { label: `${prefix}Overdue 0-30d`, variant: "warning" };
  if (bucket === "31-60")
    return { label: `${prefix}Overdue 31-60d`, variant: "orange" };
  return { label: `${prefix}Overdue 60+d`, variant: "danger" };
}

export function clientStatusLabel(status: ClientStatus): {
  label: string;
  variant: BadgeVariant;
} {
  if (status === "payment_plan") return { label: "Payment Plan", variant: "info" };
  if (status === "overdue") return { label: "Overdue", variant: "danger" };
  return { label: "Current", variant: "neutral" };
}

export function bankStatementUploadStatusLabel(status: BankStatementUploadStatus): {
  label: string;
  variant: BadgeVariant;
} {
  // Deliberately not "Needs review" — that text is already the Reconciliation
  // page's matching tab, which reviews ambiguous transaction-to-payment
  // candidates, an unrelated concept from this status (the statement's
  // parsed rows haven't been confirmed into transactions yet). Sharing the
  // label made it look like a pending match was silently missing from that
  // tab when actually no transaction existed yet for the matcher to see.
  if (status === "needs_review") return { label: "Review rows", variant: "warning" };
  if (status === "failed") return { label: "Failed", variant: "danger" };
  if (status === "reviewed") return { label: "Reviewed", variant: "success" };
  return { label: "Processing", variant: "neutral" };
}
