import { describe, expect, it } from "vitest";
import { invoiceSearchWhere } from "./invoiceSearch";

describe("invoiceSearchWhere", () => {
  it("returns undefined for an empty or whitespace-only query", () => {
    expect(invoiceSearchWhere("")).toBeUndefined();
    expect(invoiceSearchWhere("   ")).toBeUndefined();
  });

  it("builds a case-insensitive OR across invoice number, description, and client name", () => {
    expect(invoiceSearchWhere("acme")).toEqual({
      OR: [
        { invoiceNumber: { contains: "acme", mode: "insensitive" } },
        { description: { contains: "acme", mode: "insensitive" } },
        { client: { name: { contains: "acme", mode: "insensitive" } } },
      ],
    });
  });

  it("trims surrounding whitespace from the query", () => {
    expect(invoiceSearchWhere("  acme  ")).toEqual({
      OR: [
        { invoiceNumber: { contains: "acme", mode: "insensitive" } },
        { description: { contains: "acme", mode: "insensitive" } },
        { client: { name: { contains: "acme", mode: "insensitive" } } },
      ],
    });
  });
});
