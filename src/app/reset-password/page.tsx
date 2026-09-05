"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import {
  AuthLayout,
  authButtonClass,
  authLinkClass,
  authPasswordFieldClass,
} from "@/components/auth/AuthLayout";

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
    <AuthLayout title="Reset password" subtitle="Choose a new password for your account.">
      {tokenStatus === "checking" && (
        <p className="text-sm text-[#9A9A9A]">Checking your reset link…</p>
      )}

      {tokenStatus === "invalid" && (
        <div>
          <p className="text-sm text-[#C4C4C4]">This reset link is invalid or has expired.</p>
          <a href="/forgot-password" className={`mt-4 inline-block text-xs ${authLinkClass}`}>
            Request a new link
          </a>
        </div>
      )}

      {tokenStatus === "valid" && done && (
        <div>
          <p className="text-sm text-[#C4C4C4]">Your password has been reset.</p>
          <a href="/login" className={`mt-4 inline-block text-xs ${authLinkClass}`}>
            Back to login
          </a>
        </div>
      )}

      {tokenStatus === "valid" && !done && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <div className={authPasswordFieldClass}>
              <PasswordInput
                ref={passwordRef}
                value={password}
                onChange={setPassword}
                placeholder="New password"
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <PasswordStrengthMeter password={password} />
          </div>

          <div>
            <div className={authPasswordFieldClass}>
              <PasswordInput
                ref={confirmPasswordRef}
                value={confirmPassword}
                onChange={setConfirmPassword}
                onBlur={() => setConfirmTouched(true)}
                placeholder="Confirm password"
                aria-invalid={confirmTouched && passwordsMismatch}
                autoComplete="new-password"
              />
            </div>
            {confirmTouched && passwordsMismatch && (
              <p className="mt-1.5 text-xs font-medium text-rose-400">Passwords don&apos;t match.</p>
            )}
          </div>

          {error && <p className="text-xs font-medium text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || password.length === 0 || passwordsMismatch}
            className={`mt-2 ${authButtonClass}`}
          >
            {submitting ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
