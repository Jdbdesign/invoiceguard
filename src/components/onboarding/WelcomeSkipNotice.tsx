"use client";

import { useState } from "react";
import Link from "next/link";

export function WelcomeSkipNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-[#2C2C2C] bg-[#1C1C1C] px-4 py-3 text-xs text-[#9A9A9A]">
      <p>
        Add your logo anytime in{" "}
        <Link href="/settings" className="font-medium text-[#007ACC] hover:text-[#3DA3E0]">
          Settings
        </Link>
        .
      </p>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-[#6E6E6E] transition hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
