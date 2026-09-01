"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import {
  computeInstallmentSchedule,
  defaultInstallmentLabel,
  DEFAULT_INSTALLMENTS,
  FREQUENCIES,
  isValidInstallmentCount,
  MAX_INSTALLMENT_LABEL_LENGTH,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  type PaymentPlanFrequency,
} from "@/lib/paymentPlan";
import type { Invoice } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  getClientById,
  getInvoiceBalance,
  todayIso,
} from "@/lib/utils";

export function CreatePaymentPlanModal({
  open,
  onClose,
  invoice,
}: {
  open: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}) {
  const { clients, createPaymentPlan } = useAppData();
  const { showToast } = useToast();
  const [installmentCount, setInstallmentCount] = useState(DEFAULT_INSTALLMENTS);
  const [firstDueDate, setFirstDueDate] = useState(todayIso());
  const [frequency, setFrequency] = useState<PaymentPlanFrequency>("monthly");
  const [labels, setLabels] = useState<string[]>(() => defaultLabels(DEFAULT_INSTALLMENTS));
  const [submitting, setSubmitting] = useState(false);

  // Reset the form fields whenever the modal opens for a (possibly new)
  // invoice, without an effect — see ClientFormModal for why this runs
  // during render instead.
  const openKey = open ? (invoice?.id ?? "__none__") : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey !== null) {
      setInstallmentCount(DEFAULT_INSTALLMENTS);
      setFirstDueDate(todayIso());
      setFrequency("monthly");
      setLabels(defaultLabels(DEFAULT_INSTALLMENTS));
    }
  }

  function handleInstallmentCountChange(next: number) {
    setInstallmentCount(next);
    if (Number.isInteger(next) && next > 0) {
      setLabels((prev) => resizeLabels(prev, next));
    }
  }

  const client = invoice ? getClientById(clients, invoice.clientId) : undefined;
  const remaining = invoice ? getInvoiceBalance(invoice) : 0;

  const preview = useMemo(() => {
    if (!invoice || !firstDueDate || !isValidInstallmentCount(installmentCount)) {
      return [];
    }
    return computeInstallmentSchedule(remaining, installmentCount, firstDueDate, frequency);
  }, [invoice, remaining, installmentCount, firstDueDate, frequency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || preview.length === 0) return;
    setSubmitting(true);
    try {
      await createPaymentPlan(invoice, {
        installmentCount,
        firstDueDate,
        frequency,
        labels: labels.slice(0, preview.length),
      });
      showToast(`Payment plan created for ${invoice.id}`);
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to create payment plan"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create payment plan">
      {invoice && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <SummaryRow label="Invoice" value={invoice.id} />
            <SummaryRow label="Client" value={client?.name ?? "—"} />
            <SummaryRow
              label="Total amount"
              value={formatCurrency(invoice.amount, client?.currency)}
            />
            {invoice.amountPaid > 0 && (
              <SummaryRow
                label="Already paid"
                value={formatCurrency(invoice.amountPaid, client?.currency)}
              />
            )}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5">
              <span className="text-slate-600">Remaining balance</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatCurrency(remaining, client?.currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Number of installments">
              <input
                required
                type="number"
                min={MIN_INSTALLMENTS}
                max={MAX_INSTALLMENTS}
                value={installmentCount}
                onChange={(e) => handleInstallmentCountChange(Number(e.target.value))}
                className="input"
              />
            </Field>
            <Field label="Frequency">
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as PaymentPlanFrequency)}
                className="input"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="First due date">
            <input
              required
              type="date"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              className="input"
            />
          </Field>

          {!isValidInstallmentCount(installmentCount) && (
            <p className="-mt-2 text-xs text-rose-600">
              Choose between {MIN_INSTALLMENTS} and {MAX_INSTALLMENTS} installments.
            </p>
          )}

          {preview.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="divide-y divide-slate-100">
                {preview.map((installment, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={labels[idx] ?? defaultInstallmentLabel(idx + 1)}
                        onChange={(e) =>
                          setLabels((prev) => {
                            const next = resizeLabels(prev, preview.length);
                            next[idx] = e.target.value;
                            return next;
                          })
                        }
                        maxLength={MAX_INSTALLMENT_LABEL_LENGTH}
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-slate-700 transition hover:border-slate-200 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <p className="px-1.5 text-xs text-slate-400">
                        Due {formatDate(installment.dueDate)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 font-medium tabular-nums text-slate-900">
                      {formatCurrency(installment.amount, client?.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || preview.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {submitting ? "Creating…" : "Create payment plan"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function defaultLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => defaultInstallmentLabel(i + 1));
}

/** Resizes a labels array to `count`, preserving custom text at overlapping
 * indices and filling any new slots with their default label. */
function resizeLabels(prev: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => prev[i] ?? defaultInstallmentLabel(i + 1));
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
