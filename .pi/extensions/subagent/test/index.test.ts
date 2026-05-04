import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  getAgentToolAllowlist,
  getChildExtensionArgs,
  getIgnoredTools,
  isPathInside,
  isValidTimeoutSeconds,
  resolveAgentCwd,
} from "../utils.ts";

function makeTempProject() {
  const root = mkdtempSync(join(tmpdir(), "pi-subagent-test-"));
  mkdirSync(join(root, ".pi", "extensions", "sandbox"), { recursive: true });
  writeFileSync(join(root, ".pi", "extensions", "sandbox", "index.ts"), "export default function noop() {}\n");
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

test("isPathInside accepts descendants and rejects escapes", () => {
  const root = "/tmp/project";
  assert.equal(isPathInside(root, "/tmp/project"), true);
  assert.equal(isPathInside(root, "/tmp/project/src"), true);
  assert.equal(isPathInside(root, "/tmp/project2"), false);
  assert.equal(isPathInside(root, "/tmp"), false);
});

test("resolveAgentCwd keeps cwd inside project root", () => {
  const root = makeTempProject();
  try {
    assert.equal(resolveAgentCwd(root, "src"), join(root, "src"));
    assert.throws(() => resolveAgentCwd(root, ".."), /inside project root/);
    assert.throws(() => resolveAgentCwd(root, "missing"), /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("getChildExtensionArgs disables inherited extensions and reloads sandbox only", () => {
  const root = makeTempProject();
  try {
    assert.deepEqual(getChildExtensionArgs(root), [
      "--no-extensions",
      "-e",
      join(root, ".pi", "extensions", "sandbox", "index.ts"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("agent tool allowlist excludes extension and unknown tools", () => {
  const agent = {
    name: "worker",
    description: "worker",
    source: "project",
    filePath: "worker.md",
    systemPrompt: "",
    tools: ["read", "bash", "subagent", "unknown", "edit"],
  };

  assert.deepEqual(getAgentToolAllowlist(agent), ["read", "bash", "edit"]);
  assert.deepEqual(getIgnoredTools(agent), ["subagent", "unknown"]);
});

test("agents without tools receive only built-in tools", () => {
  const agent = {
    name: "worker",
    description: "worker",
    source: "project",
    filePath: "worker.md",
    systemPrompt: "",
  };

  assert.deepEqual(getAgentToolAllowlist(agent), ["read", "bash", "edit", "write", "grep", "find", "ls"]);
  assert.deepEqual(getIgnoredTools(agent), []);
});

test("timeout validation accepts non-negative finite values only", () => {
  assert.equal(isValidTimeoutSeconds(0), true);
  assert.equal(isValidTimeoutSeconds(1800), true);
  assert.equal(isValidTimeoutSeconds(-1), false);
  assert.equal(isValidTimeoutSeconds(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidTimeoutSeconds(Number.NaN), false);
});
