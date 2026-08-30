"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Starts read-only so Chrome's silent fill-on-page-load skips this field —
  // flips to editable the instant the user focuses it (see PasswordInput.tsx
  // for the matching pattern on the password fields).
  const [emailLocked, setEmailLocked] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Fall back to the live DOM value in case state ever lags behind what's
    // actually in the inputs.
    const emailValue = emailRef.current?.value || email;
    const passwordValue = passwordRef.current?.value || password;
    const confirmPasswordValue = confirmPasswordRef.current?.value || confirmPassword;

    if (passwordValue !== confirmPasswordValue) {
      setConfirmTouched(true);
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, password: passwordValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }

      const result = await signIn("credentials", {
        email: emailValue,
        password: passwordValue,
        redirect: false,
      });
      if (result?.error) {
        setError("Account created — sign in from the login page.");
        setSubmitting(false);
        return;
      }
      router.push("/");
      router.refresh();
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
          <span className="text-lg font-semibold tracking-tight text-white">Remitrak</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 shadow-xl shadow-black/20"
        >
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
          <input
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setEmailLocked(false)}
            readOnly={emailLocked}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />

          <label className="mb-1.5 mt-4 block text-xs font-medium text-slate-400">Password</label>
          <PasswordInput
            ref={passwordRef}
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
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
            disabled={submitting || !email || password.length === 0 || passwordsMismatch}
            className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-blue-400 hover:text-blue-300">
              Log in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
