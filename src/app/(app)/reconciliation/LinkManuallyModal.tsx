"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { Payment, BankTransaction } from "@/lib/types";

export type LinkTarget =
  | { searchFor: "transaction"; payment: Payment }
  | { searchFor: "payment"; transaction: BankTransaction };

export function LinkManuallyModal({
  target,
  onClose,
  onConfirm,
}: {
  target: LinkTarget | null;
  onClose: () => void;
  onConfirm: (paymentId: string, bankTransactionId: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Payment | BankTransaction)[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
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
      const response = await fetch(
        `/api/reconciliation/search?type=${target.searchFor}&q=${encodeURIComponent(trimmedQuery)}`
      );
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

  async function pick(result: Payment | BankTransaction) {
    if (!target) return;
    setLinkingId(result.id);
    setError(null);
    const [paymentId, bankTransactionId] =
      target.searchFor === "transaction"
        ? [target.payment.id, result.id]
        : [result.id, target.transaction.id];
    const success = await onConfirm(paymentId, bankTransactionId);
    setLinkingId(null);
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
          {visibleResults.map((result) => (
            <li key={result.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {"invoiceId" in result
                  ? `Invoice ${result.invoiceId} — ${result.amount} paid ${result.paidDate}`
                  : `${result.date} — ${result.description} — ${result.amount}`}
              </span>
              <button
                type="button"
                onClick={() => pick(result)}
                disabled={linkingId === result.id}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {linkingId === result.id ? "Linking…" : "Link"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
