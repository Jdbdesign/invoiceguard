"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        setError("Incorrect password. Try again.");
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

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 shadow-xl shadow-black/20"
        >
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-300"
            >
              {showPassword ? (
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
                  <path
                    d="M3 3l18 18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10.6 5.2A10.6 10.6 0 0112 5c5.5 0 9.4 4 10.7 7-.5 1.1-1.2 2.2-2.1 3.1m-3.2 2.1A10.7 10.7 0 0112 19c-5.5 0-9.4-4-10.7-7 .6-1.4 1.6-2.8 2.9-4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.9 10c-.4.5-.6 1.1-.6 1.8 0 1.6 1.3 2.9 2.9 2.9.7 0 1.3-.2 1.8-.6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
                  <path
                    d="M1.3 12S5 5 12 5s10.7 7 10.7 7-3.7 7-10.7 7S1.3 12 1.3 12z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="2.9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          {error && <p className="mt-2.5 text-xs font-medium text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
