/** Small CSV writer for admin reports (RFC 4180, opens cleanly in Excel and Google Sheets). */

type Cell = string | number | null | undefined;

/** Byte-order mark: tells Excel the file is UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

/**
 * One cell. Quotes when needed, and defuses spreadsheet formulas: a text cell starting with = + - @ (or a tab / CR)
 * would run as a formula in Excel, so it is prefixed with an apostrophe. Numbers are written as they are.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A whole document: header row, then data rows, CRLF line ends, with a UTF-8 BOM so Excel reads ₱ and ñ correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Integer centavos as a plain decimal peso amount ("1700" → "17.00"), with no float arithmetic. */
export function centavosToDecimal(centavos: number): string {
  const sign = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
