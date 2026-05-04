import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatRoute,
  routeMatches,
  selectRoute,
  validateConfig,
} from "../utils.ts";

test("selectRoute chooses the first matching keyword route", () => {
  const config = validateConfig({
    defaultRoute: "default",
    routes: [
      {
        name: "review",
        match: { keywords: ["review", "レビュー"] },
        thinkingLevel: "high",
      },
      {
        name: "default",
        thinkingLevel: "medium",
      },
    ],
  });

  const selection = selectRoute(config, "この変更をレビューしてください");
  assert.equal(selection.route.name, "review");
  assert.equal(selection.reason, "keyword:レビュー");
});

test("selectRoute supports regex and context routes", () => {
  const config = validateConfig({
    defaultRoute: "default",
    routes: [
      {
        name: "large-context",
        match: { minContextPercent: 80 },
        thinkingLevel: "high",
      },
      {
        name: "bugfix",
        match: { regex: ["fix(es)?\\s+#\\d+"] },
        thinkingLevel: "high",
      },
      {
        name: "default",
        thinkingLevel: "medium",
      },
    ],
  });

  assert.equal(selectRoute(config, "continue", { percent: 84 }).route.name, "large-context");
  assert.equal(selectRoute(config, "fixes #123").route.name, "bugfix");
});

test("selectRoute falls back to defaultRoute", () => {
  const config = validateConfig({
    defaultRoute: "fallback",
    routes: [
      {
        name: "review",
        match: { keywords: ["review"] },
      },
      {
        name: "fallback",
        thinkingLevel: "low",
      },
    ],
  });

  const selection = selectRoute(config, "hello");
  assert.equal(selection.route.name, "fallback");
  assert.equal(selection.reason, "default");
});

test("validateConfig rejects invalid model and thinking settings", () => {
  assert.throws(
    () =>
      validateConfig({
        routes: [{ name: "bad", provider: "openai" }],
      }),
    /provider and model together/,
  );

  assert.throws(
    () =>
      validateConfig({
        routes: [{ name: "bad", thinkingLevel: "maximum" }],
      }),
    /invalid thinkingLevel/,
  );

  assert.throws(
    () =>
      validateConfig({
        routes: [{ name: "bad", match: { minContextPercent: 101 } }],
      }),
    /minContextPercent/,
  );
});

test("routeMatches ignores invalid regex entries", () => {
  assert.equal(
    routeMatches({ name: "bad-regex", match: { regex: ["["], keywords: ["safe"] } }, "safe prompt"),
    "keyword:safe",
  );
});

test("formatRoute includes model and thinking details", () => {
  assert.equal(
    formatRoute({
      name: "review",
      provider: "openai",
      model: "gpt-5.2",
      thinkingLevel: "high",
    }),
    "review | openai/gpt-5.2 | thinking:high",
  );
});
