import { toIsoDate } from "./dateSerialization";
import type {
  ActivityEntry,
  ActivityType,
  AppSettings,
  Client,
  Installment,
  Invoice,
  InvoiceStatus,
  PaymentPlan,
  ReminderStage,
} from "./types";

type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  currency: string;
};
type InvoiceRow = {
  id: string;
  clientId: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  balance: number;
  dueDate: Date;
  status: string;
  createdAt: Date;
};
type ActivityRow = {
  id: string;
  clientId: string;
  invoiceId: string | null;
  type: string;
  stage: string | null;
  message: string;
  createdAt: Date;
  invoice?: { invoiceNumber: string } | null;
};
type InstallmentRow = {
  id: string;
  amount: number;
  dueDate: Date;
  paidDate: Date | null;
  status: string;
  label: string | null;
};
type PaymentPlanRow = {
  id: string;
  totalAmount: number;
  startDate: Date;
  invoice: { clientId: string; invoiceNumber: string };
  installments: InstallmentRow[];
};
type SettingsRow = {
  friendlyReminderDays: number;
  firmReminderDays: number;
  finalNoticeDays: number;
  passwordReconfirmMinutes: number;
};

export function mapClient(c: ClientRow): Client {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    currency: c.currency,
  };
}

export function mapInvoice(inv: InvoiceRow): Invoice {
  return {
    id: inv.invoiceNumber,
    clientId: inv.clientId,
    amount: inv.amount,
    amountPaid: Math.max(0, inv.amount - inv.balance),
    issueDate: toIsoDate(inv.createdAt),
    dueDate: toIsoDate(inv.dueDate),
    status: inv.status as InvoiceStatus,
    description: inv.description,
  };
}

export function mapActivity(a: ActivityRow): ActivityEntry {
  return {
    id: a.id,
    clientId: a.clientId,
    invoiceId: a.invoice?.invoiceNumber ?? a.invoiceId ?? undefined,
    type: a.type as ActivityType,
    date: toIsoDate(a.createdAt),
    stage: (a.stage as ReminderStage | null) ?? undefined,
    message: a.message,
  };
}

export function mapInstallment(i: InstallmentRow): Installment {
  return {
    id: i.id,
    amount: i.amount,
    dueDate: toIsoDate(i.dueDate),
    paid: i.status === "paid",
    paidDate: i.paidDate ? toIsoDate(i.paidDate) : undefined,
    label: i.label ?? undefined,
  };
}

export function mapPaymentPlan(p: PaymentPlanRow): PaymentPlan {
  return {
    id: p.id,
    clientId: p.invoice.clientId,
    invoiceId: p.invoice.invoiceNumber,
    totalAmount: p.totalAmount,
    startDate: toIsoDate(p.startDate),
    installments: p.installments
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map(mapInstallment),
  };
}

export function mapSettings(s: SettingsRow): AppSettings {
  return {
    friendlyDays: s.friendlyReminderDays,
    firmDays: s.firmReminderDays,
    finalDays: s.finalNoticeDays,
    passwordReconfirmMinutes: s.passwordReconfirmMinutes,
  };
}
