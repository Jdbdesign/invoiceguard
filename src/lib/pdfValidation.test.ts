import { describe, expect, it } from "vitest";
import { isPdfBuffer, looksLikeScannedPdf } from "./pdfValidation";

describe("isPdfBuffer", () => {
  it("accepts a buffer starting with the %PDF- magic bytes", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.4\n..."))).toBe(true);
  });

  it("rejects a buffer that doesn't start with %PDF-", () => {
    expect(isPdfBuffer(Buffer.from("not a pdf at all"))).toBe(false);
  });

  it("rejects a buffer shorter than the magic bytes", () => {
    expect(isPdfBuffer(Buffer.from("%PD"))).toBe(false);
  });
});

describe("looksLikeScannedPdf", () => {
  it("flags a page with almost no extracted text as scanned", () => {
    expect(looksLikeScannedPdf("", 1)).toBe(true);
    expect(looksLikeScannedPdf("Page 3", 1)).toBe(true);
  });

  it("does not flag a page with a normal amount of text", () => {
    const text = "Date Description Amount\n".repeat(20); // ~500 chars for 1 page
    expect(looksLikeScannedPdf(text, 1)).toBe(false);
  });

  it("averages across multiple pages", () => {
    const text = "x".repeat(300); // 100 chars/page over 3 pages — above the 50 threshold
    expect(looksLikeScannedPdf(text, 3)).toBe(false);
    const scannedText = "x".repeat(60); // 20 chars/page over 3 pages — below threshold
    expect(looksLikeScannedPdf(scannedText, 3)).toBe(true);
  });

  it("treats a zero or negative page count as scanned (defensive default)", () => {
    expect(looksLikeScannedPdf("plenty of text here", 0)).toBe(true);
  });
});
