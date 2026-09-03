"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoading } from "@/components/ui/Spinner";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CreatePaymentPlanModal } from "@/components/invoices/CreatePaymentPlanModal";
import { ReminderModal } from "@/components/invoices/ReminderModal";
import { ShareLinkModal } from "@/components/clients/ShareLinkModal";
import { InstallmentLabelEditor } from "@/components/invoices/InstallmentLabelEditor";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { invoiceStatusLabel, clientStatusLabel } from "@/lib/badgeHelpers";
import { defaultInstallmentLabel } from "@/lib/paymentPlan";
import { usePaginatedResource } from "@/lib/usePaginatedResource";
import type { ActivityEntry, Installment, Invoice } from "@/lib/types";
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

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const {
    clients,
    invoices,
    paymentPlans,
    loading,
    markInvoicePaid,
    sendReceipt,
    toggleInstallmentPaid,
    updateInstallmentLabel,
    settlePaymentPlan,
  } = useAppData();
  const { showToast } = useToast();

  const [activityPage, setActivityPage] = useState(1);
  const [activityReloadToken, setActivityReloadToken] = useState(0);
  const refetchActivity = useCallback(() => setActivityReloadToken((t) => t + 1), []);

  // A new client id means a fresh activity feed — start back on page 1.
  // Render-time reset (see ClientFormModal for the same idiom) rather than
  // an effect, since setState-in-effect is disallowed here.
  const [lastActivityClientId, setLastActivityClientId] = useState(params.id);
  if (params.id !== lastActivityClientId) {
    setLastActivityClientId(params.id);
    setActivityPage(1);
  }

  const {
    data: clientActivity,
    total: activityTotal,
    loading: activityLoading,
  } = usePaginatedResource<ActivityEntry>(
    `/api/activity?clientId=${params.id}&page=${activityPage}&pageSize=${ACTIVITY_PAGE_SIZE}`,
    activityReloadToken,
    () => showToast("Failed to load activity")
  );

  const [confirmingInvoice, setConfirmingInvoice] = useState<Invoice | null>(null);
  const [confirmingInstallment, setConfirmingInstallment] = useState<{
    planId: string;
    installment: Installment;
  } | null>(null);
  const [confirmingSettlePlan, setConfirmingSettlePlan] = useState<{
    invoiceId: string;
    remaining: number;
    count: number;
    currency: string;
  } | null>(null);
  const [creatingPlanFor, setCreatingPlanFor] = useState<Invoice | null>(null);
  const [confirmingReceiptFor, setConfirmingReceiptFor] = useState<Invoice | null>(null);
  const [draftingReminderFor, setDraftingReminderFor] = useState<string | null>(null);
  const [sharingClient, setSharingClient] = useState(false);

  const client = clients.find((c) => c.id === params.id);

  if (loading) {
    return <PageLoading label="Loading client…" />;
  }

  if (!client) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">Client not found.</p>
        <Link href="/clients" className="mt-2 inline-block text-sm text-blue-600">
          Back to clients
        </Link>
      </div>
    );
  }

  const clientInvoices = getClientInvoices(client.id, invoices).sort(
    (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
  );
  const clientPlans = getClientPaymentPlans(client.id, paymentPlans);
  const totalOwed = getClientTotalOwed(client.id, invoices);
  const status = getClientStatus(client.id, invoices, paymentPlans);
  const badge = clientStatusLabel(status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/clients" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          All clients
        </Link>
        <button
          onClick={() => setSharingClient(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.68 13.34l6.65 3.83m-.01-10.34L8.68 10.66M18 6a2 2 0 11-4 0 2 2 0 014 0zm0 12a2 2 0 11-4 0 2 2 0 014 0zM8 12a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Share
        </button>
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
                <span className="flex items-center gap-1.5">
                  <MailIcon /> {client.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <PhoneIcon /> {client.phone}
                </span>
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
                const invoicePlan = clientPlans.find((p) => p.invoiceId === invoice.id);
                const invoicePlanUnpaid = invoicePlan
                  ? invoicePlan.installments.filter((i) => !i.paid)
                  : [];
                const invoicePlanRemaining = invoicePlanUnpaid.reduce(
                  (s, i) => s + i.amount,
                  0
                );
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
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(balance, client.currency)}
                        </p>
                        <Badge variant={invBadge.variant}>{invBadge.label}</Badge>
                      </div>
                      {(invoicePlanRemaining > 0 ||
                        invoice.status !== "paid" ||
                        !invoice.receiptSentAt) && (
                        <div className="flex flex-col gap-1.5">
                          {invoice.status !== "paid" && !invoicePlan && (
                            <button
                              onClick={() => setCreatingPlanFor(invoice)}
                              className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              Create payment plan
                            </button>
                          )}
                          {invoicePlanRemaining > 0 ? (
                            // Shown whenever the payment plan still has a
                            // remaining balance, even if the invoice itself
                            // already (incorrectly) shows "paid" — that
                            // mismatch is exactly what this action reconciles.
                            <button
                              onClick={() =>
                                setConfirmingSettlePlan({
                                  invoiceId: invoice.id,
                                  remaining: invoicePlanRemaining,
                                  count: invoicePlanUnpaid.length,
                                  currency: client.currency,
                                })
                              }
                              className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              Settle remaining balance
                            </button>
                          ) : (
                            invoice.status !== "paid" &&
                            !invoicePlan && (
                              <button
                                onClick={() => setConfirmingInvoice(invoice)}
                                className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                              >
                                Mark paid
                              </button>
                            )
                          )}
                          {invoice.status !== "paid" && (
                            <button
                              onClick={() => setDraftingReminderFor(invoice.id)}
                              className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                            >
                              Draft reminder
                            </button>
                          )}
                          {invoice.status === "paid" && !invoice.receiptSentAt && (
                            <button
                              onClick={() => setConfirmingReceiptFor(invoice)}
                              className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                            >
                              Send receipt
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {clientPlans.map((plan) => {
            const planUnpaid = plan.installments.filter((i) => !i.paid);
            const remaining = planUnpaid.reduce((s, i) => s + i.amount, 0);
            return (
              <Card key={plan.id}>
                <CardHeader
                  title="Payment plan"
                  subtitle={`${formatCurrency(plan.totalAmount, client.currency)} total · ${formatCurrency(
                    remaining,
                    client.currency
                  )} remaining · started ${formatDate(plan.startDate)}`}
                  action={
                    remaining > 0 ? (
                      <button
                        onClick={() =>
                          setConfirmingSettlePlan({
                            invoiceId: plan.invoiceId,
                            remaining,
                            count: planUnpaid.length,
                            currency: client.currency,
                          })
                        }
                        className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        Settle remaining balance
                      </button>
                    ) : undefined
                  }
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
                        <div className="min-w-0">
                          <InstallmentLabelEditor
                            label={inst.label || defaultInstallmentLabel(idx + 1)}
                            onSave={(label) =>
                              updateInstallmentLabel(plan.id, inst.id, label).catch(() =>
                                showToast("Failed to rename installment")
                              )
                            }
                          />
                          <p className="text-xs text-slate-500">
                            Due {formatDate(inst.dueDate)}
                          </p>
                          {inst.paid && inst.paidDate && (
                            <p className="text-xs text-emerald-600">
                              Paid {formatDate(inst.paidDate)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-medium tabular-nums text-slate-900">
                          {formatCurrency(inst.amount, client.currency)}
                        </p>
                        <button
                          onClick={() => {
                            if (!inst.paid) {
                              setConfirmingInstallment({ planId: plan.id, installment: inst });
                              return;
                            }
                            toggleInstallmentPaid(plan.id, inst.id)
                              .then(refetchActivity)
                              .catch(() => showToast("Failed to update installment"));
                          }}
                          className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                            inst.paid
                              ? "border-slate-200 text-slate-500 hover:bg-slate-50"
                              : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                          }`}
                        >
                          {inst.paid ? "Undo" : "Mark paid"}
                        </button>
                      </div>
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
              {clientActivity.map((entry, idx) => (
                <li key={entry.id} className="relative flex gap-3 pb-6 last:pb-0">
                  {idx !== clientActivity.length - 1 && (
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

      <ConfirmModal
        open={confirmingInvoice !== null}
        onClose={() => setConfirmingInvoice(null)}
        title="Mark invoice as paid?"
        message={`Mark ${confirmingInvoice?.id} as paid? This can be undone.`}
        confirmLabel="Mark paid"
        onConfirm={async () => {
          if (!confirmingInvoice) return;
          try {
            await markInvoicePaid(confirmingInvoice.id);
            showToast(`${confirmingInvoice.id} marked as paid`);
            refetchActivity();
          } catch {
            showToast(`Failed to mark ${confirmingInvoice.id} as paid`);
          } finally {
            setConfirmingInvoice(null);
          }
        }}
      />

      <ConfirmModal
        open={confirmingInstallment !== null}
        onClose={() => setConfirmingInstallment(null)}
        title="Mark installment as paid?"
        message={
          confirmingInstallment
            ? `Mark the installment due ${formatDate(
                confirmingInstallment.installment.dueDate
              )} as paid? This can be undone.`
            : ""
        }
        confirmLabel="Mark paid"
        onConfirm={async () => {
          if (!confirmingInstallment) return;
          try {
            await toggleInstallmentPaid(
              confirmingInstallment.planId,
              confirmingInstallment.installment.id
            );
            refetchActivity();
          } catch {
            showToast("Failed to update installment");
          } finally {
            setConfirmingInstallment(null);
          }
        }}
      />

      <ConfirmModal
        open={confirmingSettlePlan !== null}
        onClose={() => setConfirmingSettlePlan(null)}
        title="Settle remaining balance?"
        message={
          confirmingSettlePlan
            ? `Mark the remaining ${formatCurrency(
                confirmingSettlePlan.remaining,
                confirmingSettlePlan.currency
              )} (${confirmingSettlePlan.count} installment${
                confirmingSettlePlan.count === 1 ? "" : "s"
              }) as paid in full? This records that the client paid off the rest of the payment plan in one payment.`
            : ""
        }
        confirmLabel="Settle balance"
        onConfirm={async () => {
          if (!confirmingSettlePlan) return;
          try {
            await settlePaymentPlan(confirmingSettlePlan.invoiceId);
            showToast("Remaining balance settled");
            refetchActivity();
          } catch {
            showToast("Failed to settle remaining balance");
          } finally {
            setConfirmingSettlePlan(null);
          }
        }}
      />

      <ConfirmModal
        open={confirmingReceiptFor !== null}
        onClose={() => setConfirmingReceiptFor(null)}
        title="Send payment receipt?"
        message={`Email a payment receipt for ${confirmingReceiptFor?.id} to ${client.email}?`}
        confirmLabel="Send receipt"
        onConfirm={async () => {
          if (!confirmingReceiptFor) return;
          try {
            await sendReceipt(confirmingReceiptFor.id);
            showToast(`Receipt sent for ${confirmingReceiptFor.id}`);
            refetchActivity();
          } catch {
            showToast(`Failed to send receipt for ${confirmingReceiptFor.id}`);
          } finally {
            setConfirmingReceiptFor(null);
          }
        }}
      />

      <CreatePaymentPlanModal
        open={creatingPlanFor !== null}
        onClose={() => setCreatingPlanFor(null)}
        invoice={creatingPlanFor}
      />

      <ReminderModal
        open={draftingReminderFor !== null}
        onClose={() => setDraftingReminderFor(null)}
        invoiceId={draftingReminderFor}
        onSent={refetchActivity}
      />

      <ShareLinkModal
        open={sharingClient}
        onClose={() => setSharingClient(false)}
        clientId={client.id}
        clientName={client.name}
      />
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

function MailIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 6.5L12 13l8.5-6.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3.5c-2 0-3.5 1.6-3.2 3.6.6 4 3.5 8.5 7.1 11 2.1 1.5 5.2.9 6.6-1.2l.6-1a1.4 1.4 0 00-.5-2l-2.5-1.5a1.4 1.4 0 00-1.7.2l-.8.8c-1.6-1-3-2.4-4-4l.8-.8c.5-.5.6-1.2.2-1.8L8.1 4.2A1.4 1.4 0 007 3.5z"
      />
    </svg>
  );
}
