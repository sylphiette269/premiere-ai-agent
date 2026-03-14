---
name: premiere-reference-video-replication
description: Use when a local reference video needs to become a deterministic Premiere replication plan, including blueprint analysis, asset matching, and post-assembly comparison
---

# Premiere Reference Video Replication

## Overview

This skill covers the `reference video -> blueprint -> matched assets -> QA` route inside `premiere-mcp`.

## When to Use

- The user supplies a local reference video instead of a DOCX guide
- The goal is to recreate the reference structure with a scanned source folder
- Assembly quality must be checked against the reference structure after execution

## Required Workflow

1. Analyze the local reference video into a deterministic blueprint.
2. Match the blueprint shots against a scanned `reference-only` media manifest.
3. Keep the ranked match reasons visible; do not hide fallback matches.
4. Pass `referenceBlueprintPath` into high-level assembly when the matched plan is ready.
5. After assembly, inspect `assemblyReview.videoQAReport` before claiming the replication is acceptable.

## Guardrails

- Do not invent extra shots to make the result look closer to the reference.
- Do not replace deterministic matching with ad-hoc guessing.
- Do not treat `cut` as a named transition effect.
- Do not skip the post-assembly QA report when a reference blueprint is available.

## Common Mistakes

- Matching assets only by filename order instead of shot attributes
- Ignoring fallback candidates with weak match scores
- Treating an operation-success response as proof that the reference edit was matched
