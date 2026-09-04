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

interface DraftItem {
  description: string;
  amount: string;
}

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
  const [items, setItems] = useState<DraftItem[]>([]);

  const hasPaymentPlan =
    isEdit && invoice ? invoiceHasPaymentPlan(invoice.id, paymentPlans) : false;
  const amountLocked = isEdit && (hasPaymentPlan || (invoice?.amountPaid ?? 0) > 0);
  const amountLockedReason = hasPaymentPlan
    ? "This invoice has an active payment plan — manage payments through the installment list instead."
    : "Amount can't be changed after a payment has been recorded.";

  // Two or more rows means the invoice is itemized — the Amount field
  // becomes a computed, read-only sum of the rows. Removing a row back down
  // to one collapses to plain flat-amount mode (see removeItem below)
  // rather than ever showing a lone, pointless one-row breakdown.
  const itemized = items.length >= 2;
  const itemsSum = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // Reset the form fields whenever the modal opens for a (possibly new)
  // invoice, without an effect — see ClientFormModal for why this runs
  // during render instead.
  const openKey = open ? (invoice?.id ?? "__new__") : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey !== null) {
      setClientId(invoice?.clientId ?? "");
      setDueDate(invoice?.dueDate ?? "");
      setDescription(invoice?.description ?? "");
      setStatus(
        invoice?.status && invoice.status !== "payment_plan" ? invoice.status : "unpaid"
      );
      if (invoice && invoice.items.length >= 2) {
        setItems(invoice.items.map((item) => ({ description: item.description, amount: String(item.amount) })));
      } else {
        setItems([]);
      }
      setAmount(invoice ? String(invoice.amount) : "");
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  function startItemizing() {
    setItems([
      { description: "", amount: "" },
      { description: "", amount: "" },
    ]);
  }

  function addItemRow() {
    setItems((prev) => [...prev, { description: "", amount: "" }]);
  }

  function updateItemRow(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItemRow(index: number) {
    const next = items.filter((_, i) => i !== index);
    if (next.length <= 1) {
      // Down to (at most) one row is no longer a meaningful breakdown —
      // fold back into the plain Amount field, carrying over the one
      // remaining row's amount so the total isn't lost.
      if (next.length === 1) setAmount(next[0].amount);
      setItems([]);
    } else {
      setItems(next);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = itemized ? itemsSum : Number(amount);
    if (!clientId || !numAmount || !dueDate || !description.trim()) return;
    if (itemized && !items.every((item) => item.description.trim() && Number(item.amount) > 0)) {
      return;
    }
    const itemsPayload = itemized
      ? items.map((item) => ({ description: item.description.trim(), amount: Number(item.amount) }))
      : undefined;
    try {
      if (isEdit && invoice) {
        const updated = await updateInvoice(invoice.id, {
          clientId,
          amount: numAmount,
          dueDate,
          description: description.trim(),
          status,
          items: itemsPayload,
        });
        showToast(`Invoice ${updated.id} updated`);
      } else {
        const created = await addInvoice({
          clientId,
          amount: numAmount,
          dueDate,
          description: description.trim(),
          items: itemsPayload,
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

        {!itemized && !amountLocked && (
          <button
            type="button"
            onClick={startItemizing}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Add line item
          </button>
        )}

        {itemized && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-600">Line items</p>
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  required
                  value={item.description}
                  disabled={amountLocked}
                  onChange={(e) => updateItemRow(index, { description: e.target.value })}
                  placeholder="e.g. School fee"
                  className={`input flex-1 ${amountLocked ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
                />
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount}
                  disabled={amountLocked}
                  onChange={(e) => updateItemRow(index, { amount: e.target.value })}
                  placeholder="0.00"
                  className={`input w-28 ${amountLocked ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
                />
                {!amountLocked && (
                  <button
                    type="button"
                    onClick={() => removeItemRow(index)}
                    aria-label="Remove line item"
                    className="flex-shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {!amountLocked && (
              <button
                type="button"
                onClick={addItemRow}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                + Add another line item
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`Amount${selectedClient ? ` (${selectedClient.currency})` : ""}`}>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              disabled={amountLocked || itemized}
              value={itemized ? itemsSum.toFixed(2) : amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500.00"
              className={`input ${amountLocked || itemized ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
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
        {!amountLocked && itemized && (
          <p className="-mt-2 text-xs text-slate-500">
            Amount is the sum of the line items above.
          </p>
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
