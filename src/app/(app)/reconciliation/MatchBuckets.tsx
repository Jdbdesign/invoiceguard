"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageLoading } from "@/components/ui/Spinner";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/context/ToastContext";
import { requestPasswordConfirmation } from "@/lib/passwordConfirmClient";
import type { Payment, BankTransaction, LinkableInvoice } from "@/lib/types";
import { groupUnmatchedBankByStatement } from "@/lib/reconciliationStatements";
import { LinkManuallyModal, type LinkTarget, type ConfirmLink } from "./LinkManuallyModal";
import { Tabs, type TabItem } from "./Tabs";
import { UnmatchedBankStatementSection } from "./UnmatchedBankStatementSection";

// A suggested/needs-review match target is either an existing Payment record
// or an unpaid Invoice with no Payment yet (see linkInvoiceDirect) — the
// latter is what auto-matching now offers directly, same as "Link manually".
type MatchTarget =
  | { kind: "payment"; payment: Payment }
  | { kind: "invoice"; invoice: LinkableInvoice };

function targetKey(target: MatchTarget): string {
  return target.kind === "payment" ? `payment:${target.payment.id}` : `invoice:${target.invoice.id}`;
}

function targetToLink(target: MatchTarget, bankTransactionId: string): ConfirmLink {
  return target.kind === "payment"
    ? { paymentId: target.payment.id, bankTransactionId }
    : { invoiceId: target.invoice.id, bankTransactionId };
}

// Small muted label appended to a Matched/Needs-review row when the
// transaction's originating statement filename is known — Unmatched — Ours
// rows never get one, since a standalone Payment has no statement to trace.
function StatementLabel({ fileName }: { fileName?: string }) {
  if (!fileName) return null;
  return <span className="text-xs text-slate-400"> — {fileName}</span>;
}

interface MatchesResponse {
  matched: { payment: Payment; transaction: BankTransaction }[];
  suggested: { transaction: BankTransaction; target: MatchTarget }[];
  needsReview: { transaction: BankTransaction; candidates: MatchTarget[] }[];
  unmatchedOurs: Payment[];
  unmatchedBank: BankTransaction[];
}

type TabId = "matched" | "review" | "unmatchedOurs" | "unmatchedBank";

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

