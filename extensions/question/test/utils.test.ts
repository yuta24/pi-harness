import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatResult,
  makeResult,
  normalizeOptions,
  normalizeQuestion,
  optionAnswer,
} from "../utils.ts";

test("normalizeQuestion defaults to text questions", () => {
  const question = normalizeQuestion({ question: "What should we build?" });

  assert.equal(question.kind, "text");
  assert.equal(question.question, "What should we build?");
  assert.deepEqual(question.options, []);
});

test("normalizeQuestion validates select options", () => {
  assert.throws(
    () => normalizeQuestion({ question: "Pick one", kind: "select" }),
    /select questions require/,
  );

  const question = normalizeQuestion({
    question: "Pick one",
    kind: "select",
    options: [{ label: "A", value: "a" }, { label: "B" }],
  });

  assert.deepEqual(
    question.options.map((option) => option.label),
    ["A", "B"],
  );
  assert.equal(optionAnswer(question.options[0]), "a");
  assert.equal(optionAnswer(question.options[1]), "B");
});

test("normalizeQuestion validates and normalizes confirm defaults", () => {
  assert.equal(
    normalizeQuestion({ question: "Continue?", kind: "confirm", defaultAnswer: "true" }).defaultAnswer,
    "yes",
  );
  assert.equal(
    normalizeQuestion({ question: "Continue?", kind: "confirm", defaultAnswer: "N" }).defaultAnswer,
    "no",
  );
  assert.throws(
    () => normalizeQuestion({ question: "Continue?", kind: "confirm", defaultAnswer: "maybe" }),
    /confirm defaultAnswer/,
  );
});

test("normalizeQuestion validates and normalizes select defaults", () => {
  const question = normalizeQuestion({
    question: "Pick one",
    kind: "select",
    options: [{ label: "Fast", value: "fast" }, { label: "Careful", value: "careful" }],
    defaultAnswer: "Careful",
  });

  assert.equal(question.defaultAnswer, "careful");
  assert.throws(
    () =>
      normalizeQuestion({
        question: "Pick one",
        kind: "select",
        options: [{ label: "Fast", value: "fast" }],
        defaultAnswer: "slow",
      }),
    /select defaultAnswer/,
  );
});

test("normalizeOptions trims empty labels", () => {
  assert.deepEqual(normalizeOptions([{ label: " yes " }, { label: " " }]), [{ label: "yes", value: undefined }]);
});

test("normalizeQuestion clamps timeout", () => {
  const question = normalizeQuestion({
    question: "Continue?",
    kind: "confirm",
    timeoutSeconds: 99999,
  });

  assert.equal(question.timeoutMs, 3600 * 1000);
});

test("normalizeQuestion rejects invalid input", () => {
  assert.throws(() => normalizeQuestion({ question: "" }), /question is required/);
  assert.throws(
    () => normalizeQuestion({ question: "Continue?", kind: "other" }),
    /invalid question kind/,
  );
  assert.throws(
    () => normalizeQuestion({ question: "Continue?", timeoutSeconds: -1 }),
    /timeoutSeconds/,
  );
});

test("formatResult describes result state", () => {
  assert.equal(formatResult(makeResult("yes", "user")), "User answered: yes");
  assert.equal(formatResult(makeResult("", "user")), "User answered: ");
  assert.equal(formatResult(makeResult("fallback", "default", true)), "Question timed out. Default answer: fallback");
  assert.equal(formatResult(makeResult(null, "cancelled")), "User cancelled the question.");
  assert.equal(
    formatResult(makeResult(null, "unavailable")),
    "Question could not be asked because interactive UI is unavailable.",
  );
});
