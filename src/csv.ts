/** CSV that Excel opens correctly: every cell quoted, quotes doubled, CRLF rows, UTF-8 byte order mark. */
export function toCsv(rows: (string | number | undefined | null)[][]): string {
  const cell = (v: string | number | undefined | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