export function MatchBuckets({
  refreshToken = 0,
  onRefreshSettled,
}: {
  refreshToken?: number;
  /** Called once the refreshToken-triggered fetch below settles (success or
   * failure), so the "Refresh matches" button in the parent — which owns
   * refreshToken but not this fetch — knows when to clear its loading state.
   * Not called for the initial mount fetch (refreshToken === 0). */
  onRefreshSettled?: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("matched");
  const [clearingStatement, setClearingStatement] = useState<{ uploadId: string; fileName: string } | null>(
    null
  );

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
    // refreshToken starts at 0 on mount and is only ever incremented by the
    // "Refresh matches" button, so > 0 here means this run was user-triggered
    // — that's what gates the completion toast/callback below (a plain page
    // load shouldn't announce itself as a "refresh").
    const isManualRefresh = refreshToken > 0;
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
        if (isManualRefresh) showToast("Matches refreshed");
      })
      .catch(() => {
        if (cancelled) return;
        const message = "Couldn't load reconciliation data.";
        setLoadError(message);
        showToast(message);
      })
      .finally(() => {
        if (cancelled) return;
        if (isManualRefresh) onRefreshSettled?.();
      });
    return () => {
      cancelled = true;
    };
    // refreshToken is the intentional re-run trigger (bumped by the "Refresh
    // matches" button in ReconciliationWorkspace); showToast/onRefreshSettled
    // are stable across renders (context value / parent-owned setState setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // Returns true on success so callers (the modal picker included) can react
  // to the outcome directly, without duplicating this fetch/retry logic.
  // Toast + inline error + load() on failure/success are unchanged for the
  // existing Confirm-button call sites — only the return value is new.
  async function confirmMatch(link: ConfirmLink): Promise<boolean> {
    setActionError(null);
    try {
      const response = await fetchWithPasswordRetry("/api/reconciliation/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(link),
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

  async function clearStatement() {
    if (!clearingStatement) return;
    setActionError(null);
    try {
      const response = await fetchWithPasswordRetry("/api/reconciliation/clear-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: clearingStatement.uploadId }),
      });
      if (!response.ok) {
        const message = "Couldn't clear this statement — try again.";
        setActionError(message);
        showToast(message);
        return;
      }
      const result = (await response.json()) as {
        unlinkedPaymentCount: number;
        deletedTransactionCount: number;
      };
      setClearingStatement(null);
      showToast(
        result.unlinkedPaymentCount > 0
          ? `Statement cleared — ${result.deletedTransactionCount} transaction(s) removed, ${result.unlinkedPaymentCount} confirmed payment(s) unlinked.`
          : `Statement cleared — ${result.deletedTransactionCount} transaction(s) removed.`
      );
      load();
    } catch {
      const message = "Password confirmation was cancelled — nothing was cleared.";
      setActionError(message);
      showToast(message);
    }
  }

  // How many currently-confirmed matches trace back to the statement queued
  // for clearing — computed from data already on the page (matched[].
  // transaction.uploadId), so the confirmation modal can warn with a real
  // number before the user commits, not after. The backend recomputes the
  // authoritative count itself at clear time; this is a preview only.
  const pendingUnlinkCount = useMemo(() => {
    if (!clearingStatement || !data) return 0;
    return data.matched.filter((m) => m.transaction.uploadId === clearingStatement.uploadId).length;
  }, [clearingStatement, data]);

  if (loadError) return <p className="text-sm text-rose-500">{loadError}</p>;
  if (!data) return <PageLoading label="Loading reconciliation data…" />;

  const unmatchedBankGroups = groupUnmatchedBankByStatement(data.unmatchedBank);

  const tabs: TabItem[] = [
    { id: "matched", label: "Matched", count: data.matched.length + data.suggested.length },
    { id: "review", label: "Needs review", count: data.needsReview.length },
    { id: "unmatchedOurs", label: "Unmatched — Ours", count: data.unmatchedOurs.length },
    { id: "unmatchedBank", label: "Unmatched — Bank", count: data.unmatchedBank.length },
  ];

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {actionError}
        </p>
      )}

      <Tabs tabs={tabs} activeId={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      <Card>
        {activeTab === "matched" && (
          <>
            <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
              Confirmed pairings, plus suggested matches awaiting your confirmation.
            </p>
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
                      {transaction.date} — {transaction.description} —{" "}
                      <span className="font-semibold text-slate-900">{transaction.amount}</span> ↔ Invoice{" "}
                      {payment.invoiceId}
                      <StatementLabel fileName={transaction.uploadFileName} />
                    </span>
                    <button
                      onClick={() => rejectMatch(payment.id)}
                      className="text-xs font-medium text-rose-500 hover:text-rose-600"
                    >
                      Undo
                    </button>
                  </li>
                ))}
                {data.suggested.map(({ transaction, target }) => (
                  <li
                    key={targetKey(target)}
                    className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/60 px-5 py-4 text-sm"
                  >
                    <span className="text-slate-700">
                      Suggested: {transaction.date} — {transaction.description} —{" "}
                      <span className="font-semibold text-slate-900">{transaction.amount}</span> ↔{" "}
                      {target.kind === "payment" ? (
                        <>Invoice {target.payment.invoiceId}</>
                      ) : (
                        <>
                          Invoice {target.invoice.invoiceNumber} — {target.invoice.clientName}{" "}
                          <span className="text-xs text-slate-400">(not yet recorded as paid)</span>
                        </>
                      )}
                      <StatementLabel fileName={transaction.uploadFileName} />
                    </span>
                    <button
                      onClick={() => confirmMatch(targetToLink(target, transaction.id))}
                      className={CONFIRM_BUTTON_CLASS}
                    >
                      Confirm
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {activeTab === "review" && (
          <>
            <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
              More than one candidate could match this transaction, or the name is a plausible but inexact
              match — pick the right one.
            </p>
            {data.needsReview.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing needs review.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.needsReview.map(({ transaction, candidates }) => (
                  <li key={transaction.id} className="bg-amber-50/60 px-5 py-4 text-sm">
                    <p className="text-slate-700">
                      {transaction.date} — {transaction.description} —{" "}
                      <span className="font-semibold text-slate-900">{transaction.amount}</span>
                      <StatementLabel fileName={transaction.uploadFileName} />
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {candidates.map((candidate) => (
                        <button
                          key={targetKey(candidate)}
                          onClick={() => confirmMatch(targetToLink(candidate, transaction.id))}
                          className="rounded border border-amber-400 px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                        >
                          {candidate.kind === "payment" ? (
                            <>
                              Invoice {candidate.payment.invoiceId} ({candidate.payment.paidDate})
                            </>
                          ) : (
                            <>Invoice {candidate.invoice.invoiceNumber} — {candidate.invoice.clientName} (unpaid)</>
                          )}
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
          </>
        )}

        {activeTab === "unmatchedOurs" && (
          <>
            <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
              Payments recorded in Remitrak with no matching bank transaction yet.
            </p>
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
                      Invoice {payment.invoiceId} —{" "}
                      <span className="font-semibold text-slate-900">{payment.amount}</span> paid{" "}
                      {payment.paidDate}
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
          </>
        )}

        {activeTab === "unmatchedBank" && (
          <>
            <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
              Bank transactions with no matching payment on record, grouped by the statement they came from.
            </p>
            {unmatchedBankGroups.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing unmatched.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {unmatchedBankGroups.map((group) => (
                  <UnmatchedBankStatementSection
                    key={group.uploadId}
                    group={group}
                    onLinkManually={(transaction) => setLinkTarget({ searchFor: "payment", transaction })}
                    onIgnore={ignoreTransaction}
                    onClearStatement={() =>
                      setClearingStatement({ uploadId: group.uploadId, fileName: group.fileName })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <LinkManuallyModal
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        onConfirm={confirmMatch}
      />

      <ConfirmModal
        open={clearingStatement !== null}
        onClose={() => setClearingStatement(null)}
        onConfirm={clearStatement}
        title="Clear statement?"
        message={
          clearingStatement
            ? pendingUnlinkCount > 0
              ? `This clears every transaction from "${clearingStatement.fileName}" — including unlinking ${pendingUnlinkCount} confirmed payment(s) tied to this statement. Their invoices will remain marked as paid, but the link to this specific bank transaction will be removed. Other statements are not affected. You'll need to upload this statement again to reconcile these transactions. This can't be undone.`
              : `This clears every unmatched transaction from "${clearingStatement.fileName}". Other statements are not affected. You'll need to upload this statement again to reconcile these transactions. This can't be undone.`
            : ""
        }
        confirmLabel="Clear statement"
      />
    </div>
  );
}
