"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageLoading } from "@/components/ui/Spinner";
import { useAppData } from "@/context/AppDataContext";
import {
  formatCurrency,
  formatDate,
  getAgingBucket,
  getClientById,
  getInvoiceBalance,
  isDueThisWeek,
} from "@/lib/utils";
import { ActivityIcon, activityIconVariant } from "@/components/ActivityIcon";

type CurrencyTotals = Record<string, number>;

function addTotal(totals: CurrencyTotals, currency: string, amount: number) {
  totals[currency] = (totals[currency] ?? 0) + amount;
}

export default function DashboardPage() {
  const { clients, invoices, paymentPlans, activityLog, loading } = useAppData();

  if (loading) {
    return <PageLoading label="Loading dashboard…" />;
  }

  const outstandingInvoices = invoices.filter((inv) => inv.status !== "paid");

  const totalOutstandingByCurrency: CurrencyTotals = {};
  const bucketTotals = {
    "0-30": {} as CurrencyTotals,
    "31-60": {} as CurrencyTotals,
    "60+": {} as CurrencyTotals,
  };
  for (const inv of outstandingInvoices) {
    const currency = getClientById(clients, inv.clientId)?.currency ?? "USD";
    addTotal(totalOutstandingByCurrency, currency, getInvoiceBalance(inv));
    const bucket = getAgingBucket(inv);
    if (bucket !== "not_due") addTotal(bucketTotals[bucket], currency, getInvoiceBalance(inv));
  }

  const summaryCards = [
    {
      label: "Total Outstanding",
      totals: totalOutstandingByCurrency,
      accent: "text-slate-900",
      icon: "wallet" as const,
    },
    {
      label: "Overdue 0-30 days",
      totals: bucketTotals["0-30"],
      accent: "text-amber-600",
      icon: "clock" as const,
    },
    {
      label: "Overdue 31-60 days",
      totals: bucketTotals["31-60"],
      accent: "text-orange-600",
      icon: "alert" as const,
    },
    {
      label: "Overdue 60+ days",
      totals: bucketTotals["60+"],
      accent: "text-rose-600",
      icon: "flag" as const,
    },
  ];

  const upcomingInstallments = paymentPlans
    .flatMap((plan) =>
      plan.installments
        .filter((inst) => !inst.paid && isDueThisWeek(inst.dueDate))
        .map((inst) => ({ plan, installment: inst }))
    )
    .sort(
      (a, b) =>
        new Date(a.installment.dueDate).getTime() -
        new Date(b.installment.dueDate).getTime()
    );

  const recentActivity = [...activityLog]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A snapshot of what&apos;s owed and what needs attention today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <SummaryIcon icon={card.icon} />
            </div>
            <SummaryValue totals={card.totals} accent={card.accent} />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Installments due this week"
            subtitle="Active payment plan installments"
          />
          <div className="divide-y divide-slate-100">
            {upcomingInstallments.length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-500">
                No installments due this week.
              </p>
            )}
            {upcomingInstallments.map(({ plan, installment }) => {
              const client = getClientById(clients, plan.clientId);
              return (
                <Link
                  key={installment.id}
                  href={`/clients/${plan.clientId}`}
                  className="flex items-center justify-between px-5 py-3.5 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {client?.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Due {formatDate(installment.dueDate)} · Plan {plan.id}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatCurrency(installment.amount, client?.currency)}
                  </p>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Recent activity" subtitle="Reminders sent and payments received" />
          <div className="divide-y divide-slate-100">
            {recentActivity.map((entry) => {
              const client = getClientById(clients, entry.clientId);
              return (
                <Link
                  key={entry.id}
                  href={`/clients/${entry.clientId}`}
                  className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${activityIconVariant(
                      entry.type
                    )}`}
                  >
                    <ActivityIcon type={entry.type} className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{client?.name}</span>{" "}
                      <span className="text-slate-500">
                        {activityVerb(entry.type)}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {entry.message}
                    </p>
                  </div>
                  <p className="flex-shrink-0 text-xs text-slate-400">
                    {formatDate(entry.date)}
                  </p>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function activityVerb(type: string): string {
  switch (type) {
    case "reminder_sent":
      return "was sent a reminder";
    case "client_reply":
      return "replied";
    case "payment_received":
      return "sent a payment";
    case "plan_created":
      return "started a payment plan";
    case "installment_paid":
      return "paid an installment";
    default:
      return "";
  }
}

function SummaryValue({ totals, accent }: { totals: CurrencyTotals; accent: string }) {
  const entries = Object.entries(totals);

  if (entries.length <= 1) {
    const [currency, amount] = entries[0] ?? ["USD", 0];
    return (
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${accent}`}>
        {formatCurrency(amount, currency)}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-0.5">
      {entries.map(([currency, amount]) => (
        <p key={currency} className={`text-base font-semibold tabular-nums ${accent}`}>
          {formatCurrency(amount, currency)}{" "}
          <span className="text-xs font-medium text-slate-400">{currency}</span>
        </p>
      ))}
    </div>
  );
}

function SummaryIcon({ icon }: { icon: "wallet" | "clock" | "alert" | "flag" }) {
  const paths: Record<typeof icon, React.ReactNode> = {
    wallet: (
      <>
        <path d="M3 7.5A1.5 1.5 0 014.5 6h13A1.5 1.5 0 0119 7.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 16.5v-9z" />
        <path d="M15.5 12.75a.75.75 0 100-1.5.75.75 0 000 1.5z" fill="currentColor" stroke="none" />
        <path d="M3 9.5h16" />
      </>
    ),
    clock: (
      <>
        <circle cx="11" cy="11" r="7.5" />
        <path strokeLinecap="round" d="M11 6.8V11l3 2" />
      </>
    ),
    alert: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.5l8.5 15h-17l8.5-15z" />
        <path strokeLinecap="round" d="M11 9.5v3.2" />
        <circle cx="11" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
    flag: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3.5v15" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 4.5h10l-2.2 3.2L15 11H5" />
      </>
    ),
  };
  return (
    <svg
      className="h-4 w-4 text-slate-400"
      viewBox="0 0 22 22"
      fill="none"
      strokeWidth={1.6}
      stroke="currentColor"
    >
      {paths[icon]}
    </svg>
  );
}
