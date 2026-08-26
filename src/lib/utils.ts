import type { Client, ClientStatus, Invoice, PaymentPlan } from "./types";

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getToday(): Date {
  return parseIso(todayIso());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIso(fromIso);
  const to = parseIso(toIso);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function getInvoiceBalance(invoice: Invoice): number {
  return Math.max(0, invoice.amount - invoice.amountPaid);
}

/** Days past due; negative means not yet due. Paid invoices return null. */
export function getDaysOverdue(invoice: Invoice): number | null {
  if (invoice.status === "paid") return null;
  return daysBetween(invoice.dueDate, todayIso());
}

export type AgingBucket = "not_due" | "0-30" | "31-60" | "60+";

export function getAgingBucket(invoice: Invoice): AgingBucket {
  const overdue = getDaysOverdue(invoice);
  if (overdue === null || overdue <= 0) return "not_due";
  if (overdue <= 30) return "0-30";
  if (overdue <= 60) return "31-60";
  return "60+";
}

export function getClientInvoices(clientId: string, invoices: Invoice[]): Invoice[] {
  return invoices.filter((inv) => inv.clientId === clientId);
}

export function getClientPaymentPlans(
  clientId: string,
  plans: PaymentPlan[]
): PaymentPlan[] {
  return plans.filter((p) => p.clientId === clientId);
}

export function getClientTotalOwed(clientId: string, invoices: Invoice[]): number {
  return getClientInvoices(clientId, invoices)
    .filter((inv) => inv.status !== "paid")
    .reduce((sum, inv) => sum + getInvoiceBalance(inv), 0);
}

export function getClientOldestOverdue(
  clientId: string,
  invoices: Invoice[]
): Invoice | null {
  const overdueInvoices = getClientInvoices(clientId, invoices)
    .filter((inv) => inv.status !== "paid")
    .filter((inv) => (getDaysOverdue(inv) ?? -1) > 0)
    .sort((a, b) => (getDaysOverdue(b) ?? 0) - (getDaysOverdue(a) ?? 0));
  return overdueInvoices[0] ?? null;
}

export function getClientStatus(
  clientId: string,
  invoices: Invoice[],
  plans: PaymentPlan[]
): ClientStatus {
  const hasActivePlan = getClientPaymentPlans(clientId, plans).some((plan) =>
    plan.installments.some((i) => !i.paid)
  );
  if (hasActivePlan) return "payment_plan";

  const hasOverdue = getClientInvoices(clientId, invoices)
    .filter((inv) => inv.status !== "paid")
    .some((inv) => (getDaysOverdue(inv) ?? -1) > 0);
  if (hasOverdue) return "overdue";

  return "current";
}

export function getClientById(clients: Client[], id: string): Client | undefined {
  return clients.find((c) => c.id === id);
}

export function isDueThisWeek(dueDateIso: string): boolean {
  const diff = daysBetween(todayIso(), dueDateIso);
  return diff >= 0 && diff <= 7;
}
