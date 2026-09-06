import { describe, expect, it } from "vitest";
import { computeMatchCandidates } from "./reconciliationMatching";

describe("computeMatchCandidates", () => {
  it("matches a transaction to its one exact same-amount, same-day payment", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: ["pay_1"] }]);
  });

  it("matches within the 3-day tolerance window in either direction", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-04" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: ["pay_1"] }]);
  });

  it("does not match beyond the 3-day tolerance window", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-05" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: [] }]);
  });

  it("returns every candidate when multiple payments match ambiguously", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01" }],
      [
        { id: "pay_1", amount: 500, paidDateIso: "2026-03-01" },
        { id: "pay_2", amount: 500, paidDateIso: "2026-03-02" },
      ]
    );
    expect(result[0].transactionId).toBe("txn_1");
    expect(result[0].candidatePaymentIds.sort()).toEqual(["pay_1", "pay_2"]);
  });

  it("does not match on a different amount even on the same day", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01" }],
      [{ id: "pay_1", amount: 499, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: [] }]);
  });

  it("tolerates float rounding within the epsilon", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500.005, dateIso: "2026-03-01" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: ["pay_1"] }]);
  });

  it("returns one entry per input transaction, in input order", () => {
    const result = computeMatchCandidates(
      [
        { id: "txn_1", amount: 500, dateIso: "2026-03-01" },
        { id: "txn_2", amount: 999, dateIso: "2026-03-01" },
      ],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result.map((r) => r.transactionId)).toEqual(["txn_1", "txn_2"]);
    expect(result[1].candidatePaymentIds).toEqual([]);
  });
});
