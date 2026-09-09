"use client";

/** Quotes a CSV field only when it needs it (contains a comma, quote, or
 * newline) — doubling any embedded quotes per RFC 4180. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a CSV string from headers + rows and triggers a browser download.
 * Client-only (creates an object URL and a synthetic click) — every export
 * button in this app is client-side data already loaded on the page, never
 * a server round trip. */
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
