---
name: premiere-assembly-planning
description: Use when a DOCX guide and a scanned media manifest need to become a deterministic Premiere assembly candidate before high-level timeline execution
---

# Premiere Assembly Planning

## Overview

This skill turns `docx + media manifest` into a deterministic assembly candidate before Premiere execution.

## When to Use

- `assemble_product_spot` still needs manual `assetPaths`
- The repo has a guide and a scanned folder, but no stable playback order
- The next iteration needs planning logic without guessing screenshot-only parameters

## Required Loop

1. Parse the DOCX guide and transition intent first.
2. Filter the manifest down to visual assets only.
3. Build a deterministic playback order from explicit folder and filename order, not ad-hoc guessing.
4. Derive only safe defaults for `clipDuration`, `motionStyle`, and `transitionName`.
5. Run reasonability review on the planned candidate before high-level assembly.

## Guardrails

- Do not copy or relocate source media.
- Do not fabricate parameters that only exist in screenshots.
- Do not silently include documents, projects, or audio files in visual assembly.
- Do not hide planner heuristics; keep the chosen asset order and defaults inspectable.

## Common Mistakes

- Treating the planner like content understanding instead of deterministic preparation
- Falling back to default transitions when the guide does not explicitly allow it
- Returning only raw `assetPaths` without review context
