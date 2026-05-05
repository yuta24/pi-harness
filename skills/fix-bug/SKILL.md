---
name: fix-bug
description: "Systematic bug fixing workflow with root cause analysis, minimal fix strategy, and regression prevention. Use when asked to fix a bug, resolve an issue, debug unexpected behavior, or investigate a crash. Not for feature requests or refactoring."
compatibility: "requires read, grep, find, ls, bash, edit, write; subagent recommended for codebase investigation and review"
---

# Bug Fixing

You are helping a developer fix a bug. Follow a systematic approach: reproduce and understand the bug, find the root cause with precise code analysis, apply a minimal fix, and verify no regressions.

## Core Principles

- **Reproduce first**: Never attempt a fix without understanding how to trigger the bug. If reproduction isn't possible, say so explicitly and work from logs or reports.
- **Root cause, not symptom**: Fix the underlying problem, not the surface manifestation. A symptom-patch often introduces new bugs.
- **Minimal change**: The smallest possible fix is usually the safest. Avoid refactoring nearby code "while you're there" unless it directly contributes to the fix.
- **Regression prevention**: Every fix should include or suggest a test that would have caught the original bug.
- **Document the chain**: The user should understand why the bug happened and why the fix works.
- **Track progress**: Use the `todo` tool to create items for each phase. Toggle as completed. The user can check with `/todos`.

---

## Phase 1: Bug Understanding & Reproduction

**Goal**: Understand exactly what the bug is and how to trigger it.

If the user provided arguments (via `/skill:fix-bug <description>`), use them as the initial bug description.

**Actions**:
1. Clarify the bug if the description is incomplete:
   - What is the expected behavior?
   - What actually happens? (error message, wrong output, crash, hang)
   - When did it start? (after a specific change, always present, intermittent)
   - How to reproduce? (specific steps, input data, environment)
   - How critical is it? (production outage, edge case, cosmetic)
2. **Attempt reproduction**:
   - Use `bash` to run tests, scripts, or commands that demonstrate the bug
   - If the bug is in code you can't run, trace through the code paths manually
   - Confirm you can reliably trigger the failure
3. Summarize the bug clearly and confirm with the user.
4. Add a todo item for each remaining phase via the `todo` tool.

---

## Phase 2: Root Cause Analysis

**Goal**: Trace from symptom to root cause with precise file:line references.

**Actions**:
1. Read the relevant code files identified during reproduction.
2. Trace the execution path from the trigger point to the failure point:
   - Follow call chains and data transformations
   - Identify where behavior diverges from expectation
3. For complex bugs in unfamiliar code, launch a `scout` subagent:

   ```
   subagent with agent: scout
   task: Trace the code path for [bug description]. Start from [entry point] and follow through all relevant code paths. Identify where [unexpected behavior] could occur.
   ```

4. Pinpoint the exact root cause:
   - Specific file, line number(s), and condition
   - Why the code behaves incorrectly in this case
   - Whether this bug could manifest in other places (same pattern elsewhere?)
5. Present the root cause analysis to the user with file:line references.

---

## Phase 3: Fix Strategy Confirmation

**Goal**: Propose a minimal fix and get approval.

**Actions**:
1. Propose a fix with:
   - **What changes**: Specific files and lines to modify
   - **Why this approach**: Why it addresses the root cause
   - **Alternative approaches considered**: Brief mention of other options and why rejected
   - **Risk assessment**: What could break, confidence level
2. If the fix impacts shared code, note which other callers/consumers may be affected.
3. **Wait for user approval before implementing.**

---

## Phase 4: Minimal Fix Implementation

**Goal**: Apply the fix with minimal, surgical changes.

**DO NOT START WITHOUT USER APPROVAL.**

**Actions**:
1. Wait for explicit user approval.
2. Implement the fix:
   - Change only what's necessary to resolve the root cause
   - Keep the same coding style and conventions as surrounding code
   - Add comments only if the fix is non-obvious
   - Do not refactor, reformat, or "improve" adjacent code
3. Run existing tests via `bash` to confirm nothing breaks.
4. If the fix area lacks test coverage, add a targeted test that specifically reproduces the original bug and verifies the fix.

---

## Phase 5: Review & Regression Check

**Goal**: Verify the fix is correct and doesn't introduce new problems.

**Actions**:
1. Run the full test suite via `bash`.
2. Launch a `reviewer` subagent for focused analysis:

   ```
   subagent with agent: reviewer
   task: Review the bug fix in [files]. Verify: (1) the fix addresses the root cause, (2) no new bugs introduced, (3) edge cases around the fix are handled, (4) the test coverage is adequate.
   ```

3. Check for similar patterns elsewhere — construct a precise `grep` query:
   - Identify the specific function name, API call, or code pattern that caused the bug
   - `bash` with `grep -rn "pattern" --include="*.ext" .` (scope to relevant file types)
   - Example: if a null pointer was caused by `getUser()` returning undefined, grep for `getUser()` callers that don't null-check
   - If found, note locations but do NOT fix — this is a separate task
4. **Present findings to the user** (fix verified, issues found, similar patterns found).

---

## Phase 6: Summary

**Goal**: Document what was fixed and why.

**Actions**:
1. Summarize:
   - Bug description (what was happening)
   - Root cause (file:line and explanation)
   - Fix applied (files changed)
   - How to verify the fix works
   - Tests added or test steps for manual verification
2. Note any similar patterns identified in Phase 5 that should be addressed separately.
3. Confirm with the user.
