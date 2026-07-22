export type ImportDestination = "funded" | "pipeline" | "follow-up";

export interface ImportFieldDef {
  /** Canonical key the normalizer functions in normalization.ts read from. */
  key: string;
  label: string;
  required?: boolean;
  /** Lowercase hints used to auto-guess which CSV column this field maps to. */
  aliases: string[];
}

export const IMPORT_DESTINATION_LABELS: Record<ImportDestination, string> = {
  funded: "Funded Progress",
  pipeline: "Pipeline",
  "follow-up": "Follow-Ups",
};

/**
 * One field list per destination. These are intentionally decoupled from any specific sheet's
 * header names -- the mapping step (guessColumnMapping/applyColumnMapping below) is what connects
 * an arbitrary CSV's columns to these canonical keys, so every broker can bring their own sheet
 * shape instead of conforming to one fixed template.
 */
export const IMPORT_FIELD_DEFS: Record<ImportDestination, ImportFieldDef[]> = {
  funded: [
    { key: "businessName", label: "Business name", required: true, aliases: ["business name", "business", "company"] },
    { key: "contactName", label: "Contact name", required: true, aliases: ["name", "contact", "contact name", "full name"] },
    { key: "phone", label: "Phone", aliases: ["number", "phone", "phone number", "cell"] },
    { key: "email", label: "Email", aliases: ["email", "email address"] },
    { key: "fundedDate", label: "Funded date", aliases: ["date", "funded date", "date funded"] },
    { key: "funder", label: "Funder", aliases: ["funder", "lender"] },
    { key: "fundedAmount", label: "Funded amount", required: true, aliases: ["amount", "funded amount", "advance"] },
    { key: "factorRate", label: "Factor rate", aliases: ["rate", "factor", "factor rate"] },
    { key: "termValue", label: "Term value", aliases: ["term", "term value", "length"] },
    { key: "termUnit", label: "Term unit", aliases: ["term unit", "unit"] },
    { key: "paymentAmount", label: "Payment amount", aliases: ["payment", "payment amount"] },
    { key: "syndicationPercent", label: "Syndication %", aliases: ["syndication", "syndication %"] },
    { key: "commissionAmount", label: "Commission ($)", aliases: ["commission", "commission amount"] },
    { key: "statusRaw", label: "Status", aliases: ["status"] },
    { key: "notes", label: "Notes", aliases: ["notes", "note"] },
  ],
  pipeline: [
    { key: "contactName", label: "Contact name", required: true, aliases: ["name", "contact", "contact name", "full name"] },
    { key: "businessName", label: "Business name", required: true, aliases: ["business", "business name", "company"] },
    { key: "phone", label: "Phone", aliases: ["number", "phone", "phone number", "cell"] },
    { key: "email", label: "Email", aliases: ["email", "email address"] },
    { key: "cityState", label: "City, State", aliases: ["city, state", "city/state", "location", "city state"] },
    { key: "submittedDate", label: "Date submitted", aliases: ["date app", "submitted", "date submitted", "date"] },
    { key: "requestLabel", label: "Requested amount", aliases: ["request", "amount requested", "requested amount"] },
    { key: "statusRaw", label: "Status", aliases: ["status"] },
    { key: "notes", label: "Notes", aliases: ["notes", "note"] },
    { key: "sheetLabel", label: "Sheet / source label", aliases: ["sheet", "source"] },
  ],
  "follow-up": [
    { key: "contactName", label: "Full name", required: true, aliases: ["full name", "name", "contact"] },
    { key: "businessName", label: "Business name", aliases: ["business name", "business", "company"] },
    { key: "phone", label: "Phone", aliases: ["number", "phone", "phone number", "cell"] },
    { key: "email", label: "Email", aliases: ["email", "email address"] },
    { key: "requestLabel", label: "Requested amount", aliases: ["request", "amount requested"] },
    { key: "notes", label: "Notes", aliases: ["notes", "note"] },
    { key: "monthlyRevenueLabel", label: "Monthly revenue", aliases: ["monthly", "monthly revenue"] },
    { key: "positionsLabel", label: "Positions", aliases: ["positions", "position"] },
    { key: "lastContactLabel", label: "Last contacted", aliases: ["date last contacted", "last contact", "last contacted"] },
    { key: "appSubmitted", label: "App submitted?", aliases: ["app", "app submitted", "submitted"] },
    { key: "sheetLabel", label: "Sheet / source label", aliases: ["sheet", "source"] },
  ],
};

/** Maps a field key to the CSV header it should read from, or null if left unmapped. */
export type ColumnMapping = Record<string, string | null>;

function normalizeHeaderText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Best-effort default mapping so the mapping UI never opens on an all-blank table. Exact alias
 * matches win first; a looser substring pass fills in anything still unmapped. A CSV header is
 * never claimed by two fields.
 */
export function guessColumnMapping(headers: string[], fields: ImportFieldDef[]): ColumnMapping {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeaderText(header) }));
  const usedHeaders = new Set<string>();
  const mapping: ColumnMapping = {};

  for (const field of fields) {
    const exact = normalizedHeaders.find(
      (candidate) =>
        !usedHeaders.has(candidate.header) &&
        field.aliases.some((alias) => normalizeHeaderText(alias) === candidate.normalized),
    );
    if (exact) {
      mapping[field.key] = exact.header;
      usedHeaders.add(exact.header);
    }
  }

  for (const field of fields) {
    if (mapping[field.key]) continue;
    const partial = normalizedHeaders.find((candidate) => {
      if (usedHeaders.has(candidate.header) || !candidate.normalized) return false;
      return field.aliases.some((alias) => {
        const normalizedAlias = normalizeHeaderText(alias);
        return normalizedAlias.length > 2 && (candidate.normalized.includes(normalizedAlias) || normalizedAlias.includes(candidate.normalized));
      });
    });
    mapping[field.key] = partial ? partial.header : null;
    if (partial) usedHeaders.add(partial.header);
  }

  return mapping;
}

/**
 * Re-keys every row from its original CSV headers to the canonical field keys the normalizers in
 * normalization.ts expect, using the user-confirmed (or auto-guessed) mapping. Unmapped fields
 * come through as "" so downstream parsing (parseCurrency, parseDate, etc.) can apply its normal
 * "missing value" defaults.
 */
export function applyColumnMapping(mapping: ColumnMapping, rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const canonical: Record<string, string> = {};
    for (const [fieldKey, header] of Object.entries(mapping)) {
      canonical[fieldKey] = header ? row[header] ?? "" : "";
    }
    return canonical;
  });
}
