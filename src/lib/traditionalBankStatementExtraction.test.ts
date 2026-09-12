import { describe, expect, it } from "vitest";
import { extractTraditional } from "./traditionalBankStatementExtraction";

describe("extractTraditional", () => {
  it("parses a clean row for both a credit and a debit", () => {
    const text = `Trans. Time Value Date Description Debit(₦) Credit(₦) Balance After(₦) Channel Transaction Reference
07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) -- 27,000.00 27,000.00 Mobile 260807010201496141065410
07 Aug 2026 01:25:49 07 Aug 2026 Stamp Duty 50.00 -- 0.00 Mobile 260807550101496166618264`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      { date: "2026-08-07", description: "OWealth Withdrawal(Transaction Payment)", amount: 27000 },
      { date: "2026-08-07", description: "Stamp Duty", amount: -50 },
    ]);
    expect(result.lowConfidenceReasons).toEqual([]);
  });

  it("joins a description and reference number that wrap across multiple pdf-parse lines", () => {
    const text = `10 Aug 2026 09:06:15 10 Aug 2026
Transfer to OLAYINKA JACOBS | Momo Payment
Service Bank | 8164665220 | Personal Transfer
500.00 -- 0.00 Mobile
1000042608100806211678
36068098`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      {
        date: "2026-08-10",
        description: "Transfer to OLAYINKA JACOBS | Momo Payment Service Bank | 8164665220 | Personal Transfer",
        amount: -500,
      },
    ]);
  });

  it("silently dedupes an exact duplicate row (same reference, same sign and amount)", () => {
    const text = `01 Jan 2026 00:00:00 01 Jan 2026 Interest -- 10.00 10.00 Mobile 111111111111
01 Jan 2026 00:00:00 01 Jan 2026 Interest -- 10.00 10.00 Mobile 111111111111`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([{ date: "2026-01-01", description: "Interest", amount: 10 }]);
    expect(result.lowConfidenceReasons).toEqual([]);
  });

  it("flags both occurrences of a conflicting-sign duplicate reference as needsReview, never guessing", () => {
    const text = `07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) -- 27,000.00 60,481.63 Mobile 260807010201496141065410
07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) 27,000.00 -- 60,481.63 Mobile 260807010201496141065410`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].needsReview).toBe(true);
    expect(result.rows[1].needsReview).toBe(true);
    expect(result.rows[0].amount).toBe(27000);
    expect(result.rows[1].amount).toBe(-27000);
    expect(result.rows[0].reviewReason).toContain("260807010201496141065410");
    expect(result.lowConfidenceReasons).toEqual([
      "2 transaction(s) have a conflicting duplicate elsewhere in the statement and need manual review.",
    ]);
  });

  it("flags a declared-count mismatch against the statement's own Credit Count / Debit Count summary", () => {
    const text = `Credit Count
2
Total Credit
₦100.00
Closing Balance
₦0.00
Debit Count
1
Total Debit
₦50.00
Opening Balance
₦0.00
Period: - 01 Jan 2026 31 Jan 2026 Wallet Account
01 Jan 2026 00:00:00 01 Jan 2026 Deposit -- 100.00 100.00 Mobile 111111111111`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.lowConfidenceReasons).toEqual([
      "Extracted row counts don't match this statement's own declared totals (expected 2 credit / 1 debit, got 1 credit / 0 debit) — some rows may be missing or miscounted.",
    ]);
  });

  it("flags zero extracted rows", () => {
    const result = extractTraditional("no transactions here at all");

    expect(result.rows).toEqual([]);
    expect(result.lowConfidenceReasons).toEqual(["No transactions could be parsed from this statement."]);
  });
});
