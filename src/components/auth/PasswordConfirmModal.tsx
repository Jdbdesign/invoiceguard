"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Spinner } from "@/components/ui/Spinner";
import {
  subscribeToConfirmRequests,
  resolvePendingConfirmations,
  rejectPendingConfirmations,
} from "@/lib/passwordConfirmClient";

export function PasswordConfirmModal() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribeToConfirmRequests(() => {
      setPassword("");
      setError(null);
      setBusy(false);
      setOpen(true);
    });
  }, []);

  function handleClose() {
    if (busy) return;
    setOpen(false);
    rejectPendingConfirmations("Action cancelled");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/confirm-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Incorrect password");
        setBusy(false);
        return;
      }
      setOpen(false);
      setBusy(false);
      resolvePendingConfirmations();
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Confirm your password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          For your security, please confirm your password to continue.
        </p>
        <PasswordInput
          value={password}
          onChange={(value) => {
            setPassword(value);
            setError(null);
          }}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          aria-invalid={Boolean(error)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {busy && <Spinner className="h-3.5 w-3.5" />}
            Confirm
          </button>
        </div>
      </form>
    </Modal>
  );
}
