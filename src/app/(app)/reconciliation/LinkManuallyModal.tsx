"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { Payment, BankTransaction, LinkableInvoice } from "@/lib/types";

export type LinkTarget =
  | { searchFor: "transaction"; payment: Payment }
  | { searchFor: "payment"; transaction: BankTransaction };

type SearchResult =
  | ({ kind: "payment" } & Payment)
  | ({ kind: "invoice" } & LinkableInvoice)
  | ({ kind: "transaction" } & BankTransaction);

export type ConfirmLink =
  | { paymentId: string; bankTransactionId: string }
  | { invoiceId: string; bankTransactionId: string };

export function LinkManuallyModal({
  target,
  onClose,
  onConfirm,
}: {
  target: LinkTarget | null;
  onClose: () => void;
  onConfirm: (link: ConfirmLink) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset search state whenever a new target is set (or the modal closes),
  // during render rather than in an effect — same convention as
  // ReminderModal's draftKey/lastDraftKey reset: this is intrinsic React
  // state derived from a prop change, not something synced from an external
  // system, so react-hooks/set-state-in-effect correctly flags doing it in
  // an effect body.
  const [lastTarget, setLastTarget] = useState<LinkTarget | null>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    setQuery("");
    setResults([]);
    setError(null);
  }

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!target || !trimmedQuery) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signals the debounced fetch below has started; same accepted pattern as reset-password/page.tsx's token-check effect, not a synced-from-external-system value
    setLoading(true);
    const timeout = setTimeout(async () => {
      const params = new URLSearchParams({ type: target.searchFor, q: trimmedQuery });
      // Only meaningful (and only sent) for the "payment" direction — lets the
      // API also offer unpaid invoices whose remaining balance exactly
      // matches *this* transaction as direct link targets.
      if (target.searchFor === "payment") {
        params.set("transactionId", target.transaction.id);
      }
      const response = await fetch(`/api/reconciliation/search?${params.toString()}`);
      const data = await response.json().catch(() => ({ results: [] }));
      setResults(data.results ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, target]);

  // Stale results from a since-cleared query are hidden here (derived at
  // render time) rather than cleared via a synchronous setState in the
  // effect above, for the same set-state-in-effect reason.
  const visibleResults = trimmedQuery ? results : [];
  const visibleLoading = trimmedQuery ? loading : false;

  async function pick(result: SearchResult) {
    if (!target) return;
    const key = `${result.kind}:${result.id}`;
    setLinkingKey(key);
    setError(null);
    const bankTransactionId = target.searchFor === "transaction" ? result.id : target.transaction.id;
    const link: ConfirmLink =
      target.searchFor === "transaction"
        ? { paymentId: target.payment.id, bankTransactionId }
        : result.kind === "invoice"
          ? { invoiceId: result.id, bankTransactionId }
          : { paymentId: result.id, bankTransactionId };
    const success = await onConfirm(link);
    setLinkingKey(null);
    if (success) onClose();
    else setError("Couldn't link this pair — try again.");
  }

  return (
    <Modal open={target !== null} onClose={onClose} title="Link manually">
      <div className="space-y-4">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by amount, client name, or invoice number"
          className="input"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {visibleLoading && <p className="text-sm text-slate-400">Searching…</p>}
        {!visibleLoading && trimmedQuery && visibleResults.length === 0 && (
          <p className="text-sm text-slate-400">No matches.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {visibleResults.map((result) => {
            const key = `${result.kind}:${result.id}`;
            return (
              <li key={key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {result.kind === "invoice" ? (
                    <>
                      Invoice {result.invoiceNumber} — {result.clientName} —{" "}
                      {result.amount} {result.currency} outstanding{" "}
                      <span className="text-xs text-slate-400">(not yet recorded as paid)</span>
                    </>
                  ) : result.kind === "payment" ? (
                    <>
                      Invoice {result.invoiceId} — {result.amount} paid {result.paidDate}
                    </>
                  ) : (
                    <>
                      {result.date} — {result.description} — {result.amount}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => pick(result)}
                  disabled={linkingKey === key}
                  className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {linkingKey === key ? "Linking…" : "Link"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
