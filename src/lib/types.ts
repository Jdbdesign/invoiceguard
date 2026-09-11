export type InvoiceStatus = "unpaid" | "partial" | "paid" | "payment_plan";

export type ClientStatus = "current" | "overdue" | "payment_plan";

export type ReminderStage = "friendly" | "firm" | "final";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  currency: string;
}

/** Client row shape returned by the paginated /api/clients endpoint, with
 * per-client aggregates computed server-side instead of derived from the
 * full invoices/paymentPlans arrays. */
export interface ClientListItem extends Client {
  totalOwed: number;
  oldestOverdue: { id: string; dueDate: string } | null;
  status: ClientStatus;
  /** When this client was added — audit-trail only, not shown on the public
   * share view (see SharedClientSummary). */
  createdAt: string;
}

/** Whole-list share view row — the same fields the authenticated Clients
 * list actually renders, deliberately excluding phone (present on
 * ClientListItem/Client but never shown on that page) and createdAt
 * (an internal audit-trail field with no reason to be public). */
export type SharedClientSummary = Omit<ClientListItem, "phone" | "createdAt">;

export interface InvoiceItem {
  id: string;
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  clientId: string;
  amount: number;
  amountPaid: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  description: string;
  receiptSentAt?: string;
  items: InvoiceItem[];
}

export interface Installment {
  id: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidDate?: string;
  label?: string;
}

export interface PaymentPlan {
  id: string;
  clientId: string;
  invoiceId: string;
  totalAmount: number;
  startDate: string;
  installments: Installment[];
}

export type ActivityType =
  | "reminder_sent"
  | "client_reply"
  | "payment_received"
  | "plan_created"
  | "installment_paid"
  | "receipt_sent";

export interface ActivityEntry {
  id: string;
  clientId: string;
  invoiceId?: string;
  type: ActivityType;
  date: string;
  stage?: ReminderStage;
  message: string;
}

export interface ReminderSchedule {
  friendlyDays: number;
  firmDays: number;
  finalDays: number;
}

export interface AppSettings extends ReminderSchedule {
  passwordReconfirmMinutes: number;
  sendReceiptImmediately: boolean;
  activeReceiptTemplateId: string;
  businessName: string | null;
  businessType: string | null;
  logoUrl: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  country: string | null;
}

export type BankStatementUploadStatus =
  | "uploaded"
  | "parsing"
  | "needs_review"
  | "failed"
  | "reviewed";

export interface Payment {
  id: string;
  invoiceId: string;
  installmentId?: string;
  amount: number;
  paidDate: string;
  reconciledAt?: string;
  bankTransactionId?: string;
}

export interface BankStatementUpload {
  id: string;
  fileUrl: string;
  fileName: string;
  status: BankStatementUploadStatus;
  errorMessage?: string;
  /** Full ISO datetime (not date-only) — this is when the upload happened. */
  createdAt: string;
  reviewedAt?: string;
}

export interface BankTransaction {
  id: string;
  uploadId: string;
  /** The originating statement's fileName, when the query that produced this
   * transaction joined it in — undefined only means "not fetched," never
   * "no statement," since uploadId is a required FK. */
  uploadFileName?: string;
  date: string;
  description: string;
  amount: number;
  ignoredAt?: string;
}

/** An unpaid invoice offered by /api/reconciliation/search as a "Link
 * manually" target in its own right (not just via an already-recorded
 * Payment) — only surfaced when its remaining balance exactly matches the
 * bank transaction being linked and its currency matches
 * BANK_TRANSACTION_CURRENCY. Linking one creates the Payment on confirm. */
export interface LinkableInvoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  currency: string;
  dueDate: string;
}
