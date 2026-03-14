---
name: premiere-reference-only-media
description: Use when Premiere automation should analyze a user-provided source folder, keep original media paths intact, and avoid copying, staging, or duplicating source assets into project folders
---

# Premiere Reference-Only Media

## Overview

This skill keeps source media in place. The workflow should scan the user folder, build a manifest from original paths, and import into Premiere by reference only.

## When to Use

- The user provides a dedicated source folder for assets
- Previous runs duplicated media into project folders or staging directories
- AI needs to organize assets before editing without bloating the workspace
- A high-level editing workflow needs explicit no-copy guardrails

## Required Loop

1. Scan the source folder and produce a manifest or plan from original absolute paths.
2. Mark the media policy as `reference-only`.
3. Import into Premiere using original file references.
4. Return metadata that states `copied: false` or `copyOperations: 0`.

## Guardrails

- Do not copy, duplicate, stage, or relocate source media unless the user explicitly asks for that.
- Do not replace original paths with project-local clones just to make planning easier.
- Prefer folder manifests and path metadata over ad hoc shell copy steps.
- If a tool cannot honor `reference-only`, fail explicitly instead of silently copying.
- Treat generated verification exports such as `premiere-fade-verify-*`, `fade_check/`, `_premiere_out/fade_check/`, and temporary `frame-*` review images as disposable artifacts, not source media.
- Do not import generated verification exports into Premiere as project items.
- After verification, clean generated verification artifacts before closing the task.

## Common Mistakes

- Creating a second asset folder inside the project just for organization
- Hiding copy behavior behind a helper script
- Returning success without stating whether media was copied
- Letting prompts say “organize assets” without clarifying “by reference only”
