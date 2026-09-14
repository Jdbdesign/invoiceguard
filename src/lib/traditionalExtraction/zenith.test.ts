import { describe, expect, it } from "vitest";
import { extractTraditional } from "../traditionalBankStatementExtraction";

// No Opening Balance line here deliberately — most tests below check row
// parsing in isolation, not the balance-reconciliation check (which needs
// every row from Opening Balance onward to reconcile, and has its own
// dedicated tests with a self-contained, gap-free fixture further down).
const HEADER = `ZENITH BANK PLC
ACCOUNT NAME: OLAYINKA ISAIAH JACOBS Account Statement
Period: 14/08/2026 TO 14/09/2026
DATE DESCRIPTION DEBIT CREDIT VALUE DATE BALANCE
`;

describe("extractTraditional (Zenith)", () => {
  it("parses a clean row for both a debit and a credit, reading sign from which column is non-zero", () => {
    const text = `${HEADER}15/08/2026 NIP CR/MOB/OLAYINKA ISAIAH
JACOBS/PALM / Personal 50,000.00 0.00 15/08/2026 300,358.99
21/08/2026 CIP CR/ ENOMA AHURUONYE
CHRIS/Transfer from ENOMA AHURUONYE
CHRIS
0.00 30,000.00 21/08/2026 230,051.47`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      {
        date: "2026-08-15",
        description: "NIP CR/MOB/OLAYINKA ISAIAH JACOBS/PALM / Personal",
        amount: -50000,
      },
      {
        date: "2026-08-21",
        description: "CIP CR/ ENOMA AHURUONYE CHRIS/Transfer from ENOMA AHURUONYE CHRIS",
        amount: 30000,
      },
    ]);
  });

  it("does not treat the 'Period: DATE TO DATE' header line as a transaction row", () => {
    const text = `${HEADER}15/08/2026 NIP CHARGE + VAT 26.88 0.00 15/08/2026 300,332.11`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      date: "2026-08-15",
      description: "NIP CHARGE + VAT",
      amount: -26.88,
    });
  });

  it("reconciles cleanly (no low-confidence reason) when every row from Opening Balance onward is present", () => {
    // Real, consecutive excerpt from the sample: Opening Balance plus the
    // first three rows exactly as they appear, nothing skipped.
    const text = `${HEADER}Opening Balance 0.00 0.00 350,358.99
15/08/2026 NIP CR/MOB/OLAYINKA ISAIAH
JACOBS/PALM / Personal 50,000.00 0.00 15/08/2026 300,358.99
15/08/2026 NIP CHARGE + VAT 26.88 0.00 15/08/2026 300,332.11
15/08/2026 FGN Stamp Duty//NIP CR/MOB/OLAYINKA
ISAIAH JACOBS/PALM / Personal 50.00 0.00 15/08/2026 300,282.11`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(3);
    expect(result.lowConfidenceReasons).toEqual([]);
  });

  it("flags a balance-reconciliation mismatch when the statement's own running balance doesn't add up", () => {
    const text = `${HEADER}Opening Balance 0.00 0.00 1,000.00
01/09/2026 Deposit 0.00 200.00 01/09/2026 1,200.00
02/09/2026 Withdrawal 100.00 0.00 02/09/2026 999.00`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.lowConfidenceReasons).toEqual([
      "Extracted transactions don't reconcile with this statement's own Opening Balance and running balance (expected a closing balance of 1100.00 from Opening Balance 1000.00 plus extracted transactions, but the statement's own last balance is 999.00) — some rows may be missing or miscounted.",
    ]);
  });

  it("flags zero extracted rows", () => {
    const result = extractTraditional(HEADER);

    expect(result.rows).toEqual([]);
    expect(result.lowConfidenceReasons).toEqual(["No transactions could be parsed from this statement."]);
  });
});
