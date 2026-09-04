export interface ParsedInvoiceItem {
  description: string;
  amount: number;
}

// Shared `include` shape for every prisma.invoice query whose result flows
// through mapInvoice — keeps item ordering consistent everywhere without
// repeating the orderBy at each call site.
export const INVOICE_ITEMS_INCLUDE = {
  orderBy: { position: "asc" as const },
};

// Returns [] when `raw` is absent (flat single-line invoice, the common
// case), the parsed+validated items when it's a well-formed array, or null
// if it's present but malformed — callers should treat null as a 400.
export function parseInvoiceItems(raw: unknown): ParsedInvoiceItem[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;

  const items: ParsedInvoiceItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const description = String(record.description ?? "").trim();
    const amount = Number(record.amount);
    if (!description || !Number.isFinite(amount) || amount <= 0) return null;
    items.push({ description, amount });
  }
  return items;
}

export function sumInvoiceItems(items: ParsedInvoiceItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}
