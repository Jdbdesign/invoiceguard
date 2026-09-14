import type { Prisma } from "@prisma/client";

/**
 * Builds the Prisma OR-clause fragment for invoice search — matches against
 * invoice number, description, or client name, same case-insensitive
 * `contains` convention already used in reconciliation/search/route.ts.
 * Returns undefined for an empty query so callers can spread it into an
 * existing `where` without adding a no-op OR.
 */
export function invoiceSearchWhere(query: string): Prisma.InvoiceWhereInput | undefined {
  const q = query.trim();
  if (!q) return undefined;
  return {
    OR: [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ],
  };
}
