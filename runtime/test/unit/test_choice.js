"use strict";
// Unit tests for the pure multiple-choice replay math (runtime/app/choice.js). No browser, no
// mocks — every function here is pure by construction (see the file's own header comment).

const test = require("node:test");
const assert = require("node:assert");

const { matchOption, matchOptions, optionsSummary } = require("../../app/choice");

const GENDER_OPTIONS = [
  { value: "male", label: "Male", selector: "#g1" },
  { value: "female", label: "Female", selector: "#g2" },
  { value: "other", label: "Other", selector: "#g3" },
];

test("matchOption: exact label match", () => {
  assert.deepStrictEqual(matchOption("Female", GENDER_OPTIONS), GENDER_OPTIONS[1]);
});

test("matchOption: exact value match", () => {
  assert.deepStrictEqual(matchOption("male", GENDER_OPTIONS), GENDER_OPTIONS[0]);
});

test("matchOption: case/whitespace/punctuation variants normalize", () => {
  assert.deepStrictEqual(matchOption("  FEMALE  ", GENDER_OPTIONS), GENDER_OPTIONS[1]);
  assert.deepStrictEqual(matchOption("Other!", GENDER_OPTIONS), GENDER_OPTIONS[2]);
});

test("matchOption: unique prefix match", () => {
  assert.deepStrictEqual(matchOption("F", GENDER_OPTIONS), GENDER_OPTIONS[1]);
});

test("matchOption: ambiguous prefix returns null, never guesses", () => {
  const opts = [
    { value: "male", label: "Male" },
    { value: "married", label: "Married" },
  ];
  assert.strictEqual(matchOption("M", opts), null);
});

test("matchOption: no match returns null", () => {
  assert.strictEqual(matchOption("nonbinary", GENDER_OPTIONS), null);
});

test("matchOption: empty/missing value returns null", () => {
  assert.strictEqual(matchOption("", GENDER_OPTIONS), null);
  assert.strictEqual(matchOption(null, GENDER_OPTIONS), null);
  assert.strictEqual(matchOption(undefined, GENDER_OPTIONS), null);
});

test("matchOption: exact match wins even when it would also be an ambiguous prefix elsewhere", () => {
  const opts = [
    { value: "m", label: "Male" },
    { value: "mr", label: "Married" },
  ];
  assert.deepStrictEqual(matchOption("m", opts), opts[0]);
});

test("matchOptions: array input resolves each pick", () => {
  const picked = matchOptions(["Male", "Other"], GENDER_OPTIONS);
  assert.deepStrictEqual(picked, [GENDER_OPTIONS[0], GENDER_OPTIONS[2]]);
});

test("matchOptions: comma-separated string input", () => {
  const picked = matchOptions("Male, Other", GENDER_OPTIONS);
  assert.deepStrictEqual(picked, [GENDER_OPTIONS[0], GENDER_OPTIONS[2]]);
});

test("matchOptions: any unknown member fails the whole call", () => {
  assert.strictEqual(matchOptions("Male, nonbinary", GENDER_OPTIONS), null);
});

test("matchOptions: empty/missing value means no picks, not an error", () => {
  assert.deepStrictEqual(matchOptions("", GENDER_OPTIONS), []);
  assert.deepStrictEqual(matchOptions(null, GENDER_OPTIONS), []);
  assert.deepStrictEqual(matchOptions(undefined, GENDER_OPTIONS), []);
});

test("matchOptions: de-duplicates repeated picks", () => {
  const picked = matchOptions("Male, Male", GENDER_OPTIONS);
  assert.deepStrictEqual(picked, [GENDER_OPTIONS[0]]);
});

test("optionsSummary: joins labels for the bad-input error message", () => {
  assert.strictEqual(optionsSummary(GENDER_OPTIONS), "Male, Female, Other");
});
