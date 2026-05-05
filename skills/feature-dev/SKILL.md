---
name: feature-dev
description: "Guided feature development with systematic codebase exploration, architecture design, and quality review. Use when building new features, adding capabilities, or implementing complex changes that touch multiple files. Not for single-line fixes or trivial changes."
compatibility: "requires read, grep, find, ls, bash, edit, write; subagent recommended for parallel exploration and review"
---

# Feature Development

You are helping a developer implement a new feature. Follow a systematic approach: understand the codebase deeply, identify and ask about all underspecified details, design elegant architectures, then implement.

## Core Principles

- **Ask clarifying questions**: Identify all ambiguities, edge cases, and underspecified behaviors. Ask specific, concrete questions rather than making assumptions. Wait for user answers before proceeding with implementation. Ask questions early (after understanding the codebase, before designing architecture).
- **Understand before acting**: Read and comprehend existing code patterns first.
- **Read files identified by subagents**: When launching subagents (scout, planner), ask them to return lists of the most important files to read. After subagents complete, read those files to build detailed context before proceeding.
- **Simple and elegant**: Prioritize readable, maintainable, architecturally sound code.
- **Track progress**: Use the `todo` tool to maintain a structured task list. Add items for each phase at the start, toggle them as completed. The user can inspect progress with `/todos`.

---

## Phase 1: Discovery

**Goal**: Understand what needs to be built.

If the user provided arguments (via `/skill:feature-dev <description>`), use them as the initial feature description.

**Actions**:
1. If the feature description is unclear, ask:
   - What problem are you solving?
   - What should the feature do?
   - Any constraints or requirements?
2. Summarize your understanding and confirm with the user before proceeding.
3. Add a todo item for each phase using the `todo` tool.

---

## Phase 2: Codebase Exploration

**Goal**: Understand relevant existing code and patterns at both high and low levels.

**Actions**:
1. Launch 2-3 `scout` subagents in parallel via the `subagent` tool. Each scout should explore a different angle:

   ```
   subagent with tasks:
   - agent: scout | Find features similar to [feature] and trace their implementation comprehensively.
   - agent: scout | Map the architecture and abstractions for [feature area], tracing through the code.
   - agent: scout | Identify UI patterns, testing approaches, or extension points relevant to [feature].
   ```

2. Once subagents return, read all key files they identified to build deep understanding.
3. Present a comprehensive summary of findings and patterns discovered.
4. Proceed to Phase 3 only when understanding is solid.

---

## Phase 3: Clarifying Questions

**Goal**: Fill in gaps and resolve all ambiguities before designing.

**CRITICAL — do not skip this phase.**

**Actions**:
1. Review codebase findings and original feature request.
2. Identify underspecified aspects:
   - Edge cases and error conditions
   - Integration points with existing code
   - Scope boundaries (what's in, what's out)
   - Design preferences (conventions to follow vs deviate)
   - Backward compatibility requirements
   - Performance constraints
3. **Present all questions in an organized list and wait for answers before proceeding.**

If the user says "whatever you think is best", provide your recommendation and get explicit confirmation.

---

## Phase 4: Architecture Design

**Goal**: Design multiple implementation approaches with different trade-offs, then help the user choose.

**Actions**:
1. Launch 2-3 `planner` subagents in parallel with different focuses:

   ```json
   {"tasks": [
     {"agent": "planner", "task": "Design architecture for [feature] with MINIMAL changes. Smallest possible change, maximum reuse of existing patterns. Requirements: [summary from Phase 3]."},
     {"agent": "planner", "task": "Design architecture for [feature] with CLEAN approach. Prioritize maintainability, elegant abstractions, testability. Requirements: [summary from Phase 3]."},
     {"agent": "planner", "task": "Design architecture for [feature] with PRAGMATIC balance. Speed + quality, good boundaries without over-engineering. Requirements: [summary from Phase 3]."}
   ]}
   ```

2. Review all approaches and form your recommendation based on codebase analysis.
3. Present to the user:
   - Brief summary of each approach with concrete differences
   - Trade-offs comparison (risk, effort, maintainability)
   - **Your recommendation with reasoning**
4. **Ask the user which approach they prefer before implementation.**

---

## Phase 5: Implementation

**Goal**: Build the feature.

**DO NOT START WITHOUT USER APPROVAL.**

**Actions**:
1. Wait for explicit user approval.
2. Read all relevant files identified in previous phases.
3. Implement following the approved architecture:
   - Follow codebase conventions strictly
   - Write clean, well-documented code
   - Handle error cases and edge conditions
   - Add tests for new functionality
4. Update the checklist as you progress.
5. Use `bash` to run tests and verify the build after each significant step.

---

## Phase 6: Quality Review

**Goal**: Ensure code is correct, simple, and consistent.

**Actions**:
1. Run the full test suite via `bash` to confirm no regressions.
2. Launch 2-3 `reviewer` subagents in parallel with different focus areas:

   ```
   subagent with tasks:
   - agent: reviewer | Review for bugs, logic errors, and correctness in the new changes.
   - agent: reviewer | Review for code quality: simplicity, DRY, adherence to project conventions.
   - agent: reviewer | Review for edge cases, error handling, and security concerns.
   ```

3. Consolidate findings and identify issues to fix.
4. **Present findings to the user and ask what to do** (fix now, fix later, proceed as-is).
5. Address issues based on user decision.

---

## Phase 7: Summary

**Goal**: Document what was accomplished.

**Actions**:
1. Mark all checklist items complete.
2. Summarize:
   - What was built
   - Key decisions made and why
   - Files modified (list paths)
   - Suggested next steps (additional tests, documentation, follow-up work)
3. Confirm completion with the user.
