"use client";

import { useState } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { useToast } from "@/context/ToastContext";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordValidation";

export function ChangePasswordForm() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordsMismatch = confirmTouched && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConfirmTouched(true);
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setConfirmTouched(false);
      showToast("Password updated");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-600">Current password</span>
        <PasswordInput
          value={currentPassword}
          onChange={(v) => {
            setCurrentPassword(v);
            setError(null);
          }}
          autoComplete="current-password"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-600">New password</span>
        <PasswordInput
          value={newPassword}
          onChange={(v) => {
            setNewPassword(v);
            setError(null);
          }}
          autoComplete="new-password"
        />
        <PasswordStrengthMeter password={newPassword} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-slate-600">
          Confirm new password
        </span>
        <PasswordInput
          value={confirmPassword}
          onChange={(v) => {
            setConfirmPassword(v);
            setError(null);
          }}
          onBlur={() => setConfirmTouched(true)}
          aria-invalid={passwordsMismatch}
          autoComplete="new-password"
        />
        {passwordsMismatch && (
          <p className="mt-1.5 text-xs text-red-600">Passwords don&apos;t match.</p>
        )}
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
