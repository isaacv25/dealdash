import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSchedule,
  datesForWeekly,
  datesForDaily,
  recastSchedule,
  applyPause,
  applyLoweredPayment,
  isWeekendUtc,
  type ScheduleEntry,
} from "../schedule";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("weekly schedule lands on the selected weekday for every supported day", () => {
  const monday = day("2026-07-20"); // a Monday
  for (let weekday = 0; weekday <= 6; weekday++) {
    const dates = datesForWeekly(monday, weekday, 5);
    assert.equal(dates.length, 5);
    for (const d of dates) assert.equal(d.getUTCDay(), weekday);
  }
});

test("weekly schedule first payment date derives from the anchor date", () => {
  const anchor = day("2026-07-20"); // Monday
  const [first] = datesForWeekly(anchor, 3 /* Wednesday */, 1); // next Wednesday on/after Monday
  assert.equal(first.toISOString().slice(0, 10), "2026-07-22");
});

test("daily schedule generates one date per business day and skips weekends", () => {
  const friday = day("2026-07-17"); // Friday
  const dates = datesForDaily(friday, 4);
  const isoList = dates.map((d) => d.toISOString().slice(0, 10));
  assert.deepEqual(isoList, ["2026-07-17", "2026-07-20", "2026-07-21", "2026-07-22"]);
  for (const d of dates) assert.equal(isWeekendUtc(d), false);
});

test("daily schedule anchored on a weekend rolls to the next business day", () => {
  const saturday = day("2026-07-18");
  const [first] = datesForDaily(saturday, 1);
  assert.equal(first.toISOString().slice(0, 10), "2026-07-20");
});

test("changing the weekday mid-deal only affects future unpaid payments", () => {
  const existing: ScheduleEntry[] = [
    { sequence: 1, dueDate: day("2026-07-06"), scheduledAmountCents: 100000, status: "posted", postedAmountCents: 100000 },
    { sequence: 2, dueDate: day("2026-07-13"), scheduledAmountCents: 100000, status: "posted", postedAmountCents: 100000 },
    { sequence: 3, dueDate: day("2026-07-20"), scheduledAmountCents: 100000, status: "pending" },
    { sequence: 4, dueDate: day("2026-07-27"), scheduledAmountCents: 100000, status: "pending" },
  ];

  const recast = recastSchedule({
    existingEntries: existing,
    frequency: "weekly",
    weekday: 5, // switch to Friday
    effectiveDate: day("2026-07-20"),
    remainingTotalCents: 200000,
    remainingPeriods: 2,
  });

  const posted = recast.filter((e) => e.status === "posted");
  const pending = recast.filter((e) => e.status === "pending");
  assert.equal(posted.length, 2);
  assert.deepEqual(posted.map((e) => e.dueDate.toISOString().slice(0, 10)), ["2026-07-06", "2026-07-13"]);
  assert.equal(pending.length, 2);
  for (const entry of pending) assert.equal(entry.dueDate.getUTCDay(), 5);
});

test("recast preserves posted historical payments untouched", () => {
  const posted: ScheduleEntry = { sequence: 1, dueDate: day("2026-07-06"), scheduledAmountCents: 12345, status: "posted", postedAmountCents: 12345 };
  const existing: ScheduleEntry[] = [posted, { sequence: 2, dueDate: day("2026-07-13"), scheduledAmountCents: 100000, status: "pending" }];

  const recast = recastSchedule({
    existingEntries: existing,
    frequency: "weekly",
    weekday: 1,
    effectiveDate: day("2026-07-13"),
    remainingTotalCents: 50000,
    remainingPeriods: 1,
  });

  const untouchedPosted = recast.find((e) => e.sequence === 1);
  assert.deepEqual(untouchedPosted, posted);
});

