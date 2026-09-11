import { describe, expect, it } from "vitest";
import { groupUnmatchedBankByStatement } from "./reconciliationStatements";
import type { BankTransaction } from "./types";

function txn(overrides: Partial<BankTransaction> & Pick<BankTransaction, "id" | "uploadId" | "date">): BankTransaction {
  return {
    description: "Deposit",
    amount: 100,
    uploadFileName: "statement.pdf",
    ...overrides,
  };
}

describe("groupUnmatchedBankByStatement", () => {
  it("returns an empty array for no transactions", () => {
    expect(groupUnmatchedBankByStatement([])).toEqual([]);
  });

  it("groups a single statement's transactions into one group with correct count and date range", () => {
    const groups = groupUnmatchedBankByStatement([
      txn({ id: "t1", uploadId: "up_1", date: "2026-03-05" }),
      txn({ id: "t2", uploadId: "up_1", date: "2026-03-01" }),
      txn({ id: "t3", uploadId: "up_1", date: "2026-03-10" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      uploadId: "up_1",
      fileName: "statement.pdf",
      count: 3,
      minDate: "2026-03-01",
      maxDate: "2026-03-10",
    });
    expect(groups[0].transactions).toHaveLength(3);
  });

  it("keeps a single transaction's minDate and maxDate equal", () => {
    const groups = groupUnmatchedBankByStatement([txn({ id: "t1", uploadId: "up_1", date: "2026-03-05" })]);
    expect(groups[0].minDate).toBe("2026-03-05");
    expect(groups[0].maxDate).toBe("2026-03-05");
  });

  it("separates transactions into distinct groups by uploadId, even with identical filenames", () => {
    const groups = groupUnmatchedBankByStatement([
      txn({ id: "t1", uploadId: "up_1", date: "2026-01-01", uploadFileName: "statement.pdf" }),
      txn({ id: "t2", uploadId: "up_2", date: "2026-02-01", uploadFileName: "statement.pdf" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.uploadId))).toEqual(new Set(["up_1", "up_2"]));
  });

  it("orders groups by most recent transaction date first", () => {
    const groups = groupUnmatchedBankByStatement([
      txn({ id: "t1", uploadId: "up_old", date: "2026-01-15" }),
      txn({ id: "t2", uploadId: "up_new", date: "2026-03-20" }),
      txn({ id: "t3", uploadId: "up_mid", date: "2026-02-10" }),
    ]);
    expect(groups.map((g) => g.uploadId)).toEqual(["up_new", "up_mid", "up_old"]);
  });

  it("falls back to a placeholder filename when uploadFileName is missing", () => {
    const groups = groupUnmatchedBankByStatement([
      { id: "t1", uploadId: "up_1", date: "2026-03-01", description: "Deposit", amount: 100 },
    ]);
    expect(groups[0].fileName).toBe("Unknown statement");
  });

  it("does not mutate the input array or its transaction objects", () => {
    const input = [txn({ id: "t1", uploadId: "up_1", date: "2026-03-01" })];
    const snapshot = JSON.parse(JSON.stringify(input));
    groupUnmatchedBankByStatement(input);
    expect(input).toEqual(snapshot);
  });
});
