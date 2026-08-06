import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhoneNumber } from "../format.ts";

test("formats digits progressively as they arrive, like live typing", () => {
  assert.equal(formatPhoneNumber("2"), "(2");
  assert.equal(formatPhoneNumber("212"), "(212");
  assert.equal(formatPhoneNumber("2125"), "(212) 5");
  assert.equal(formatPhoneNumber("2125551"), "(212) 555-1");
  assert.equal(formatPhoneNumber("2125551234"), "(212) 555-1234");
});

test("ignores existing punctuation and re-derives the format purely from digits", () => {
  assert.equal(formatPhoneNumber("212-555-1234"), "(212) 555-1234");
  assert.equal(formatPhoneNumber("(212) 555-1234"), "(212) 555-1234");
});

test("drops a leading US country code on an 11-digit number", () => {
  assert.equal(formatPhoneNumber("12125551234"), "(212) 555-1234");
  assert.equal(formatPhoneNumber("1 212 555 1234"), "(212) 555-1234");
});

test("truncates extra digits beyond a 10-digit number rather than overflowing the format", () => {
  assert.equal(formatPhoneNumber("21255512345678"), "(212) 555-1234");
});

test("empty or non-numeric input formats to an empty string", () => {
  assert.equal(formatPhoneNumber(""), "");
  assert.equal(formatPhoneNumber("abc"), "");
});
