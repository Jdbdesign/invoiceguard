// pdf-parse@1.x ships no type declarations, and this codebase imports its
// internal lib entry point directly (see the comment in
// src/app/api/bank-statements/route.ts) rather than the package root, so a
// community @types package wouldn't cover this path anyway. This declares
// just the shape this codebase relies on.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
  }

  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;

  export default pdfParse;
}
