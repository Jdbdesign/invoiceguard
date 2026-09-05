"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import {
  AuthLayout,
  authButtonClass,
  authInputClass,
  authLinkClass,
  authPasswordFieldClass,
} from "@/components/auth/AuthLayout";

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
    <AuthLayout
      title="Create an account"
      subtitle={
        <>
          Already have an account?{" "}
          <a href="/login" className={authLinkClass}>
            Log in
          </a>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <input
          ref={emailRef}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setEmailLocked(false)}
          readOnly={emailLocked}
          placeholder="Email"
          className={authInputClass}
        />

        <div>
          <div className={authPasswordFieldClass}>
            <PasswordInput
              ref={passwordRef}
              value={password}
              onChange={setPassword}
              placeholder="Create your password"
              autoComplete="new-password"
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
          disabled={submitting || !email || password.length === 0 || passwordsMismatch}
          className={`mt-2 ${authButtonClass}`}
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
