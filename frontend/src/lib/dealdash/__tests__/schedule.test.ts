import { test } from "node:test";
import assert from "node:assert/strict";
import {
  datesForWeekly,
  datesForDaily,
  federalHolidaysForYear,
  firstPaymentAnchor,
  isFederalHolidayUtc,
  isNonBankDayUtc,
  recastSchedule,
  scheduleEndDate,
  applyPause,
  applyLoweredPayment,
  isWeekendUtc,
  type ScheduleEntry,
} from "../schedule.ts";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

test("firstPaymentAnchor starts the day after funding for daily deals, not the funding day", () => {
  const funded = day("2026-07-20"); // Monday
  assert.equal(iso(firstPaymentAnchor(funded, "daily")), "2026-07-21");
});

test("firstPaymentAnchor starts a full week out for weekly deals", () => {
  const funded = day("2026-07-20"); // Monday
  assert.equal(iso(firstPaymentAnchor(funded, "weekly")), "2026-07-27"); // next Monday, not this week
});

test("firstPaymentAnchor respects an explicit firstPaymentDate override for any frequency", () => {
  const funded = day("2026-07-20");
  const explicit = day("2026-08-01");
  assert.equal(iso(firstPaymentAnchor(funded, "daily", explicit)), "2026-08-01");
  assert.equal(iso(firstPaymentAnchor(funded, "weekly", explicit)), "2026-08-01");
});

test("daily schedule anchored the day after funding skips to the next business day", () => {
  // Funded on Friday -> anchor is Saturday -> first daily payment rolls to Monday.
  const fridayFunded = day("2026-07-24"); // Friday
  const anchor = firstPaymentAnchor(fridayFunded, "daily"); // Saturday 2026-07-25
  const [first] = datesForDaily(anchor, 1);
  assert.equal(iso(first), "2026-07-27"); // Monday
  assert.equal(isWeekendUtc(first), false);
});

test("daily schedule funded mid-week starts the very next weekday", () => {
  const tuesdayFunded = day("2026-07-21"); // Tuesday
  const [first] = datesForDaily(firstPaymentAnchor(tuesdayFunded, "daily"), 1);
  assert.equal(iso(first), "2026-07-22"); // Wednesday
});

test("weekly schedule funded on a weekday whose weekday is chosen lands exactly 7 days out", () => {
  const mondayFunded = day("2026-07-20"); // Monday
  const anchor = firstPaymentAnchor(mondayFunded, "weekly");
  const [first] = datesForWeekly(anchor, 1 /* Monday */, 1);
  assert.equal(iso(first), "2026-07-27"); // next Monday, one full week out
});

test("federal holiday calendar computes the expected 2026 dates", () => {
  const holidays = federalHolidaysForYear(2026).map(iso);
  assert.deepEqual(holidays, [
    "2026-01-01", // New Year's Day (Thursday)
    "2026-01-19", // MLK Day (3rd Monday of Jan)
    "2026-02-16", // Presidents Day (3rd Monday of Feb)
    "2026-05-25", // Memorial Day (last Monday of May)
    "2026-06-19", // Juneteenth (Friday)
    "2026-07-03", // Independence Day observed (July 4 is a Saturday -> observed Friday)
    "2026-09-07", // Labor Day (1st Monday of Sept)
    "2026-10-12", // Columbus Day (2nd Monday of Oct)
    "2026-11-11", // Veterans Day (Wednesday)
    "2026-11-26", // Thanksgiving (4th Thursday of Nov)
    "2026-12-25", // Christmas Day (Friday)
  ]);
});

test("a weekend holiday shifts business-day math to the observed weekday, not the literal date", () => {
  // July 4, 2026 is a Saturday; the bank-observed holiday is Friday July 3.
  assert.equal(isFederalHolidayUtc(day("2026-07-04")), false);
  assert.equal(isFederalHolidayUtc(day("2026-07-03")), true);
  assert.equal(isNonBankDayUtc(day("2026-07-03")), true);
});

test("daily schedule skips a federal holiday that falls on a weekday", () => {
  // 2026-11-11 (Veterans Day, Wednesday) must not appear in the generated dates.
  const dates = datesForDaily(day("2026-11-09"), 5).map(iso); // Monday anchor
  assert.ok(!dates.includes("2026-11-11"));
  assert.equal(dates.length, 5);
});

test("scheduleEndDate returns the due date of the final payment", () => {
  const anchor = day("2026-07-21");
  const end = scheduleEndDate(anchor, "daily", null, 10);
  const all = datesForDaily(anchor, 10);
  assert.equal(iso(end!), iso(all.at(-1)!));
});

test("scheduleEndDate returns undefined for zero periods", () => {
  assert.equal(scheduleEndDate(day("2026-07-21"), "daily", null, 0), undefined);
});

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
