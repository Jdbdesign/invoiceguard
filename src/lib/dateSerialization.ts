/** Date-only values are stored as UTC midnight; always read/write them through these helpers
 * so the yyyy-mm-dd round-trips exactly regardless of server timezone. */

export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
