function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

/**
 * Serializes headers + rows into a CSV string. Every cell is quoted and internal quotes are doubled,
 * so commas, quotes, and newlines inside a value never break the row/column structure. Pure (no DOM),
 * so it's unit-testable; the browser download wrapper lives in the view layer.
 */
export function serializeCsvRows(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

/**
 * Inclusive calendar-date range test for CSV export filtering. `from`/`to` are "YYYY-MM-DD" (either
 * may be empty for an open-ended side; both empty = everything). `dateIso` is a record's date as a
 * full ISO string; only its calendar-date portion is compared, and ISO date strings sort correctly
 * with plain string comparison so no Date math is needed. A record with no date is included only when
 * no range is set at all -- it can't meaningfully fall inside a bounded range.
 */
export function isWithinDateRange(dateIso: string | undefined, from: string, to: string): boolean {
  if (!dateIso) return !from && !to;
  const day = dateIso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function parseCsvText(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {});
  });

  return { headers, rows };
}
