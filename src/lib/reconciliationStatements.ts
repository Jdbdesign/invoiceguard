import type { BankTransaction } from "./types";

export interface UnmatchedBankStatementGroup {
  uploadId: string;
  /** Falls back to a placeholder only if a transaction's uploadFileName is
   * missing — shouldn't happen given uploadId is a required FK, but the
   * grouping shouldn't throw if a caller passes an unenriched transaction. */
  fileName: string;
  count: number;
  /** yyyy-mm-dd, inclusive — the earliest and latest transaction dates seen
   * for this statement's still-unmatched transactions specifically, not the
   * statement's own (unrecorded) coverage period. */
  minDate: string;
  maxDate: string;
  transactions: BankTransaction[];
}

// Groups by uploadId (never by fileName — two statements can legitimately
// share a filename) so a re-uploaded statement with the same name still gets
// its own section. Groups are ordered by most-recent transaction activity
// first, since that's the statement a user re-checking reconciliation is
// most likely to care about.
export function groupUnmatchedBankByStatement(
  transactions: BankTransaction[]
): UnmatchedBankStatementGroup[] {
  const groups = new Map<string, UnmatchedBankStatementGroup>();

  for (const transaction of transactions) {
    let group = groups.get(transaction.uploadId);
    if (!group) {
      group = {
        uploadId: transaction.uploadId,
        fileName: transaction.uploadFileName ?? "Unknown statement",
        count: 0,
        minDate: transaction.date,
        maxDate: transaction.date,
        transactions: [],
      };
      groups.set(transaction.uploadId, group);
    }
    group.count += 1;
    if (transaction.date < group.minDate) group.minDate = transaction.date;
    if (transaction.date > group.maxDate) group.maxDate = transaction.date;
    group.transactions.push(transaction);
  }

  return Array.from(groups.values()).sort((a, b) => (a.maxDate < b.maxDate ? 1 : a.maxDate > b.maxDate ? -1 : 0));
}
