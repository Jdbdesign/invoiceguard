"use client";

import { useState } from "react";
import { UploadStatementButton } from "./UploadStatementButton";
import { UploadsList } from "./UploadsList";
import { MatchBuckets } from "./MatchBuckets";
import type { BankStatementUpload } from "@/lib/types";

// Recomputing matches is just a re-fetch of GET /api/reconciliation/matches
// (that route recomputes suggested/needsReview/unmatched live on every call —
// nothing is cached server-side), so "refresh" only needs to bump a token
// MatchBuckets watches to re-run its existing load effect. Lives here rather
// than inside MatchBuckets because the button has to sit next to
// UploadStatementButton, a sibling component.
export function ReconciliationWorkspace({ uploads }: { uploads: BankStatementUpload[] }) {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <UploadStatementButton />
        <button
          type="button"
          onClick={() => setRefreshToken((t) => t + 1)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          title="Re-run matching against the currently uploaded transactions"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh matches
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MatchBuckets refreshToken={refreshToken} />
        </div>
        <div className="lg:col-span-2">
          <UploadsList uploads={uploads} />
        </div>
      </div>
    </div>
  );
}
