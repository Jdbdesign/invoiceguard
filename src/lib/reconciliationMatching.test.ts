import { describe, expect, it } from "vitest";
import { classifyMatch, computeMatchCandidates, nameMatchTier } from "./reconciliationMatching";

describe("nameMatchTier", () => {
  it("tiers an exact same-name match as exact", () => {
    expect(nameMatchTier("Chidinma Okafor", "CHIDINMA OKAFOR")).toBe("exact");
  });

  it("tiers an exact name match as exact even inside a noisy bank narration", () => {
    expect(nameMatchTier("Chidinma Okafor", "TRANSFER FROM CHIDINMA OKAFOR REF00123")).toBe(
      "exact"
    );
  });

  it("is case- and punctuation-insensitive for an exact match", () => {
    expect(nameMatchTier("O'Brien Adeyemi", "TRF/obrien adeyemi/NIP")).toBe("exact");
  });

  it("tiers a plausible-but-abbreviated name as review", () => {
    // "Demola O." is a truncated first name (missing leading "A") plus a bare
    // last-name initial for "Ademola Olaniyi" — plausible, not certain.
    expect(nameMatchTier("Ademola Olaniyi", "Demola O.")).toBe("review");
  });

  it("tiers a truncated first name as review", () => {
    expect(nameMatchTier("Chidinma Okafor", "CHIDI OKAFOR")).toBe("review");
  });

  it("does not match two different people who share only a first name", () => {
    // Same first name, unrelated surname — must not reach even the review
    // tier, since a shared first name plus a coincidental amount match is not
    // a plausible match on its own.
    expect(nameMatchTier("Ade Bello", "ADE BALOGUN")).toBe("none");
  });

  it("does not match two entirely unrelated names", () => {
    expect(nameMatchTier("Funmilayo Adeyemi", "JOHN SMITH TRANSFER")).toBe("none");
  });

  it("does not match when a middle name in the client's name has no counterpart at all", () => {
    // Documented trade-off: requiring every client-name token to be satisfied
    // avoids false positives, at the cost of this false negative. A dropped
    // middle name means no candidate is offered (not even for review) —
    // acceptable since "Link manually" remains available.
    expect(nameMatchTier("Ngozi Chika Eze", "NGOZI EZE")).toBe("none");
  });

  it("returns none when the description is blank", () => {
    expect(nameMatchTier("Chidinma Okafor", "")).toBe("none");
  });
});

