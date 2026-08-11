import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeCsvRows, isWithinDateRange } from "../csv.ts";

test("serializeCsvRows quotes every cell and doubles embedded quotes", () => {
  const csv = serializeCsvRows(["A", "B"], [["plain", 'has "quote"']]);
  assert.equal(csv, '"A","B"\n"plain","has ""quote"""');
});

test("serializeCsvRows keeps commas and newlines inside a single cell intact", () => {
  const csv = serializeCsvRows(["Name", "Notes"], [["Doe, John", "line1\nline2"]]);
  // The comma and newline live inside quotes, so there are still exactly two rows of two columns.
  assert.equal(csv, '"Name","Notes"\n"Doe, John","line1\nline2"');
});

test("serializeCsvRows renders an empty body as just the header line", () => {
  assert.equal(serializeCsvRows(["A", "B"], []), '"A","B"');
});

test("isWithinDateRange includes everything when both bounds are blank", () => {
  assert.equal(isWithinDateRange("2026-08-11T00:00:00.000Z", "", ""), true);
  assert.equal(isWithinDateRange(undefined, "", ""), true);
});

test("isWithinDateRange is inclusive on both ends", () => {
  assert.equal(isWithinDateRange("2026-08-01T00:00:00.000Z", "2026-08-01", "2026-08-31"), true);
  assert.equal(isWithinDateRange("2026-08-31T00:00:00.000Z", "2026-08-01", "2026-08-31"), true);
  assert.equal(isWithinDateRange("2026-07-31T00:00:00.000Z", "2026-08-01", "2026-08-31"), false);
  assert.equal(isWithinDateRange("2026-09-01T00:00:00.000Z", "2026-08-01", "2026-08-31"), false);
});

test("isWithinDateRange supports open-ended (from-only / to-only) ranges", () => {
  assert.equal(isWithinDateRange("2026-08-15T00:00:00.000Z", "2026-08-01", ""), true);
  assert.equal(isWithinDateRange("2026-07-15T00:00:00.000Z", "2026-08-01", ""), false);
  assert.equal(isWithinDateRange("2026-08-15T00:00:00.000Z", "", "2026-08-31"), true);
  assert.equal(isWithinDateRange("2026-09-15T00:00:00.000Z", "", "2026-08-31"), false);
});

test("a record with no date is excluded once any bound is set", () => {
  assert.equal(isWithinDateRange(undefined, "2026-08-01", ""), false);
  assert.equal(isWithinDateRange(undefined, "", "2026-08-31"), false);
});
