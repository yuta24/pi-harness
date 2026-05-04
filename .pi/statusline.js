#!/usr/bin/env node

const branch = process.env.PI_GIT_BRANCH || "no-branch";
const model = process.env.PI_MODEL || "no-model";
const context = process.env.PI_CONTEXT_PERCENT || "?";
const statuses = JSON.parse(process.env.PI_EXTENSION_STATUSES || "{}");

const active = Object.entries(statuses)
  .map(([key, value]) => `${key}:${value}`)
  .join(" ");

const contextText = context === "?" ? "ctx:?" : `ctx:${context}%`;
console.log([branch, model, contextText, active].filter(Boolean).join(" | "));
