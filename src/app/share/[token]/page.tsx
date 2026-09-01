"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoading } from "@/components/ui/Spinner";
import { Pagination } from "@/components/ui/Pagination";
import { invoiceStatusLabel, clientStatusLabel } from "@/lib/badgeHelpers";
import { usePaginatedResource } from "@/lib/usePaginatedResource";
import type { ActivityEntry, Client, Invoice, PaymentPlan, SharedClientSummary } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  getClientInvoices,
  getClientPaymentPlans,
  getClientStatus,
  getClientTotalOwed,
  getInvoiceBalance,
} from "@/lib/utils";
import { ActivityIcon, activityIconVariant } from "@/components/ActivityIcon";

const ACTIVITY_PAGE_SIZE = 25;

type ShareData =
  | { scope: "client"; client: Client; invoices: Invoice[]; paymentPlans: PaymentPlan[] }
  | { scope: "clients"; clients: SharedClientSummary[] };

export default function SharedTokenPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/share/${params.token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "This link is no longer available");
        }
        return res.json() as Promise<ShareData>;
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "This link is no longer available");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <PageLoading label="Loading shared view…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Link unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          {error ?? "This link is no longer available"}. Ask the account owner for a new
          link if you still need access.
        </p>
      </div>
    );
  }

  if (data.scope === "clients") {
    return <SharedClientsListView clients={data.clients} />;
  }

  return <SharedClientView token={params.token} client={data.client} invoices={data.invoices} paymentPlans={data.paymentPlans} />;
}

function SharedClientsListView({ clients }: { clients: SharedClientSummary[] }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v4h8z" />
        </svg>
        Shared read-only view — no account required, no changes can be made here.
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">
          {clients.length} client{clients.length === 1 ? "" : "s"} on file
        </p>
      </div>

      <Card className="overflow-hidden">
        {clients.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No clients yet.</p>
        ) : (
          <>
            <table className="hidden w-full text-left text-sm lg:table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Total owed</th>
                  <th className="px-5 py-3">Oldest overdue invoice</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => {
                  const badge = clientStatusLabel(client.status);
                  return (
                    <tr key={client.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{client.name}</p>
                        <p className="text-xs text-slate-500">{client.email}</p>
                      </td>
                      <td className="px-5 py-4 font-medium tabular-nums text-slate-900">
                        {formatCurrency(client.totalOwed, client.currency)}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {client.oldestOverdue ? (
                          <>
                            {client.oldestOverdue.id}
                            <span className="ml-1.5 text-xs text-slate-400">
                              due {formatDate(client.oldestOverdue.dueDate)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="divide-y divide-slate-100 lg:hidden">
              {clients.map((client) => {
                const badge = clientStatusLabel(client.status);
                return (
                  <div key={client.id} className="px-4 py-4">
                    <p className="font-medium text-slate-900">{client.name}</p>
                    <p className="truncate text-xs text-slate-500">{client.email}</p>
                    <p className="mt-2 text-sm font-medium tabular-nums text-slate-900">
                      {formatCurrency(client.totalOwed, client.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {client.oldestOverdue ? (
                        <>
                          {client.oldestOverdue.id}{" "}
                          <span className="text-slate-400">
                            due {formatDate(client.oldestOverdue.dueDate)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">No overdue invoices</span>
                      )}
                    </p>
                    <div className="mt-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function SharedClientView({
  token,
  client,
  invoices,
  paymentPlans,
}: {
  token: string;
  client: Client;
  invoices: Invoice[];
  paymentPlans: PaymentPlan[];
}) {
  const [activityPage, setActivityPage] = useState(1);
  const {
    data: activity,
    total: activityTotal,
    loading: activityLoading,
  } = usePaginatedResource<ActivityEntry>(
    `/api/share/${token}/activity?page=${activityPage}&pageSize=${ACTIVITY_PAGE_SIZE}`,
    0
  );

  const clientInvoices = getClientInvoices(client.id, invoices).sort(
    (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
  );
  const clientPlans = getClientPaymentPlans(client.id, paymentPlans);
  const totalOwed = getClientTotalOwed(client.id, invoices);
  const status = getClientStatus(client.id, invoices, paymentPlans);
  const badge = clientStatusLabel(status);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v4h8z" />
        </svg>
        Shared read-only view — no account required, no changes can be made here.
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
              {initials(client.name)}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                  {client.name}
                </h1>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                <span>{client.email}</span>
                <span>{client.phone}</span>
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total owed
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {formatCurrency(totalOwed, client.currency)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Invoices" subtitle={`${clientInvoices.length} total`} />
            <div className="divide-y divide-slate-100">
              {clientInvoices.map((invoice) => {
                const invBadge = invoiceStatusLabel(invoice);
                const balance = getInvoiceBalance(invoice);
                return (
                  <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {invoice.id}
                        <span className="ml-2 font-normal text-slate-500">
                          {invoice.description}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Due {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatCurrency(balance, client.currency)}
                      </p>
                      <Badge variant={invBadge.variant}>{invBadge.label}</Badge>
                    </div>
                  </div>
                );
              })}
              {clientInvoices.length === 0 && (
                <p className="px-5 py-6 text-center text-sm text-slate-500">
                  No invoices yet.
                </p>
              )}
            </div>
          </Card>

          {clientPlans.map((plan) => {
            const remaining = plan.installments
              .filter((i) => !i.paid)
              .reduce((s, i) => s + i.amount, 0);
            return (
              <Card key={plan.id}>
                <CardHeader
                  title={`Payment plan ${plan.id}`}
                  subtitle={`${formatCurrency(plan.totalAmount, client.currency)} total · ${formatCurrency(
                    remaining,
                    client.currency
                  )} remaining · started ${formatDate(plan.startDate)}`}
                />
                <div className="divide-y divide-slate-100">
                  {plan.installments.map((inst, idx) => (
                    <div
                      key={inst.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            inst.paid
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm text-slate-800">
                            Due {formatDate(inst.dueDate)}
                          </p>
                          {inst.paid && inst.paidDate && (
                            <p className="text-xs text-emerald-600">
                              Paid {formatDate(inst.paidDate)}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-medium tabular-nums text-slate-900">
                        {formatCurrency(inst.amount, client.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Activity log"
              subtitle="Every reminder sent and response logged"
            />
            <ol className="max-h-[840px] space-y-0 overflow-y-auto px-5 py-4">
              {activity.map((entry, idx) => (
                <li key={entry.id} className="relative flex gap-3 pb-6 last:pb-0">
                  {idx !== activity.length - 1 && (
                    <span className="absolute left-3.5 top-7 h-full w-px bg-slate-100" />
                  )}
                  <div
                    className={`z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${activityIconVariant(
                      entry.type
                    )}`}
                  >
                    <ActivityIcon type={entry.type} className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-500">
                        {formatDate(entry.date)}
                        {entry.stage && (
                          <span className="ml-1.5 capitalize text-slate-400">
                            · {entry.stage} reminder
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-800">{entry.message}</p>
                  </div>
                </li>
              ))}
              {activityTotal === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">
                  No activity logged yet.
                </p>
              )}
            </ol>
            {activityTotal > 0 && (
              <Pagination
                page={activityPage}
                pageSize={ACTIVITY_PAGE_SIZE}
                total={activityTotal}
                onPageChange={setActivityPage}
                loading={activityLoading}
                itemLabel="activity entries"
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const letters = name.match(/[A-Za-z]+/g) ?? [];
  return letters
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
