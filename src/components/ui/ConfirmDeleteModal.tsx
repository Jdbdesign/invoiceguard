"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title,
  confirmText,
  warning,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  confirmText: string;
  warning: string;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = typed.length > 0 && typed === confirmText;

  // Reset the confirmation field whenever the modal opens, without an
  // effect — see ClientFormModal for why this runs during render instead.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
      setDeleting(false);
    }
  }

  async function handleConfirm() {
    if (!matches || deleting) return;
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-rose-600">{warning}</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">
            Type <span className="font-semibold text-slate-900">{confirmText}</span> to confirm
          </span>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmText}
            className="input"
          />
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || deleting}
            onClick={handleConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
