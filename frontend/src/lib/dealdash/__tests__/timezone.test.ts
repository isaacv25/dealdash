import { test } from "node:test";
import assert from "node:assert/strict";
import { easternDateKey, utcDateKey, isDueInEastern } from "../timezone";

test("America/New_York midnight: a UTC instant just after ET midnight resolves to the new ET date", () => {
  // 2026-07-20 04:05 UTC is 2026-07-20 00:05 America/New_York in summer (EDT, UTC-4).
  const instant = new Date("2026-07-20T04:05:00.000Z");
  assert.equal(easternDateKey(instant), "2026-07-20");
});

test("standard time offset (EST, UTC-5) resolves correctly", () => {
  // 2026-01-20 05:05 UTC is 2026-01-20 00:05 America/New_York in winter (EST, UTC-5).
  const instant = new Date("2026-01-20T05:05:00.000Z");
  assert.equal(easternDateKey(instant), "2026-01-20");
  // The same wall-clock UTC hour in summer would still be the *previous* ET day (EDT, UTC-4).
  const summerInstant = new Date("2026-07-20T03:59:00.000Z");
  assert.equal(easternDateKey(summerInstant), "2026-07-19");
});

test("daylight-saving spring-forward transition does not skip or duplicate a due date", () => {
  // 2026-03-08 is the US spring-forward date. Confirm the day boundary still resolves once, correctly.
  const beforeChange = new Date("2026-03-08T04:59:00.000Z"); // 2026-03-07 23:59 EST
  const afterChange = new Date("2026-03-08T05:01:00.000Z"); // 2026-03-08 01:01 EST (still EST until 2am local)
  assert.equal(easternDateKey(beforeChange), "2026-03-07");
  assert.equal(easternDateKey(afterChange), "2026-03-08");
});

test("utcDateKey extracts the calendar date encoded in a UTC-midnight schedule date", () => {
  assert.equal(utcDateKey(new Date("2026-07-20T00:00:00.000Z")), "2026-07-20");
});

test("a schedule entry due today or earlier is due; a future entry is not", () => {
  const now = new Date("2026-07-20T15:00:00.000Z"); // afternoon ET
  assert.equal(isDueInEastern(new Date("2026-07-20T00:00:00.000Z"), now), true);
  assert.equal(isDueInEastern(new Date("2026-07-18T00:00:00.000Z"), now), true); // missed-run catch-up
  assert.equal(isDueInEastern(new Date("2026-07-21T00:00:00.000Z"), now), false);
});
