"use client";

import { useState } from "react";
import {
  AuthLayout,
  authButtonClass,
  authInputClass,
  authLinkClass,
} from "@/components/auth/AuthLayout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <AuthLayout title="Forgot password" subtitle="We'll email you a link to reset it.">
      {submitted ? (
        <p className="text-sm text-[#C4C4C4]">
          If that email exists, we&apos;ve sent a reset link. Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <input
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={authInputClass}
          />
          <button
            type="submit"
            disabled={submitting || !email}
            className={`mt-2 ${authButtonClass}`}
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-xs text-[#6E6E6E]">
        <a href="/login" className={authLinkClass}>
          Back to login
        </a>
      </p>
    </AuthLayout>
  );
}
