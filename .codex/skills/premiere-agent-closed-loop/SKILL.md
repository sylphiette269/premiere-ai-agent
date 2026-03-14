---
name: premiere-agent-closed-loop
description: Use when extending premiere-mcp with closed-loop agent behavior that must classify the task, enforce research gates, verify writes, run an independent critic, and emit structured failures
---

# Premiere Agent Closed Loop

## Overview

This skill captures the repo-local workflow for turning `premiere-mcp` into a
closed-loop editing agent instead of a loose collection of tools.

## When to Use

- Adding or changing agent orchestration behavior
- Introducing task scenarios such as `viral_style` or `reference_video`
- Adding post-write verification or critic-style review gates
- Standardizing tool/runtime errors for programmatic recovery

## Required Workflow

1. Classify the request into an explicit scenario first.
2. Produce a structured plan with prerequisites, success criteria, and
   per-step failure behavior.
3. Enforce the research gate before any style-driven assembly work.
4. Verify important write operations with read-back comparison.
5. Run an independent critic before reporting success.
6. Emit a structured failure report when the loop aborts.

## Guardrails

- Do not allow `build_timeline_from_xml` on the agent path while it is marked
  disabled.
- Do not let `viral_style` or `reference_video` skip research and go straight
  to assembly.
- Do not treat `ok:true` or `success:true` as completion without verification
  and critic results.
- Do not leave failures as free-form strings only; keep `error_code` and
  `retryable` available for runtime decisions.

## Common Mistakes

- Folding planning, execution, validation, and review into one opaque step
- Using existence-only checks where the task needs value comparison
- Letting the execution layer self-certify success without a critic pass
- Forgetting to preserve fallback guidance for disabled tools
