const PDF_MAGIC_BYTES = "%PDF-";
const MIN_AVG_CHARS_PER_PAGE = 50;

export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC_BYTES.length) return false;
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).toString("ascii") === PDF_MAGIC_BYTES;
}

export function looksLikeScannedPdf(extractedText: string, pageCount: number): boolean {
  if (pageCount <= 0) return true;
  const avgCharsPerPage = extractedText.length / pageCount;
  return avgCharsPerPage < MIN_AVG_CHARS_PER_PAGE;
}
