---
name: premiere-docx-markdown-normalization
description: Use when extracted Word guide content must be rewritten into AI-readable Markdown that preserves step order, screenshot references, and unresolved visual requirements
---

# Premiere DOCX Markdown Normalization

## Overview

This skill turns extracted DOCX guide content into Markdown that Codex or other AI tools can read safely.

## When to Use

- A DOCX guide has already been extracted into ordered steps
- The next stage needs `.md` instead of raw OOXML or plain text
- The Markdown must stay faithful to screenshots and unresolved visual gaps

## Required Structure

- Source metadata
- Title
- AI usage constraints
- Ordered step sections
- Relative image links
- Explicit unresolved visual dependencies

## Guardrails

- Keep the original step wording visible.
- Keep screenshot links relative and stable.
- Mark unresolved visual requirements instead of replacing them with guessed values.

## Common Mistakes

- Producing prose summaries instead of step-by-step Markdown
- Omitting screenshot links
- Hiding ambiguity that later causes wrong transitions or wrong effects
