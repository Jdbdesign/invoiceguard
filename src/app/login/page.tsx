"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  AuthLayout,
  authButtonClass,
  authInputClass,
  authLinkClass,
  authPasswordFieldClass,
} from "@/components/auth/AuthLayout";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Starts read-only so Chrome's silent fill-on-page-load skips this field —
  // flips to editable the instant the user focuses it (see PasswordInput.tsx
  // for the matching pattern on the password field).
  const [emailLocked, setEmailLocked] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Fall back to the live DOM value in case state ever lags behind what's
    // actually in the inputs — the submitted credentials should never trust
    // stale React state over what's really there.
    const emailValue = emailRef.current?.value || email;
    const passwordValue = passwordRef.current?.value || password;

    try {
      const result = await signIn("credentials", {
        email: emailValue,
        password: passwordValue,
        redirect: false,
      });

      if (result?.error) {
        setError("Incorrect email or password. Try again.");
        setSubmitting(false);
        return;
      }

      const redirect = searchParams.get("redirect") || "/";
      router.push(redirect);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle={
        <>
          Don&apos;t have an account?{" "}
          <a href="/signup" className={authLinkClass}>
            Sign up
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
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          <div className="mt-3 text-right">
            <a href="/forgot-password" className={`text-xs ${authLinkClass}`}>
              Forgot password?
            </a>
          </div>
        </div>

        {error && <p className="text-xs font-medium text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !email || password.length === 0}
          className={`mt-2 ${authButtonClass}`}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
