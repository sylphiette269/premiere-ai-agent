---
name: premiere-edit-reasonability-review
description: Use when reviewing an automatically assembled Premiere timeline or candidate edit plan against a DOCX guide, media manifest, and transition rules before refinement
---

# Premiere Edit Reasonability Review

## Overview

This skill checks whether an auto-built edit is mechanically reasonable before or after Premiere assembly.

## When to Use

- A DOCX guide has already been converted into structured steps
- A media manifest has already been created from the source folder
- A timeline has already been assembled automatically
- Transitions or effects may be technically valid but visually wrong
- The edit must be checked against the source guide before refinement

## Required Inputs

- Parsed guide or DOCX-derived review summary
- Media manifest JSON built from original source paths
- Optional candidate asset list
- Optional assembly settings:
  - transition name
  - transition policy
  - clip duration
  - motion style
  - media policy

## Review Axes

- Step order still matches the source guide
- Effects and transitions match the intended operation
- Repeated operations are applied consistently
- Visual rhythm is not broken by arbitrary defaults
- Unresolved screenshot-only parameters are still surfaced

## Mechanical Checks

- Reject document, project, audio, or unknown files as timeline visuals for `assemble_product_spot`
- Reject candidate asset paths that are not present in the scanned manifest
- Reject `Cross Dissolve` when the guide explicitly points to another transition
- Reject transition requests when fewer than two visual assets are selected
- Reject explicit transition execution when the requested transition operation fails during assembly
- Reject requested MOGRT overlays when the overlay import fails during branded assembly
- Warn when the guide still contains screenshot-only unresolved parameters
- Warn when the media policy is not `reference-only`
- Warn when optional motion keyframes or polish operations fail after assembly
- Keep all unresolved items visible in the review report

## Workflow

1. Convert the guide into Markdown or parse the DOCX again for review data.
2. Scan the source folder into a `reference-only` manifest.
3. Build or collect the candidate asset list and transition settings.
4. Run the reasonability review before calling high-level assembly tools.
5. After assembly, check the realized transition, overlay, motion, and polish operations again.
6. If the report is `blocked`, fix the plan or failed operation instead of forcing Premiere execution.
7. If the report is `needs-review`, keep the warnings visible and continue only with explicit manual acceptance.

## Guardrails

- Do not treat "command succeeded" as "edit is correct".
- Flag mismatches explicitly.
- Keep unresolved items visible for manual review.
- Do not invent missing timing, transition, or effect parameters just to make the report look complete.

## Common Mistakes

- Accepting default transitions without checking the guide
- Ignoring continuity between adjacent clips
- Hiding uncertainty after automated assembly
- Letting `.docx`, `.md`, `.prproj`, or screenshot helper files enter the timeline media selection
