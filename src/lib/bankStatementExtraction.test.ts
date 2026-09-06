import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const { extractTransactionsFromStatementText } = await import("./bankStatementExtraction");

beforeEach(() => {
  mockCreate.mockReset();
});

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("extractTransactionsFromStatementText", () => {
  it("parses a well-formed JSON array response", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify([
          { date: "2026-03-01", description: "Deposit from Jane Doe", amount: 500 },
          { date: "2026-03-02", description: "ATM withdrawal", amount: -100 },
        ])
      )
    );
    const rows = await extractTransactionsFromStatementText("raw statement text");
    expect(rows).toEqual([
      { date: "2026-03-01", description: "Deposit from Jane Doe", amount: 500 },
      { date: "2026-03-02", description: "ATM withdrawal", amount: -100 },
    ]);
  });

  it("extracts a JSON array even when wrapped in markdown fences", async () => {
    mockCreate.mockResolvedValue(
      textResponse('```json\n[{"date":"2026-03-01","description":"Deposit","amount":500}]\n```')
    );
    const rows = await extractTransactionsFromStatementText("raw statement text");
    expect(rows).toEqual([{ date: "2026-03-01", description: "Deposit", amount: 500 }]);
  });

  it("drops individual rows with an invalid date, non-string description, or non-finite amount", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify([
          { date: "2026-03-01", description: "Valid row", amount: 500 },
          { date: "not-a-date", description: "Bad date", amount: 100 },
          { date: "2026-03-01", description: 12345, amount: 100 },
          { date: "2026-03-01", description: "Bad amount", amount: "NaN" },
        ])
      )
    );
    const rows = await extractTransactionsFromStatementText("raw statement text");
    expect(rows).toEqual([{ date: "2026-03-01", description: "Valid row", amount: 500 }]);
  });

  it("throws a StatementExtractionError when the response has no parseable JSON", async () => {
    mockCreate.mockResolvedValue(textResponse("I could not extract any transactions."));
    await expect(extractTransactionsFromStatementText("raw statement text")).rejects.toThrow(
      /couldn't parse/i
    );
  });

  it("throws a StatementExtractionError when the API call itself fails", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));
    await expect(extractTransactionsFromStatementText("raw statement text")).rejects.toThrow(
      /couldn't parse/i
    );
  });
});
