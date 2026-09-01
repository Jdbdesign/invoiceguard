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
}

/** Whole-list share view row — the same fields the authenticated Clients
 * list actually renders, deliberately excluding phone (present on
 * ClientListItem/Client but never shown on that page). */
export type SharedClientSummary = Omit<ClientListItem, "phone">;

export interface Invoice {
  id: string;
  clientId: string;
  amount: number;
  amountPaid: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  description: string;
}

export interface Installment {
  id: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidDate?: string;
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
  | "installment_paid";

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
}
