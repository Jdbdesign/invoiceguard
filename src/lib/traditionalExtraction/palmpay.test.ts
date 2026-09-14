import { describe, expect, it } from "vitest";
import { extractTraditional } from "../traditionalBankStatementExtraction";

// No declared Total Money In/Out here deliberately — most tests below check
// row parsing in isolation, not the totals cross-check (which has its own
// dedicated test with fixture-matched totals further down).
const HEADER = `Account Statement
Name OLAYINKA ISAIAH JACOBS
Statement Period 08/14/2026 - 09/14/2026
Print Time 09/14/2026 10:55:53 AM
Transaction Date Transaction Detail Money In (NGN) Money Out (NGN) Transaction ID
`;

describe("extractTraditional (PalmPay)", () => {
  it("parses a clean row for both a debit and a credit, reading sign directly from the +/- prefix", () => {
    const text = `${HEADER}09/14/2026 08:58:34 AM Send to OLAYINKA JACOBS -500.00 033ari88eb05
09/14/2026 06:49:31 AM CashBox Interest +3.56 u83arc95942h`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      { date: "2026-09-14", description: "Send to OLAYINKA JACOBS", amount: -500 },
      { date: "2026-09-14", description: "CashBox Interest", amount: 3.56 },
    ]);
    expect(result.lowConfidenceReasons).toEqual([]);
  });

  it("joins a description and a numeric transaction ID that wrap across multiple pdf-parse lines", () => {
    const text = `${HEADER}09/13/2026 06:31:28 PM Send to ADIGWE OWEMADU
PATRICIA -2450.00 033aqe32a500
09/13/2026 04:18:45 PM Stamp Duty -50.00 20260913112518455035
1184927
09/13/2026 12:36:26 PM Send to OLAYINKA JACOBS -30000.00 033apxncea02`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      { date: "2026-09-13", description: "Send to ADIGWE OWEMADU PATRICIA", amount: -2450 },
      { date: "2026-09-13", description: "Stamp Duty", amount: -50 },
      { date: "2026-09-13", description: "Send to OLAYINKA JACOBS", amount: -30000 },
    ]);
  });

  it("does not produce a spurious row from the 'Print Time' header line matching the row anchor shape", () => {
    const text = `${HEADER}09/14/2026 08:58:34 AM Send to OLAYINKA JACOBS -500.00 033ari88eb05`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      date: "2026-09-14",
      description: "Send to OLAYINKA JACOBS",
      amount: -500,
    });
  });

  it("flags a Total Money In / Total Money Out mismatch against the statement's own declared totals", () => {
    const text = `Total Money In ₦100.00 Statement Period 08/14/2026 - 09/14/2026
Total Money Out ₦50.00 Print Time 09/14/2026 10:55:53 AM
Transaction Date Transaction Detail Money In (NGN) Money Out (NGN) Transaction ID
09/14/2026 08:58:34 AM CashBox Interest +100.00 u83arc95942h`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.lowConfidenceReasons).toEqual([
      "Extracted totals don't match this statement's own declared totals (expected ₦100.00 in / ₦50.00 out, got ₦100.00 in / ₦0.00 out) — some rows may be missing or miscounted.",
    ]);
  });

  it("flags zero extracted rows", () => {
    const result = extractTraditional(HEADER);

    expect(result.rows).toEqual([]);
    expect(result.lowConfidenceReasons).toEqual(["No transactions could be parsed from this statement."]);
  });
});
