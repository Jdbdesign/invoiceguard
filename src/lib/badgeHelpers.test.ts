import { describe, expect, it } from "vitest";
import { bankStatementUploadStatusLabel } from "./badgeHelpers";

describe("bankStatementUploadStatusLabel", () => {
  it("labels needs_review distinctly from the reconciliation matching tab's 'Needs review' label", () => {
    // Guards against the exact confusion this label caused: a statement
    // whose rows aren't reviewed yet has no BankTransaction rows at all, so
    // it can never appear in the unrelated Needs Review matching tab —
    // sharing that tab's exact label made it look like a pending match had
    // gone missing.
    const result = bankStatementUploadStatusLabel("needs_review");
    expect(result.label).not.toBe("Needs review");
    expect(result).toEqual({ label: "Review rows", variant: "warning" });
  });

  it("labels failed", () => {
    expect(bankStatementUploadStatusLabel("failed")).toEqual({ label: "Failed", variant: "danger" });
  });

  it("labels reviewed", () => {
    expect(bankStatementUploadStatusLabel("reviewed")).toEqual({ label: "Reviewed", variant: "success" });
  });

  it("falls back to Processing for any other status", () => {
    expect(bankStatementUploadStatusLabel("uploaded")).toEqual({ label: "Processing", variant: "neutral" });
    expect(bankStatementUploadStatusLabel("parsing")).toEqual({ label: "Processing", variant: "neutral" });
  });
});
