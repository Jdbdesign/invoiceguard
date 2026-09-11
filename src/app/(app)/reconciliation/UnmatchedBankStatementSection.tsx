"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import type { UnmatchedBankStatementGroup } from "@/lib/reconciliationStatements";
import type { BankTransaction } from "@/lib/types";

// Collapsible per-statement group, same useState-toggle shape as
// InvoiceItemsDisclosure — defaults collapsed so a page with many statements
// doesn't dump every transaction on load.
export function UnmatchedBankStatementSection({
  group,
  onLinkManually,
  onIgnore,
  onClearStatement,
}: {
  group: UnmatchedBankStatementGroup;
  onLinkManually: (transaction: BankTransaction) => void;
  onIgnore: (transactionId: string) => void;
  onClearStatement: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dateRangeLabel =
    group.minDate === group.maxDate
      ? formatDate(group.minDate)
      : `${formatDate(group.minDate)} – ${formatDate(group.maxDate)}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <svg
            className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={2.2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-700">{group.fileName}</p>
            <p className="text-xs text-slate-500">
              {dateRangeLabel} · {group.count} unmatched
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onClearStatement}
          className="whitespace-nowrap text-xs font-medium text-rose-500 hover:text-rose-600"
        >
          Clear statement
        </button>
      </div>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/50">
          {group.transactions.map((transaction) => (
            <li
              key={transaction.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 pl-11 text-sm"
            >
              <span className="text-slate-700">
                {transaction.date} — {transaction.description} —{" "}
                <span className="font-semibold text-slate-900">{transaction.amount}</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onLinkManually(transaction)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Link manually
                </button>
                <button
                  onClick={() => onIgnore(transaction.id)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Ignore
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
