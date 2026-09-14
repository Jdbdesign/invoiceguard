/**
 * Case-insensitive, partial-match search used by the Clients page — matches
 * against name or email, same "contains, not exact" behavior as the
 * invoice/reconciliation search fields.
 */
export function matchesClientSearch(
  client: { name: string; email: string },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return client.name.toLowerCase().includes(q) || client.email.toLowerCase().includes(q);
}
