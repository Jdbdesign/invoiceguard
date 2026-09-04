"use client";

import { useState } from "react";
import type { InvoiceItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function InvoiceItemsDisclosure({
  items,
  currency,
}: {
  items: InvoiceItem[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        {items.length} item{items.length === 1 ? "" : "s"}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={2.2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-slate-200 pl-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
              <span>{item.description}</span>
              <span className="tabular-nums text-slate-500">{formatCurrency(item.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
