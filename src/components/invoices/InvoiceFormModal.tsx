"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { invoiceHasPaymentPlan } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const EDITABLE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
];

export function InvoiceFormModal({
  open,
  onClose,
  invoice,
}: {
  open: boolean;
  onClose: () => void;
  invoice?: Invoice;
}) {
  const { clients, paymentPlans, addInvoice, updateInvoice } = useAppData();
  const { showToast } = useToast();
  const isEdit = Boolean(invoice);
  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("unpaid");

  const hasPaymentPlan =
    isEdit && invoice ? invoiceHasPaymentPlan(invoice.id, paymentPlans) : false;
  const amountLocked = isEdit && (hasPaymentPlan || (invoice?.amountPaid ?? 0) > 0);
  const amountLockedReason = hasPaymentPlan
    ? "This invoice has an active payment plan — manage payments through the installment list instead."
    : "Amount can't be changed after a payment has been recorded.";

  // Reset the form fields whenever the modal opens for a (possibly new)
  // invoice, without an effect — see ClientFormModal for why this runs
  // during render instead.
  const openKey = open ? (invoice?.id ?? "__new__") : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey !== null) {
      setClientId(invoice?.clientId ?? "");
      setAmount(invoice ? String(invoice.amount) : "");
      setDueDate(invoice?.dueDate ?? "");
      setDescription(invoice?.description ?? "");
      setStatus(
        invoice?.status && invoice.status !== "payment_plan" ? invoice.status : "unpaid"
      );
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!clientId || !numAmount || !dueDate || !description.trim()) return;
    try {
      if (isEdit && invoice) {
        const updated = await updateInvoice(invoice.id, {
          clientId,
          amount: numAmount,
          dueDate,
          description: description.trim(),
          status,
        });
        showToast(`Invoice ${updated.id} updated`);
      } else {
        const created = await addInvoice({
          clientId,
          amount: numAmount,
          dueDate,
          description: description.trim(),
        });
        showToast(`Invoice ${created.id} created`);
      }
      onClose();
    } catch {
      showToast(isEdit ? "Failed to update invoice" : "Failed to create invoice");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit invoice" : "Add invoice"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isEdit && invoice && (
          <Field label="Invoice number">
            <input
              value={invoice.id}
              disabled
              className="input cursor-not-allowed bg-slate-50 text-slate-500"
            />
          </Field>
        )}
        <Field label="Client">
          <select
            required
            disabled={hasPaymentPlan}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={`input ${hasPaymentPlan ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
          >
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Website maintenance — August"
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Amount${selectedClient ? ` (${selectedClient.currency})` : ""}`}>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              disabled={amountLocked}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500.00"
              className={`input ${amountLocked ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
            />
          </Field>
          <Field label="Due date">
            <input
              required
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        {amountLocked && (
          <p className="-mt-2 text-xs text-slate-500">{amountLockedReason}</p>
        )}
        {isEdit && !hasPaymentPlan && (
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
              className="input"
            >
              {EDITABLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {isEdit && hasPaymentPlan && (
          <Field label="Status">
            <input
              value="Payment plan"
              disabled
              className="input cursor-not-allowed bg-slate-50 text-slate-500"
            />
          </Field>
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            {isEdit ? "Save changes" : "Add invoice"}
          </button>
        </div>
      </form>
    </Modal>
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
