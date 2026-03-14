---
name: premiere-docx-visual-ingest
description: Use when a Premiere editing guide is stored in a screenshot-heavy .docx file and the repo must extract ordered steps, embedded images, and unresolved visual dependencies before any automation runs
---

# Premiere DOCX Visual Ingest

## Overview

This skill handles Word guides that mix steps and screenshots. The goal is to preserve step order and image bindings without guessing screenshot-only parameters.

## When to Use

- A `.docx` describes Premiere operations with screenshots
- Text contains phrases like `如图所示` or `参数如下`
- The next automation step depends on understanding which screenshot belongs to which step

## Required Workflow

1. Extract paragraph text and embedded image relationships from the DOCX.
2. Group numbered paragraphs into ordered steps.
3. Attach following image-only and continuation paragraphs to the current step.
4. Mark screenshot-only requirements as unresolved visual dependencies.
5. Only then hand off to Markdown normalization or editing automation.

## Guardrails

- Do not infer hidden parameters from screenshots.
- Do not drop images just because the text is short.
- Do not flatten continuation paragraphs into separate steps.
- Treat screenshot-only steps as planning evidence, not execution authority.
- Do not use screenshot-heavy DOCX guides as a safe one-pass source for transitions, effect values, or keyframe timing.

## Common Mistakes

- Treating the Word file as plain text
- Losing `inline` or `anchor` images
- Guessing effect parameters that the document only shows visually
- Turning unresolved screenshot cues into automatic Premiere actions
