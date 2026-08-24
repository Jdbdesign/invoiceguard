export type InvoiceStatus = "unpaid" | "partial" | "paid" | "payment_plan";

export type ClientStatus = "current" | "overdue" | "payment_plan";

export type ReminderStage = "friendly" | "firm" | "final";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
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
  | "response_logged"
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
  channel?: "email" | "sms";
  message: string;
}

export interface ReminderSchedule {
  friendlyDays: number;
  firmDays: number;
  finalDays: number;
}
