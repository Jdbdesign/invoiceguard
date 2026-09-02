"use client";

import { useState } from "react";
import { EditPencilIcon } from "@/components/invoices/CreatePaymentPlanModal";
import { MAX_INSTALLMENT_LABEL_LENGTH } from "@/lib/paymentPlan";

export function InstallmentLabelEditor({
  label,
  onSave,
}: {
  label: string;
  onSave: (label: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(label);
          setEditing(true);
        }}
        className="group inline-flex items-center gap-1 rounded px-1 -mx-1 text-left text-sm text-slate-800 transition hover:bg-slate-100"
        title="Click to rename"
      >
        <span className="border-b border-dashed border-slate-300 transition group-hover:border-slate-400">
          {label}
        </span>
        <EditPencilIcon className="h-3 w-3 flex-shrink-0 text-slate-400" />
      </button>
    );
  }

  async function commit() {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed === label || (trimmed === "" && label === "")) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="text"
      autoFocus
      value={value}
      disabled={saving}
      maxLength={MAX_INSTALLMENT_LABEL_LENGTH}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setValue(label);
          setEditing(false);
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      className="-mx-1 rounded border border-blue-400 bg-white px-1 text-sm text-slate-800 outline-none ring-1 ring-blue-400"
    />
  );
}
