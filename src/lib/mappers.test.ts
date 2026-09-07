import { describe, expect, it } from "vitest";
import { mapBankStatementUpload, mapBankTransaction, mapLinkableInvoice, mapPayment } from "./mappers";

describe("mapPayment", () => {
  it("maps a fully-populated row, resolving invoiceId to the invoice number", () => {
    const result = mapPayment({
      id: "pay_1",
      amount: 500,
      paidDate: new Date("2026-03-01T00:00:00.000Z"),
      installmentId: "inst_1",
      reconciledAt: new Date("2026-03-02T00:00:00.000Z"),
      bankTransactionId: "txn_1",
      invoice: { invoiceNumber: "INV-001" },
    });
    expect(result).toEqual({
      id: "pay_1",
      invoiceId: "INV-001",
      installmentId: "inst_1",
      amount: 500,
      paidDate: "2026-03-01",
      reconciledAt: "2026-03-02",
      bankTransactionId: "txn_1",
    });
  });

  it("maps null optional fields to undefined, never null", () => {
    const result = mapPayment({
      id: "pay_2",
      amount: 200,
      paidDate: new Date("2026-03-01T00:00:00.000Z"),
      installmentId: null,
      reconciledAt: null,
      bankTransactionId: null,
      invoice: { invoiceNumber: "INV-002" },
    });
    expect(result.installmentId).toBeUndefined();
    expect(result.reconciledAt).toBeUndefined();
    expect(result.bankTransactionId).toBeUndefined();
  });
});

describe("mapBankStatementUpload", () => {
  it("maps a row with all fields present", () => {
    const result = mapBankStatementUpload({
      id: "up_1",
      fileUrl: "https://blob.example/statement.pdf",
      fileName: "statement.pdf",
      status: "reviewed",
      errorMessage: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      reviewedAt: new Date("2026-03-02T00:00:00.000Z"),
    });
    expect(result).toEqual({
      id: "up_1",
      fileUrl: "https://blob.example/statement.pdf",
      fileName: "statement.pdf",
      status: "reviewed",
      errorMessage: undefined,
      createdAt: "2026-03-01T00:00:00.000Z",
      reviewedAt: "2026-03-02",
    });
  });
});

describe("mapBankTransaction", () => {
  it("maps a row, defaulting ignoredAt to undefined when null", () => {
    const result = mapBankTransaction({
      id: "txn_1",
      uploadId: "up_1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      description: "Deposit from Jane Doe",
      amount: 500,
      ignoredAt: null,
    });
    expect(result).toEqual({
      id: "txn_1",
      uploadId: "up_1",
      date: "2026-03-01",
      description: "Deposit from Jane Doe",
      amount: 500,
      ignoredAt: undefined,
    });
  });

  it("converts a non-null ignoredAt to an ISO date string", () => {
    const result = mapBankTransaction({
      id: "txn_2",
      uploadId: "up_1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      description: "Bank fee",
      amount: -50,
      ignoredAt: new Date("2026-03-05T00:00:00.000Z"),
    });
    expect(result.ignoredAt).toBe("2026-03-05");
  });
});

describe("mapLinkableInvoice", () => {
  it("maps an invoice row to its link-picker shape, using balance as the linkable amount", () => {
    const result = mapLinkableInvoice({
      id: "clv042invoice",
      invoiceNumber: "INV-042",
      balance: 45000,
      dueDate: new Date("2026-02-15T00:00:00.000Z"),
      client: { name: "IDANIMO TECHNOLOGY LIMITED", currency: "NGN" },
    });
    expect(result).toEqual({
      id: "clv042invoice",
      invoiceNumber: "INV-042",
      clientName: "IDANIMO TECHNOLOGY LIMITED",
      amount: 45000,
      currency: "NGN",
      dueDate: "2026-02-15",
    });
  });
});
