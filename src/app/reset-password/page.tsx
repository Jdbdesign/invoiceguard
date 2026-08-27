"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

type TokenStatus = "checking" | "valid" | "invalid";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derives status from the URL param synchronously, not from an external system; only reachable before the fetch below is ever started
      setTokenStatus("invalid");
      return;
    }
    fetch(`/api/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => setTokenStatus(data.valid ? "valid" : "invalid"))
      .catch(() => setTokenStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const passwordValue = passwordRef.current?.value || password;
    const confirmPasswordValue = confirmPasswordRef.current?.value || confirmPassword;

    if (passwordValue !== confirmPasswordValue) {
      setConfirmTouched(true);
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: passwordValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
              <path
                d="M12 2.5l7.5 3.2v5.4c0 5-3.2 8.9-7.5 10.4-4.3-1.5-7.5-5.4-7.5-10.4V5.7L12 2.5z"
                stroke="currentColor"
                strokeLinejoin="round"
              />
              <path
                d="M9 12.2l2.1 2.1L15.3 10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">InvoiceGuard</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 shadow-xl shadow-black/20">
          {tokenStatus === "checking" && (
            <p className="text-sm text-slate-400">Checking your reset link…</p>
          )}

          {tokenStatus === "invalid" && (
            <div>
              <p className="text-sm text-slate-300">This reset link is invalid or has expired.</p>
              <a
                href="/forgot-password"
                className="mt-3 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Request a new link
              </a>
            </div>
          )}

          {tokenStatus === "valid" && done && (
            <div>
              <p className="text-sm text-slate-300">Your password has been reset.</p>
              <a
                href="/login"
                className="mt-3 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Back to login
              </a>
            </div>
          )}

          {tokenStatus === "valid" && !done && (
            <form onSubmit={handleSubmit}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">New password</label>
              <PasswordInput
                ref={passwordRef}
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
              />
              <PasswordStrengthMeter password={password} />

              <label className="mb-1.5 mt-4 block text-xs font-medium text-slate-400">
                Confirm password
              </label>
              <PasswordInput
                ref={confirmPasswordRef}
                value={confirmPassword}
                onChange={setConfirmPassword}
                onBlur={() => setConfirmTouched(true)}
                placeholder="Re-enter password"
                aria-invalid={confirmTouched && passwordsMismatch}
                autoComplete="new-password"
              />
              {confirmTouched && passwordsMismatch && (
                <p className="mt-1.5 text-xs font-medium text-rose-400">Passwords don&apos;t match.</p>
              )}

              {error && <p className="mt-2.5 text-xs font-medium text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || password.length === 0 || passwordsMismatch}
                className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Resetting…" : "Reset password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
