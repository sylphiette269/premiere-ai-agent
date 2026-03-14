---
name: premiere-natural-language-edit-planning
description: Use when the user gives direct editing requirements and the repo needs deterministic Premiere assembly defaults without relying on an external LLM API
---

# Premiere Natural-Language Edit Planning

## Overview

This skill covers the `prompt -> parsed intent -> assembly defaults` route inside `premiere-mcp`.

## When to Use

- The user describes the target video directly instead of supplying a guide
- The edit still needs deterministic `clipDuration`, `transitionName`, and `motionStyle`
- The repo should preserve unparsed style language instead of failing on unknown words

## Required Workflow

1. Parse the prompt with keyword and regex rules first.
2. Build an explicit assembly plan from the parsed intent.
3. Keep unresolved style language in `visualStyle`; do not discard it.
4. Use the derived plan only for missing high-level assembly settings.
5. If the edit still depends on a guide or source folder review, run the relevant planning or review step before assembly.

## Guardrails

- Do not call an external LLM API to parse the prompt.
- Do not silently force `Cross Dissolve` unless the parsed plan actually requests a clean transition.
- Do not pretend a prompt-only plan can replace source-folder review when asset selection is still ambiguous.
- Do not drop the raw prompt from the resulting plan.

## Common Mistakes

- Treating every descriptive adjective as a hard effect parameter
- Overwriting explicit tool arguments with prompt-derived defaults
- Returning only free-form prose instead of structured assembly defaults
