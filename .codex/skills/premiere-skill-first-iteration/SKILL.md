---
name: premiere-skill-first-iteration
description: Use when a recurring Premiere automation problem is underspecified, repeatedly failing, or hard to debug and the repo should capture a project-local skill before expanding MCP behavior
---

# Premiere Skill-First Iteration

## Overview

This skill makes the repo capture difficult workflow knowledge before adding more MCP behavior.

## When to Use

- The same class of failure keeps repeating
- A DOCX, media, transition, or QA workflow is still ambiguous
- The repo needs a stable local process before another round of MCP changes

## Required Loop

1. Capture the failing pattern.
2. Add or update a repository-local skill.
3. Add tests around the clarified behavior.
4. Then change MCP code and docs.

## Agent Closed-Loop Addendum

When the recurring failure is caused by agent orchestration rather than a single tool bug,
capture the workflow rules here before expanding the MCP surface:

1. Disable known-bad tool paths explicitly instead of leaving them selectable.
2. Require a research gate for style-driven or reference-driven edit tasks.
3. Treat write success as provisional until a read-back verifier confirms the result.
4. Add an independent critic step before the agent can claim completion.
5. Standardize machine-readable error codes so retry logic does not depend on string guessing.

This addendum is the minimum bar for any new closed-loop Premiere agent behavior.

## Guardrails

- Do not expand MCP behavior first and explain it later.
- Do not keep workflow rules only in chat context.
- Update the skill when the implementation evolves.

## Common Mistakes

- Treating a recurring problem as a one-off
- Fixing code without updating project-local guidance
- Letting docs, skills, and MCP drift apart
