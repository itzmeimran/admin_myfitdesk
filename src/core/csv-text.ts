/** Server-safe CSV text builder (RFC 4180 quoting). `core/csv.ts` is a
 * client-only download helper, so route handlers use this instead. Also
 * neutralises spreadsheet formula injection: a cell that starts with = + - or @
 * is prefixed with an apostrophe so Excel/Sheets never evaluates it. */
function field(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvText(headers: string[], rows: unknown[][]): string {
  return `﻿${[headers, ...rows].map((row) => row.map(field).join(",")).join("\r\n")}`;
}
