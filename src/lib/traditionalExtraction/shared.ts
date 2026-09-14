import type { ParsedStatementRow } from "../bankStatementExtraction";

export interface TraditionalExtractionResult {
  rows: ParsedStatementRow[];
  lowConfidenceReasons: string[];
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

export function parseAmount(token: string): number {
  return Number(token.replace(/,/g, ""));
}

// pdf-parse wraps individual statement rows across 1-4 lines unpredictably,
// and reference/transaction-ID numbers occasionally split mid-digit-string
// across a line break with no separator. Since callers already collapse
// newlines to single spaces before parsing, a split reference shows up as
// multiple whitespace-separated digit runs — rejoin them into one string.
export function joinDigitRuns(text: string): string {
  return (text.match(/\d+/g) ?? []).join("");
}
