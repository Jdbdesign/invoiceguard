import { describe, expect, it } from "vitest";
import { extractTraditional } from "../traditionalBankStatementExtraction";

// No Total Debit/Credit here deliberately — most tests below check row
// parsing in isolation, not the declared-totals cross-check (which has its
// own dedicated test with fixture-matched totals further down).
const HEADER = `This is a computer generated Email. Please address all enquiries to Guaranty Trust Bank Ltd Systems and Control Group 178, Awolowo Road, Ikoyi.
Statement Period :14-Aug-2026 to 14-Sep-2026
Print. Date 14-Sep-2026
Opening Balance 387.40
Trans. Date Value. Date Reference Debits Credits Balance Originating Branch Remarks
`;

describe("extractTraditional (GTBank)", () => {
  it("parses a clean debit row, deriving sign from the balance delta since there's no debit/credit placeholder", () => {
    const text = `${HEADER}16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      {
        date: "2026-08-16",
        description: "635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE",
        amount: -100,
      },
    ]);
  });

  it("parses a clean credit row from a balance increase", () => {
    const text = `${HEADER}16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE
31-Aug-2026 31-Aug-2026 ' 2.25 289.65 AGBARA BRANCH INTEREST CAPITALISED`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({
      date: "2026-08-31",
      description: "AGBARA BRANCH INTEREST CAPITALISED",
      amount: 2.25,
    });
  });

  it("correctly parses an amount with no leading zero before the decimal (e.g. '.23' instead of '0.23')", () => {
    const text = `${HEADER}16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE
31-Aug-2026 31-Aug-2026 ' .23 287.17 AGBARA BRANCH WITHHOLDING TAX`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({
      date: "2026-08-31",
      description: "AGBARA BRANCH WITHHOLDING TAX",
      amount: -0.23,
    });
  });

  it("does not treat the 'Statement Period ... to ...' line as a row anchor (dates aren't adjacent)", () => {
    const text = `${HEADER}16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
  });

  it("joins a reference number that wraps across multiple pdf-parse lines", () => {
    const text = `${HEADER}16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE
07-Sep-2026 07-Sep-2026 '0000092026090711
2750NIP
50,000.00 50,287.40 635 AKIN ADESOLA TRANSFER BETWEEN CUSTOMERS`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({
      date: "2026-09-07",
      description: "635 AKIN ADESOLA TRANSFER BETWEEN CUSTOMERS",
      amount: 50000,
    });
  });

  it("trims pdf-parse's own page-break marker and trailing boilerplate out of a row's description", () => {
    // Real shape: a row's chunk can span a page boundary, picking up
    // pdf-parse's own "-- N of M --" marker plus the repeated letterhead
    // boilerplate before the next real anchor.
    const text = `${HEADER}31-Aug-2026 31-Aug-2026 ' .23 287.17 AGBARA BRANCH WITHHOLDING TAX 0127360998:WTax.Pd:01-08-
2026to 31-08-2026Interest run

-- 1 of 3 --

This is a computer generated Email. Please address all enquiries to Guaranty Trust Bank Ltd Systems and Control Group 178, Awolowo Road, Ikoyi.
31-Aug-2026 31-Aug-2026 ' 2.25 289.42 AGBARA BRANCH INTEREST CAPITALISED`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      date: "2026-08-31",
      description: "AGBARA BRANCH WITHHOLDING TAX 0127360998:WTax.Pd:01-08- 2026to 31-08-2026Interest run",
      amount: -0.23,
    });
  });

  it("trims the page-break marker even when it's the very last thing in the statement", () => {
    const text = `${HEADER}16-Aug-2026 16-Aug-2026 ' 100.00 287.40 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE

-- 3 of 3 --
`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      date: "2026-08-16",
      description: "635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE",
      amount: -100,
    });
  });

  it("flags a Total Debit / Total Credit mismatch against the statement's own declared totals", () => {
    const text = `This is a computer generated Email. Please address all enquiries to Guaranty Trust Bank Ltd Systems and Control Group 178, Awolowo Road, Ikoyi.
Total Debit 100.00
Total Credit 0.00
Opening Balance 1000.00
Trans. Date Value. Date Reference Debits Credits Balance Originating Branch Remarks
16-Aug-2026 16-Aug-2026 ' 50.00 950.00 635 AKIN ADESOLA Stamp Duties STAMP DUTY CHARGE`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.lowConfidenceReasons).toEqual([
      "Extracted totals don't match this statement's own declared totals (expected 100.00 debit / 0.00 credit, got 50.00 debit / 0.00 credit) — some rows may be missing or miscounted.",
    ]);
  });

  it("flags zero extracted rows", () => {
    const result = extractTraditional(HEADER);

    expect(result.rows).toEqual([]);
    expect(result.lowConfidenceReasons).toEqual(["No transactions could be parsed from this statement."]);
  });
});
