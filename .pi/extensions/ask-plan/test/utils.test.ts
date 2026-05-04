import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractDoneSteps,
  extractPlanSteps,
  formatPlanSteps,
  isSafeReadOnlyCommand,
  markCompletedSteps,
} from "../utils.ts";

test("isSafeReadOnlyCommand allows read-only shell commands", () => {
  assert.equal(isSafeReadOnlyCommand("git status"), true);
  assert.equal(isSafeReadOnlyCommand("rg TODO src"), true);
  assert.equal(isSafeReadOnlyCommand("cat README.md | wc -l"), true);
  assert.equal(isSafeReadOnlyCommand("curl -fsSL https://example.com"), true);
  assert.equal(isSafeReadOnlyCommand("wget -O - https://example.com"), true);
  assert.equal(isSafeReadOnlyCommand("jq . package.json"), true);
});

test("isSafeReadOnlyCommand blocks destructive commands", () => {
  assert.equal(isSafeReadOnlyCommand("rm -rf dist"), false);
  assert.equal(isSafeReadOnlyCommand("git commit -m test"), false);
  assert.equal(isSafeReadOnlyCommand("cat README.md > out.txt"), false);
  assert.equal(isSafeReadOnlyCommand("curl -fsSL -o out.txt https://example.com"), false);
  assert.equal(isSafeReadOnlyCommand("curl -O https://example.com/file.txt"), false);
  assert.equal(isSafeReadOnlyCommand("curl --dump-header headers.txt https://example.com"), false);
  assert.equal(isSafeReadOnlyCommand("wget https://example.com/file.txt"), false);
  assert.equal(isSafeReadOnlyCommand("echo $(python -c 'print(1)')"), false);
  assert.equal(isSafeReadOnlyCommand("awk 'BEGIN { system(\"date\") }'"), false);
  assert.equal(isSafeReadOnlyCommand("jq 'input_filename' package.json"), false);
});

test("extractPlanSteps reads numbered plan sections", () => {
  const steps = extractPlanSteps(`
Plan:
1. Read the current extension
2. Update \`index.ts\`
3. Run tests
`);

  assert.deepEqual(
    steps.map((step) => step.text),
    ["Read the current extension", "Update index.ts", "Run tests"],
  );
});

test("extractPlanSteps accepts markdown and Japanese plan headings", () => {
  const markdownSteps = extractPlanSteps(`
## Implementation Plan

- 1. Inspect current behavior
- 2. Add tests
`);

  assert.deepEqual(
    markdownSteps.map((step) => step.text),
    ["Inspect current behavior", "Add tests"],
  );

  const japaneseSteps = extractPlanSteps(`
計画:
１．対象ファイルを確認する
２．テストを追加する
`);

  assert.deepEqual(
    japaneseSteps.map((step) => step.text),
    ["対象ファイルを確認する", "テストを追加する"],
  );
});

test("markCompletedSteps tracks DONE markers", () => {
  const steps = extractPlanSteps(`
Plan:
1. Add code
2. Run tests
`);

  assert.deepEqual(extractDoneSteps("finished [DONE:1]"), [1]);
  assert.equal(markCompletedSteps("finished [DONE:1]", steps), 1);
  assert.equal(steps[0].completed, true);
  assert.equal(steps[1].completed, false);
  assert.match(formatPlanSteps(steps), /\[x\] Add code/);
});
