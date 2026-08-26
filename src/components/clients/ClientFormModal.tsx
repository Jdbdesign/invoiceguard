"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/utils";
import type { Client } from "@/lib/types";

export function ClientFormModal({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client;
}) {
  const { addClient, updateClient } = useAppData();
  const { showToast } = useToast();
  const isEdit = Boolean(client);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // Reset the form fields whenever the modal opens for a (possibly new)
  // client, without an effect: comparing against the last-seen open key
  // during render lets React apply the reset before painting, instead of
  // committing the stale values for one frame first.
  const openKey = open ? (client?.id ?? "__new__") : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey !== null) {
      setName(client?.name ?? "");
      setEmail(client?.email ?? "");
      setPhone(client?.phone ?? "");
      setCurrency(client?.currency ?? DEFAULT_CURRENCY);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    const input = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      currency,
    };
    try {
      if (isEdit && client) {
        await updateClient(client.id, input);
        showToast(`${input.name} updated`);
      } else {
        await addClient(input);
        showToast(`${input.name} added to clients`);
      }
      onClose();
    } catch {
      showToast(isEdit ? "Failed to update client" : "Failed to add client");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit client" : "Add client"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Client / company name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Studio LLC"
            className="input"
          />
        </Field>
        <Field label="Billing email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="billing@acmestudio.com"
            className="input"
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-0100"
            className="input"
          />
        </Field>
        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="input"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </Field>

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
            {isEdit ? "Save changes" : "Add client"}
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
