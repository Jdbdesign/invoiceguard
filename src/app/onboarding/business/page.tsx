"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authInputClass, authSelectClass, authButtonClass } from "@/components/auth/AuthLayout";
import { LogoUploadField } from "@/components/business/LogoUploadField";
import { COUNTRIES } from "@/lib/countries";

export default function OnboardingBusinessPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((settings) => {
        if (!cancelled) setBusinessName(settings.businessName ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveAndContinue(skip: boolean) {
    setSubmitting(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          skip
            ? { completeOnboarding: true }
            : {
                logoUrl,
                businessEmail,
                businessPhone,
                country,
                completeOnboarding: true,
              }
        ),
      });
    } finally {
      router.push("/welcome");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#141414] px-6 py-12">
      <div className="w-full max-w-[400px]">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-white">
          Tell us about your business
        </h1>
        <p className="mt-3 text-sm text-[#9A9A9A]">
          Every field here is optional — add what you have, skip the rest.
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <LogoUploadField
            logoUrl={logoUrl}
            businessName={businessName}
            onUploaded={setLogoUrl}
            theme="dark"
          />

          <input
            type="email"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            placeholder="Business email"
            className={authInputClass}
          />
          <input
            type="tel"
            value={businessPhone}
            onChange={(e) => setBusinessPhone(e.target.value)}
            placeholder="Business phone"
            className={authInputClass}
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={authSelectClass}
          >
            <option value="">Country</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => saveAndContinue(false)}
          disabled={submitting}
          className={`mt-8 ${authButtonClass}`}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
        <button
          onClick={() => saveAndContinue(true)}
          disabled={submitting}
          className="mt-3 w-full text-center text-sm font-medium text-[#9A9A9A] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
