"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageLoading } from "@/components/ui/Spinner";
import { useToast } from "@/context/ToastContext";
import { requestPasswordConfirmation } from "@/lib/passwordConfirmClient";
import type { Payment, BankTransaction } from "@/lib/types";
import { LinkManuallyModal, type LinkTarget } from "./LinkManuallyModal";

interface MatchesResponse {
  matched: { payment: Payment; transaction: BankTransaction }[];
  suggested: { payment: Payment; transaction: BankTransaction }[];
  needsReview: { transaction: BankTransaction; candidates: Payment[] }[];
  unmatchedOurs: Payment[];
  unmatchedBank: BankTransaction[];
}

const CONFIRM_BUTTON_CLASS =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none";

// POST /api/reconciliation/matches and DELETE /api/reconciliation/matches/[id]
// are money-moving actions gated behind requireFreshPasswordConfirmation —
// they return 403 + { code: "PASSWORD_CONFIRMATION_REQUIRED" } whenever the
// user's confirmation has lapsed (very plausible on a first visit right after
// login). AppDataContext's fetchJson already handles this transparently for
// everything that goes through the app-data context, but this component
// intentionally doesn't route through that context, so the same
// request-confirm-then-retry-once pattern is reproduced locally here. It is
// deliberately NOT used for ignoreTransaction, since that route is ungated.
async function fetchWithPasswordRetry(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 403) return response;

  const body = await response.json().catch(() => ({}));
  if (body.code !== "PASSWORD_CONFIRMATION_REQUIRED") return response;

  // Throws if the modal is cancelled — callers must catch this.
  await requestPasswordConfirmation();
  return fetch(url, init);
}

export function MatchBuckets() {
  const { showToast } = useToast();
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);

  async function load() {
    const response = await fetch("/api/reconciliation/matches");
    if (!response.ok) {
      const message = "Couldn't load reconciliation data.";
      setLoadError(message);
      showToast(message);
      return;
    }
    setData(await response.json());
  }

  // Inlined as a .then()/.catch() chain rather than calling the `load`
  // function above directly, matching usePaginatedResource's convention
  // (see its comment) for the same react-hooks/set-state-in-effect
  // constraint — `load` itself is still reused by the action handlers below.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reconciliation/matches")
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          const message = "Couldn't load reconciliation data.";
          setLoadError(message);
          showToast(message);
          return;
        }
        setData(await response.json());
      })
      .catch(() => {
        if (cancelled) return;
        const message = "Couldn't load reconciliation data.";
        setLoadError(message);
        showToast(message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returns true on success so callers (the modal picker included) can react
  // to the outcome directly, without duplicating this fetch/retry logic.
  // Toast + inline error + load() on failure/success are unchanged for the
  // existing Confirm-button call sites — only the return value is new.
  async function confirmMatch(paymentId: string, bankTransactionId: string): Promise<boolean> {
    setActionError(null);
    try {
      const response = await fetchWithPasswordRetry("/api/reconciliation/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, bankTransactionId }),
      });
      if (!response.ok) {
        const message = "Couldn't confirm this match — try again.";
        setActionError(message);
        showToast(message);
        return false;
      }
      load();
      return true;
    } catch {
      const message = "Password confirmation was cancelled — match not confirmed.";
      setActionError(message);
      showToast(message);
      return false;
    }
  }

  async function rejectMatch(paymentId: string) {
    setActionError(null);
    try {
      const response = await fetchWithPasswordRetry(`/api/reconciliation/matches/${paymentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = "Couldn't undo this match — try again.";
        setActionError(message);
        showToast(message);
        return;
      }
      load();
    } catch {
      const message = "Password confirmation was cancelled — match not undone.";
      setActionError(message);
      showToast(message);
    }
  }

  async function ignoreTransaction(transactionId: string) {
    setActionError(null);
    const response = await fetch(`/api/reconciliation/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignored: true }),
    });
    if (!response.ok) {
      const message = "Couldn't ignore this transaction — try again.";
      setActionError(message);
      showToast(message);
      return;
    }
    load();
  }

  if (loadError) return <p className="text-sm text-rose-500">{loadError}</p>;
  if (!data) return <PageLoading label="Loading reconciliation data…" />;

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {actionError}
        </p>
      )}

      <Card>
        <CardHeader
          title="Matched"
          subtitle="Confirmed pairings, plus suggested matches awaiting your confirmation."
        />
        {data.matched.length === 0 && data.suggested.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing matched yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.matched.map(({ payment, transaction }) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
              >
                <span className="text-slate-700">
                  {transaction.date} — {transaction.description} — {transaction.amount} ↔ Invoice{" "}
                  {payment.invoiceId}
                </span>
                <button
                  onClick={() => rejectMatch(payment.id)}
                  className="text-xs font-medium text-rose-500 hover:text-rose-600"
                >
                  Undo
                </button>
              </li>
            ))}
            {data.suggested.map(({ payment, transaction }) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/60 px-5 py-4 text-sm"
              >
                <span className="text-slate-700">
                  Suggested: {transaction.date} — {transaction.description} — {transaction.amount}{" "}
                  ↔ Invoice {payment.invoiceId}
                </span>
                <button
                  onClick={() => confirmMatch(payment.id, transaction.id)}
                  className={CONFIRM_BUTTON_CLASS}
                >
                  Confirm
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Needs review"
          subtitle="More than one payment could match this transaction — pick the right one."
        />
        {data.needsReview.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing needs review.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.needsReview.map(({ transaction, candidates }) => (
              <li key={transaction.id} className="bg-amber-50/60 px-5 py-4 text-sm">
                <p className="text-slate-700">
                  {transaction.date} — {transaction.description} — {transaction.amount}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      onClick={() => confirmMatch(candidate.id, transaction.id)}
                      className="rounded border border-amber-400 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                    >
                      Invoice {candidate.invoiceId} ({candidate.paidDate})
                    </button>
                  ))}
                  <button
                    onClick={() => ignoreTransaction(transaction.id)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    Ignore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Unmatched — Ours"
          subtitle="Payments recorded in InvoiceGuard with no matching bank transaction yet."
        />
        {data.unmatchedOurs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing unmatched.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.unmatchedOurs.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
              >
                <span className="text-slate-700">
                  Invoice {payment.invoiceId} — {payment.amount} paid {payment.paidDate}
                </span>
                <button
                  onClick={() => setLinkTarget({ searchFor: "transaction", payment })}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Link manually
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Unmatched — Bank"
          subtitle="Bank transactions with no matching payment on record."
        />
        {data.unmatchedBank.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing unmatched.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.unmatchedBank.map((transaction) => (
              <li
                key={transaction.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
              >
                <span className="text-slate-700">
                  {transaction.date} — {transaction.description} — {transaction.amount}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setLinkTarget({ searchFor: "payment", transaction })}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Link manually
                  </button>
                  <button
                    onClick={() => ignoreTransaction(transaction.id)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    Ignore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <LinkManuallyModal
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        onConfirm={confirmMatch}
      />
    </div>
  );
}
