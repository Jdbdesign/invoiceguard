type CsvValue = string | number | null | undefined;

function escapeCsvField(value: CsvValue): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** RFC 4180 CSV (CRLF line endings) so it opens cleanly in Excel/Sheets. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return lines.join("\r\n") + "\r\n";
}

/**
 * Wraps a digit-heavy value (e.g. a phone number) as an Excel "force text"
 * formula (`="value"`) so Excel displays it verbatim instead of coercing it
 * to a number and rendering it in scientific notation. Only apply this to
 * columns that are never meant to be treated as numbers by the spreadsheet.
 */
export function excelTextField(value: CsvValue): CsvValue {
  if (value === null || value === undefined || value === "") return value;
  return `="${String(value)}"`;
}

// A leading UTF-8 BOM so Excel on Windows renders non-ASCII characters
// (e.g. accented client names) correctly instead of mojibake. Written as an
// escape rather than a literal character so it survives editors/diffs.
const UTF8_BOM = String.fromCharCode(0xfeff);

export function csvResponse(filename: string, csv: string): Response {
  return new Response(UTF8_BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
