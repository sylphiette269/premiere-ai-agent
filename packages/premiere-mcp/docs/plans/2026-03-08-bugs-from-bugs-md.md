# BUGS.md Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the pending tool and bridge regressions described in `e:\作业1\BUGS.md` inside `premiere-mcp`, with automated regression coverage.

**Architecture:** Keep fixes localized to `src/tools/index.ts`, plus any bridge support needed in `src/bridge/index.ts`. Reproduce each bug with focused unit tests against mocked bridge calls, then implement the smallest behavior change that makes the tests pass without broad refactors.

**Tech Stack:** TypeScript, Jest, Node test runner, Zod, ExtendScript string generation through `PremiereProBridge`

### Task 1: Confirm active bug set

**Files:**
- Modify: `e:\作业1\premiere-mcp\docs\plans\2026-03-08-bugs-from-bugs-md.md`
- Inspect: `e:\作业1\premiere-mcp\src\tools\index.ts`
- Inspect: `e:\作业1\premiere-mcp\src\bridge\index.ts`
- Inspect: `e:\作业1\premiere-mcp\src\__tests__\tools\index.test.ts`
- Inspect: `e:\作业1\premiere-mcp\src\__tests__\bridge\index.test.ts`

**Step 1: Compare BUGS.md entries against current code**

Check whether Bug 5 and Bug 8 are already fixed in the current workspace before touching code.

**Step 2: Record which bugs still need code changes**

Treat already-fixed items as verification-only and focus implementation on the remaining bugs.

### Task 2: Add failing regression tests for tool wrappers

**Files:**
- Modify: `e:\作业1\premiere-mcp\src\__tests__\tools\index.test.ts`

**Step 1: Write failing tests for discovery and sequence creation**

Add tests covering:
- `list_project_items` with `includeMetadata: true`
- `create_sequence` forwarding explicit width, height, frameRate, and sampleRate

**Step 2: Write failing tests for timeline and effects**

Add tests covering:
- `move_clip` forwarding `newTrackIndex`
- `apply_effect` embedding parameter assignments
- `batch_add_transitions` supporting `trackType: 'audio'`

**Step 3: Run targeted Jest tests and confirm RED**

Run: `npm run test:jest -- src/__tests__/tools/index.test.ts --runInBand`

Expected: new assertions fail for the current implementation.

### Task 3: Implement minimal fixes in tool definitions and ExtendScript generation

**Files:**
- Modify: `e:\作业1\premiere-mcp\src\tools\index.ts`

**Step 1: Fix tool schemas and dispatcher wiring**

Update any relevant input schemas and `executeTool` cases, especially `batch_add_transitions` so `trackType` is accepted.

**Step 2: Fix ExtendScript payload generation**

Implement the smallest safe changes so:
- `listProjectItems` includes optional metadata fields only when requested
- `createSequence` respects explicit settings when no preset is supplied
- `moveClip` handles same-track moves and cross-track reinsert flow
- `applyEffect` applies named parameter values after effect insertion
- `batchAddTransitions` selects video or audio QE APIs based on `trackType`

**Step 3: Keep already-fixed items unchanged unless verification shows regression**

Avoid reworking `build_motion_graphics_demo` and Premiere 2022 detection if tests confirm they already behave correctly.

### Task 4: Verify bridge behavior coverage

**Files:**
- Modify: `e:\作业1\premiere-mcp\src\__tests__\bridge\index.test.ts` if needed
- Inspect: `e:\作业1\premiere-mcp\src\bridge\index.ts`

**Step 1: Verify the 2022 installation-path test still passes**

If bridge behavior is already covered, do not add redundant code changes.

### Task 5: Run focused and full verification

**Files:**
- Verify: `e:\作业1\premiere-mcp\src\tools\index.ts`
- Verify: `e:\作业1\premiere-mcp\src\bridge\index.ts`
- Verify: `e:\作业1\premiere-mcp\src\__tests__\tools\index.test.ts`

**Step 1: Run targeted tests**

Run: `npm run test:jest -- src/__tests__/tools/index.test.ts --runInBand`

Expected: PASS

**Step 2: Run bridge tests**

Run: `npm run test:jest -- src/__tests__/bridge/index.test.ts --runInBand`

Expected: PASS

**Step 3: Run the full test suite**

Run: `npm test`

Expected: PASS

**Step 4: Run the build**

Run: `npm run build`

Expected: PASS