test("future schedule regeneration renumbers sequence continuing after the last posted entry", () => {
  const existing: ScheduleEntry[] = [
    { sequence: 1, dueDate: day("2026-07-06"), scheduledAmountCents: 1000, status: "posted", postedAmountCents: 1000 },
    { sequence: 2, dueDate: day("2026-07-13"), scheduledAmountCents: 1000, status: "pending" },
    { sequence: 3, dueDate: day("2026-07-20"), scheduledAmountCents: 1000, status: "pending" },
  ];
  const recast = recastSchedule({
    existingEntries: existing,
    frequency: "weekly",
    weekday: 1,
    effectiveDate: day("2026-07-13"),
    remainingTotalCents: 3000,
    remainingPeriods: 3,
  });
  const sequences = recast.map((e) => e.sequence).sort((a, b) => a - b);
  assert.deepEqual(sequences, [1, 2, 3, 4]);
});

test("payment pause skips due dates within the window and extends maturity", () => {
  const existing: ScheduleEntry[] = [
    { sequence: 1, dueDate: day("2026-07-06"), scheduledAmountCents: 1000, status: "posted", postedAmountCents: 1000 },
    { sequence: 2, dueDate: day("2026-07-13"), scheduledAmountCents: 1000, status: "pending" },
    { sequence: 3, dueDate: day("2026-07-20"), scheduledAmountCents: 1000, status: "pending" },
    { sequence: 4, dueDate: day("2026-07-27"), scheduledAmountCents: 1000, status: "pending" },
  ];

  const result = applyPause({
    entries: existing,
    pauseStart: day("2026-07-13"),
    resumeDate: day("2026-07-27"),
    frequency: "weekly",
    weekday: 1,
  });

  const pausedEntries = result.filter((e) => e.status === "paused");
  assert.equal(pausedEntries.length, 2); // 07-13 and 07-20 fall inside [start, resume)

  const totalPending = result.filter((e) => e.status !== "posted" && e.status !== "paused");
  // two new tail periods appended to make up for the two paused ones
  assert.equal(totalPending.length, 3); // original 07-27 + 2 appended
});

test("resume after pause leaves post-resume entries untouched and pending", () => {
  const existing: ScheduleEntry[] = [
    { sequence: 1, dueDate: day("2026-07-13"), scheduledAmountCents: 1000, status: "pending" },
    { sequence: 2, dueDate: day("2026-08-03"), scheduledAmountCents: 1000, status: "pending" },
  ];
  const result = applyPause({ entries: existing, pauseStart: day("2026-07-13"), resumeDate: day("2026-08-03"), frequency: "weekly", weekday: 1 });
  const afterResume = result.find((e) => e.dueDate.toISOString().slice(0, 10) === "2026-08-03");
  assert.equal(afterResume?.status, "pending");
});

test("lowered payment applies only within the effective window and preserves history", () => {
  const existing: ScheduleEntry[] = [
    { sequence: 1, dueDate: day("2026-07-06"), scheduledAmountCents: 1000, status: "posted", postedAmountCents: 1000 },
    { sequence: 2, dueDate: day("2026-07-13"), scheduledAmountCents: 1000, status: "pending" },
    { sequence: 3, dueDate: day("2026-07-20"), scheduledAmountCents: 1000, status: "pending" },
    { sequence: 4, dueDate: day("2026-07-27"), scheduledAmountCents: 1000, status: "pending" },
  ];

  const result = applyLoweredPayment({
    entries: existing,
    newAmountCents: 500,
    effectiveDate: day("2026-07-13"),
    endDate: day("2026-07-27"),
    adjustmentId: "adj_1",
  });

  assert.equal(result[0].scheduledAmountCents, 1000); // posted, untouched
  assert.equal(result[1].scheduledAmountCents, 500);
  assert.equal(result[2].scheduledAmountCents, 500);
  assert.equal(result[3].scheduledAmountCents, 1000); // outside window (endDate exclusive)
});

test("temporary payment reduction ends and future payments return to normal amount", () => {
  const existing: ScheduleEntry[] = [{ sequence: 1, dueDate: day("2026-08-03"), scheduledAmountCents: 1000, status: "pending" }];
  const result = applyLoweredPayment({
    entries: existing,
    newAmountCents: 500,
    effectiveDate: day("2026-07-01"),
    endDate: day("2026-08-01"),
    adjustmentId: "adj_2",
  });
  assert.equal(result[0].scheduledAmountCents, 1000);
});