describe("computeMatchCandidates", () => {
  it("produces an exact-tier payment candidate for a same-amount, same-day, matching-name payment", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "CHIDINMA OKAFOR" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result).toEqual([
      { transactionId: "txn_1", candidates: [{ kind: "payment", id: "pay_1", tier: "exact" }] },
    ]);
  });

  it("matches within the 3-day tolerance window in either direction", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-04", description: "Chidinma Okafor" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result[0].candidates).toEqual([{ kind: "payment", id: "pay_1", tier: "exact" }]);
  });

  it("does not match a payment beyond the 3-day tolerance window", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-05", description: "Chidinma Okafor" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result[0].candidates).toEqual([]);
  });

  it("does not match a payment on a different amount even on the same day with a matching name", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "Chidinma Okafor" }],
      [{ id: "pay_1", amount: 499, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result[0].candidates).toEqual([]);
  });

  it("tolerates float rounding within the amount epsilon", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500.005, dateIso: "2026-03-01", description: "Chidinma Okafor" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result[0].candidates).toEqual([{ kind: "payment", id: "pay_1", tier: "exact" }]);
  });

  it("does NOT offer a payment as a candidate when the amount/date match but the name is unrelated", () => {
    // This is the core false-positive guard: amount+date coincidence alone
    // must never be enough, even for the review bucket.
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "JOHN SMITH TRANSFER" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result[0].candidates).toEqual([]);
  });

  it("returns a review-tier candidate for a plausible-but-inexact name at a matching amount/date", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "Demola O." }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Ademola Olaniyi" }],
      []
    );
    expect(result[0].candidates).toEqual([{ kind: "payment", id: "pay_1", tier: "review" }]);
  });

  it("returns every candidate, each correctly tiered, when multiple payments match ambiguously", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "Chidinma Okafor" }],
      [
        { id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" },
        { id: "pay_2", amount: 500, paidDateIso: "2026-03-02", clientName: "Chidinma Okafor" },
      ],
      []
    );
    const sorted = [...result[0].candidates].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted).toEqual([
      { kind: "payment", id: "pay_1", tier: "exact" },
      { kind: "payment", id: "pay_2", tier: "exact" },
    ]);
  });

  it("returns one entry per input transaction, in input order", () => {
    const result = computeMatchCandidates(
      [
        { id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "Chidinma Okafor" },
        { id: "txn_2", amount: 999, dateIso: "2026-03-01", description: "Chidinma Okafor" },
      ],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01", clientName: "Chidinma Okafor" }],
      []
    );
    expect(result.map((r) => r.transactionId)).toEqual(["txn_1", "txn_2"]);
    expect(result[1].candidates).toEqual([]);
  });

  it("produces an exact-tier invoice candidate for a same-amount, matching-name unpaid invoice", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 750, dateIso: "2026-03-01", description: "Chidinma Okafor" }],
      [],
      [{ id: "inv_1", amount: 750, clientName: "Chidinma Okafor" }]
    );
    expect(result[0].candidates).toEqual([{ kind: "invoice", id: "inv_1", tier: "exact" }]);
  });

  it("does not offer an invoice candidate whose balance doesn't match the transaction amount", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 750, dateIso: "2026-03-01", description: "Chidinma Okafor" }],
      [],
      [{ id: "inv_1", amount: 751, clientName: "Chidinma Okafor" }]
    );
    expect(result[0].candidates).toEqual([]);
  });

  it("does not offer an invoice candidate whose amount matches but whose client name is unrelated", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 750, dateIso: "2026-03-01", description: "JOHN SMITH TRANSFER" }],
      [],
      [{ id: "inv_1", amount: 750, clientName: "Chidinma Okafor" }]
    );
    expect(result[0].candidates).toEqual([]);
  });

  it("combines payment and invoice candidates for the same transaction", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01", description: "Chidinma Okafor" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-04", clientName: "Chidinma Okafor" }],
      [{ id: "inv_1", amount: 500, clientName: "Chidinma Okafor" }]
    );
    const sorted = [...result[0].candidates].sort((a, b) => a.kind.localeCompare(b.kind));
    expect(sorted).toEqual([
      { kind: "invoice", id: "inv_1", tier: "exact" },
      { kind: "payment", id: "pay_1", tier: "exact" },
    ]);
  });
});

describe("classifyMatch", () => {
  it("classifies no candidates as bucket none", () => {
    expect(classifyMatch([])).toEqual({ bucket: "none" });
  });

  it("classifies a single exact-tier candidate as auto", () => {
    const candidate = { kind: "payment" as const, id: "pay_1", tier: "exact" as const };
    expect(classifyMatch([candidate])).toEqual({ bucket: "auto", candidate });
  });

  it("classifies a single review-tier candidate as review, not auto", () => {
    const candidate = { kind: "payment" as const, id: "pay_1", tier: "review" as const };
    expect(classifyMatch([candidate])).toEqual({ bucket: "review", candidates: [candidate] });
  });

  it("classifies a single invoice-kind exact candidate as auto", () => {
    const candidate = { kind: "invoice" as const, id: "inv_1", tier: "exact" as const };
    expect(classifyMatch([candidate])).toEqual({ bucket: "auto", candidate });
  });

  it("classifies two tied exact-tier candidates as review, not auto", () => {
    // Even though each candidate is individually an "exact" name match, two
    // of them for one transaction is ambiguous and must not silently
    // auto-pick one.
    const a = { kind: "payment" as const, id: "pay_1", tier: "exact" as const };
    const b = { kind: "invoice" as const, id: "inv_1", tier: "exact" as const };
    expect(classifyMatch([a, b])).toEqual({ bucket: "review", candidates: [a, b] });
  });
});
