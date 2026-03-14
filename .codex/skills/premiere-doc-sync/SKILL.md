---
name: premiere-doc-sync
description: Use when tools, resources, prompts, bridge protocols, scripts, or repository-local skills change in premiere-mcp and the project docs must be updated together
---

# Premiere Doc Sync

## Overview

This skill prevents documentation drift across the repo when MCP surface or bridge behavior changes.

## When to Use

- Tool, resource, or prompt counts change
- Bridge protocol or env resolution changes
- Install or recovery scripts change
- Project-local skills are added or renamed

## Required Files

Update these together when they are affected:

- `premiere-mcp/README.md`
- `CLAUDE.md`
- `ROADMAP.md`
- `VISION.md`
- `SKILLS-PLAN.md`

## Sync Rules

1. Use exact counts from code or tests, not guesses.
2. State that `premiere-mcp/` is the delivery target and the reference project is only a donor.
3. Document both bridge modes and both command envelopes when relevant.
4. Mention repository-local skills from `premiere-mcp/.codex/skills/`.
5. Re-run verification before claiming docs are current.

## Common Mistakes

- Updating README but not roadmap or skills docs
- Leaving old tool counts after migration
- Describing bridge behavior that only exists in the reference project
