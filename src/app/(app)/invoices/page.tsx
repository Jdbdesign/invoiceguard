"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoading } from "@/components/ui/Spinner";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { InvoiceFormModal } from "@/components/invoices/InvoiceFormModal";
import { CreatePaymentPlanModal } from "@/components/invoices/CreatePaymentPlanModal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { invoiceStatusLabel } from "@/lib/badgeHelpers";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  getClientById,
  getDaysOverdue,
  getInvoiceBalance,
  invoiceHasPaymentPlan,
} from "@/lib/utils";

type StatusFilter = "all" | InvoiceStatus;
type SortKey = "dueDate" | "amount" | "daysOverdue";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "payment_plan", label: "Payment plan" },
];

export default function InvoicesPage() {
  const { clients, invoices, paymentPlans, sendReminderNow, deleteInvoice, loading } =
    useAppData();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [creatingPlanFor, setCreatingPlanFor] = useState<Invoice | null>(null);

  const rows = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? invoices
        : invoices.filter((inv) => inv.status === statusFilter);

    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") return getInvoiceBalance(b) - getInvoiceBalance(a);
      if (sortKey === "daysOverdue")
        return (getDaysOverdue(b) ?? -9999) - (getDaysOverdue(a) ?? -9999);
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [invoices, statusFilter, sortKey]);

  if (loading) {
    return <PageLoading label="Loading invoices…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {invoices.length} invoices across all clients
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Add invoice
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === f.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="dueDate">Due date</option>
            <option value="amount">Balance</option>
            <option value="daysOverdue">Days overdue</option>
          </select>
        </label>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Invoice</th>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Balance</th>
              <th className="px-5 py-3">Due date</th>
              <th className="px-5 py-3">Days overdue</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((invoice) => {
              const client = getClientById(clients, invoice.clientId);
              const badge = invoiceStatusLabel(invoice);
              const overdue = getDaysOverdue(invoice);
              return (
                <tr key={invoice.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-900">{invoice.id}</td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/clients/${invoice.clientId}`}
                      className="text-slate-700 hover:text-blue-600"
                    >
                      {client?.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-medium tabular-nums text-slate-900">
                    {formatCurrency(getInvoiceBalance(invoice), client?.currency)}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(invoice.dueDate)}</td>
                  <td className="px-5 py-4 tabular-nums text-slate-600">
                    {invoice.status === "paid"
                      ? "—"
                      : overdue !== null && overdue > 0
                        ? `${overdue}d`
                        : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {invoice.status !== "paid" &&
                        !invoiceHasPaymentPlan(invoice.id, paymentPlans) && (
                          <button
                            onClick={() => setCreatingPlanFor(invoice)}
                            className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            Create payment plan
                          </button>
                        )}
                      {invoice.status !== "paid" && (
                        <button
                          onClick={() => {
                            sendReminderNow(invoice.id);
                            showToast(`Drafting reminder for ${invoice.id}…`);
                          }}
                          className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                          Send reminder
                        </button>
                      )}
                      <RowActionsMenu
                        onEdit={() => setEditingInvoice(invoice)}
                        onDelete={() => setDeletingInvoice(invoice)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                  No invoices match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <InvoiceFormModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <InvoiceFormModal
        open={editingInvoice !== null}
        onClose={() => setEditingInvoice(null)}
        invoice={editingInvoice ?? undefined}
      />

      <ConfirmDeleteModal
        open={deletingInvoice !== null}
        onClose={() => setDeletingInvoice(null)}
        title="Delete invoice"
        confirmText={deletingInvoice?.id ?? ""}
        warning="Deleting this invoice also permanently removes its related activity log entries and any payment plan tied to it. This cannot be undone."
        onConfirm={async () => {
          if (!deletingInvoice) return;
          try {
            await deleteInvoice(deletingInvoice.id);
            showToast(`Invoice ${deletingInvoice.id} deleted`);
            setDeletingInvoice(null);
          } catch {
            showToast("Failed to delete invoice");
          }
        }}
      />

      <CreatePaymentPlanModal
        open={creatingPlanFor !== null}
        onClose={() => setCreatingPlanFor(null)}
        invoice={creatingPlanFor}
      />
    </div>
  );
}
