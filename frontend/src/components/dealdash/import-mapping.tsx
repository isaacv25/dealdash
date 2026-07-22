"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import {
  applyColumnMapping,
  detectImportType,
  guessColumnMapping,
  normalizeImportedRows,
  parseCsvText,
  IMPORT_DESTINATION_LABELS,
  IMPORT_FIELD_DEFS,
} from "@/lib/dealdash";
import type { ColumnMapping, ImportBatch, ImportDestination } from "@/lib/dealdash";
import { useDealdash } from "./state";
import { SectionFrame } from "./views";

const DESTINATIONS: ImportDestination[] = ["funded", "pipeline", "follow-up"];

/**
 * detectImportType only recognizes the exact header names from the original broker sheets, so it's
 * used here purely to pick a sensible starting destination -- the user can always change it. Any
 * CSV shape is fine once a destination is picked, since the mapping table below does the real work.
 */
function guessDestination(headers: string[]): ImportDestination {
  const detected = detectImportType(headers);
  return detected === "unknown" ? "pipeline" : detected;
}

type PendingImport = {
  key: string;
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
  destination: ImportDestination;
  mapping: ColumnMapping;
};

function buildPendingImport(file: { name: string }, headers: string[], rows: Record<string, string>[], key: string): PendingImport {
  const destination = guessDestination(headers);
  return {
    key,
    filename: file.name,
    headers,
    rows,
    destination,
    mapping: guessColumnMapping(headers, IMPORT_FIELD_DEFS[destination]),
  };
}

export function ImportsView() {
  const { importData } = useDealdash();
  const [pending, setPending] = useState<PendingImport[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const uploadedAt = Date.now();
    const next = await Promise.all(
      Array.from(fileList).map(async (file, index) => {
        const content = await file.text();
        const { headers, rows } = parseCsvText(content);
        return buildPendingImport(file, headers, rows, `${file.name}-${uploadedAt}-${index}`);
      }),
    );
    setPending((cur) => [...next, ...cur]);
  }

  function setDestination(key: string, destination: ImportDestination) {
    setPending((cur) =>
      cur.map((item) =>
        item.key === key
          ? { ...item, destination, mapping: guessColumnMapping(item.headers, IMPORT_FIELD_DEFS[destination]) }
          : item,
      ),
    );
  }

  function setFieldMapping(key: string, fieldKey: string, header: string) {
    setPending((cur) =>
      cur.map((item) =>
        item.key === key ? { ...item, mapping: { ...item.mapping, [fieldKey]: header || null } } : item,
      ),
    );
  }

  function discard(key: string) {
    setPending((cur) => cur.filter((item) => item.key !== key));
  }

  function commitImport(item: PendingImport) {
    const canonicalRows = applyColumnMapping(item.mapping, item.rows);
    const normalized = normalizeImportedRows(item.destination, canonicalRows, item.filename);
    const batch: ImportBatch = {
      id: `batch-${item.filename}-${item.rows.length}-${Date.now()}`,
      filename: item.filename,
      importType: item.destination,
      rowsImported: item.rows.length,
      rowsSkipped: 0,
      detectedColumns: item.headers,
      importedAt: new Date().toISOString(),
    };
    importData({ ...normalized, batch });
    discard(item.key);
  }

  return (
    <SectionFrame
      eyebrow="Imports"
      title="Bring in CSVs your way"
      copy="Upload any CSV, tell us where it goes (funded progress, pipeline, or follow-ups), then map its columns to ours. Your sheet doesn't need to match our format."
      actions={
        <label className="primary-button inline-flex cursor-pointer items-center gap-2 text-sm">
          <Upload className="h-4 w-4" />
          Upload CSVs
          <input
            className="hidden"
            multiple
            accept=".csv"
            onChange={(e) => void handleFiles(e.target.files)}
            type="file"
          />
        </label>
      }
    >
      <div className="grid gap-5">
        {pending.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-[var(--line)] bg-white/66 p-10 text-center text-sm text-[var(--muted)]">
            No files loaded yet. Upload a CSV to choose its destination and map its columns.
          </div>
        ) : (
          pending.map((item) => (
            <ImportMappingCard
              key={item.key}
              item={item}
              onChangeDestination={(destination) => setDestination(item.key, destination)}
              onChangeMapping={(fieldKey, header) => setFieldMapping(item.key, fieldKey, header)}
              onDiscard={() => discard(item.key)}
              onImport={() => commitImport(item)}
            />
          ))
        )}
      </div>
    </SectionFrame>
  );
}

function ImportMappingCard({
  item,
  onChangeDestination,
  onChangeMapping,
  onDiscard,
  onImport,
}: Readonly<{
  item: PendingImport;
  onChangeDestination: (destination: ImportDestination) => void;
  onChangeMapping: (fieldKey: string, header: string) => void;
  onDiscard: () => void;
  onImport: () => void;
}>) {
  const fields = IMPORT_FIELD_DEFS[item.destination];
  const previewRow = item.rows[0];
  const missingRequired = fields.some((f) => f.required && !item.mapping[f.key]);

  return (
    <div className="rounded-[1.6rem] bg-white/76 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{item.filename}</h3>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{item.rows.length} rows detected</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Import into
          </label>
          <select
            className="field text-sm"
            value={item.destination}
            onChange={(e) => onChangeDestination(e.target.value as ImportDestination)}
          >
            {DESTINATIONS.map((destination) => (
              <option key={destination} value={destination}>
                {IMPORT_DESTINATION_LABELS[destination]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-[var(--line)] bg-white/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Map your columns to {IMPORT_DESTINATION_LABELS[item.destination]}
        </p>
        <div className="mt-3 grid gap-2.5">
          {fields.map((f) => {
            const mappedHeader = item.mapping[f.key] ?? "";
            const sampleValue = mappedHeader ? previewRow?.[mappedHeader] : undefined;
            return (
              <div key={f.key} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-3 text-sm">
                <label className="text-[var(--foreground)]">
                  {f.label}
                  {f.required && <span className="text-[var(--danger,#dc2626)]"> *</span>}
                </label>
                <select
                  className="field text-sm"
                  value={mappedHeader}
                  onChange={(e) => onChangeMapping(f.key, e.target.value)}
                >
                  <option value="">— Not mapped —</option>
                  {item.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
                <span className="truncate text-xs text-[var(--muted)]" title={sampleValue}>
                  {sampleValue ? `e.g. "${sampleValue}"` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          className="primary-button text-sm"
          disabled={missingRequired}
          onClick={onImport}
          title={missingRequired ? "Map every required field before importing" : undefined}
          type="button"
        >
          Import into workspace
        </button>
        <button className="ghost-button text-sm" onClick={onDiscard} type="button">
          Discard
        </button>
      </div>
    </div>
  );
}
