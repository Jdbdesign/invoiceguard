export type DetectedFormat = "owealth" | "gtbank" | "zenith" | "palmpay" | "unknown";

// OWealth's row anchor (Trans. Time immediately followed by Value Date, e.g.
// "07 Aug 2026 01:25:48 07 Aug 2026") is unique to this format — none of the
// other three use a colon-separated time between two "DD Mon YYYY" dates —
// so it doubles as a detection signal for excerpts that contain real
// transaction rows but not the full page header (e.g. isolated test/sample
// snippets).
const OWEALTH_ANCHOR_RE = /\d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} \d{2} [A-Za-z]{3} \d{4}/;

// Order matters only in that each check must not accidentally match another
// format's fingerprint text — verified against real statement samples for
// all four formats. Checked as literal substrings (not regexes) since each
// fingerprint is a fixed header/branding string that doesn't need pattern
// matching, and literal substrings can't suffer from unintended regex
// backtracking or escaping bugs.
export function detectFormat(statementText: string): DetectedFormat {
  if (statementText.includes("Guaranty Trust Bank")) return "gtbank";
  if (statementText.includes("ZENITH BANK")) return "zenith";
  if (statementText.includes("Transaction Date Transaction Detail")) return "palmpay";
  if (statementText.includes("Trans. Time Value Date") || OWEALTH_ANCHOR_RE.test(statementText)) return "owealth";
  return "unknown";
}
