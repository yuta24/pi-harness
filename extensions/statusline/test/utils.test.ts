import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  buildScriptEnv,
  normalizeConfig,
  resolveCommand,
  truncateOutput,
} from "../utils.ts";

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-statusline-"));
  mkdirSync(join(root, ".pi"));
  return root;
}

test("normalizeConfig applies secure defaults and clamps bounds", () => {
  const config = normalizeConfig({
    command: ".pi/statusline.js",
    timeoutMs: 1,
    maxOutputChars: 99999,
  });

  assert.equal(config.enabled, true);
  assert.equal(config.command, ".pi/statusline.js");
  assert.equal(config.refreshMs, 1000);
  assert.equal(config.timeoutMs, 50);
  assert.equal(config.maxOutputChars, 2000);
});

test("normalizeConfig rejects unsafe argument shapes", () => {
  assert.throws(() => normalizeConfig({ command: "" }), /command is required/);
  assert.throws(() => normalizeConfig({ command: "bad\0path" }), /NUL/);
  assert.throws(() => normalizeConfig({ command: ".pi/statusline.js", args: "bad" }), /args/);
  assert.throws(() => normalizeConfig({ command: ".pi/statusline.js", args: ["bad\0arg"] }), /NUL/);
  assert.throws(() => normalizeConfig({ command: ".pi/statusline.js", refreshMs: 1 }), /refreshMs/);
});

test("resolveCommand requires project-local executable by default", () => {
  const root = makeProject();
  const command = join(root, ".pi", "statusline.js");
  writeFileSync(command, "#!/usr/bin/env node\nconsole.log('ok')\n");
  chmodSync(command, 0o755);

  const config = normalizeConfig({ command: ".pi/statusline.js" });
  assert.equal(resolveCommand(config, root), realpathSync(command));
});

test("resolveCommand rejects outside, .git, missing, and non-executable files", () => {
  const root = makeProject();
  mkdirSync(join(root, ".git"));
  const gitHook = join(root, ".git", "hook");
  writeFileSync(gitHook, "#!/bin/sh\n");
  chmodSync(gitHook, 0o755);

  const plain = join(root, ".pi", "plain");
  writeFileSync(plain, "echo ok\n");

  const outsideRoot = mkdtempSync(join(tmpdir(), "pi-statusline-outside-"));
  const outsideCommand = join(outsideRoot, "outside");
  writeFileSync(outsideCommand, "#!/bin/sh\necho outside\n");
  chmodSync(outsideCommand, 0o755);

  assert.throws(() => resolveCommand(normalizeConfig({ command: outsideCommand }), root), /project root/);
  assert.throws(() => resolveCommand(normalizeConfig({ command: ".git/hook" }), root), /\.git/);
  assert.throws(() => resolveCommand(normalizeConfig({ command: ".pi/missing" }), root), /does not exist/);
  assert.throws(() => resolveCommand(normalizeConfig({ command: ".pi/plain" }), root), /not executable/);
});

test("resolveCommand rejects project-local symlinks that escape the project", () => {
  const root = makeProject();
  const outsideRoot = mkdtempSync(join(tmpdir(), "pi-statusline-outside-"));
  const outsideCommand = join(outsideRoot, "statusline");
  writeFileSync(outsideCommand, "#!/bin/sh\necho outside\n");
  chmodSync(outsideCommand, 0o755);

  symlinkSync(outsideCommand, join(root, ".pi", "statusline-link"));

  assert.throws(
    () => resolveCommand(normalizeConfig({ command: ".pi/statusline-link" }), root),
    /project root/,
  );
});

test("buildScriptEnv exposes structured statusline variables", () => {
  const env = buildScriptEnv({
    provider: "openai",
    model: "gpt",
    cwd: "/repo",
    gitBranch: "main",
    contextPercent: "42",
    inputTokens: "100",
    outputTokens: "50",
    cost: "0.001",
    extensionStatuses: { sandbox: "on" },
  });

  assert.equal(env.PI_STATUSLINE, "1");
  assert.equal(env.PI_MODEL, "gpt");
  assert.deepEqual(JSON.parse(env.PI_EXTENSION_STATUSES), { sandbox: "on" });
});

test("truncateOutput trims and sanitizes script output", () => {
  assert.equal(truncateOutput("hello\n", 20), "hello");
  assert.equal(truncateOutput("abcdef", 5), "ab...");
  assert.equal(truncateOutput("\u001b[31mred\u001b[0m\u0007", 20), "red");
});
