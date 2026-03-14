---
name: premiere-timeline-conformance-review
description: Use when checking whether an assembled Premiere timeline actually matches the planned asset order, clip count, and continuity after automatic placement
---

# Premiere Timeline Conformance Review

## Overview

This skill verifies the realized timeline after assembly instead of trusting operation success alone.

## When to Use

- A high-level workflow has already assembled clips into a sequence
- `list_sequence_tracks` or equivalent timeline snapshot data is available
- The edit should be compared against a deterministic plan or explicit asset order
- The assembly can succeed mechanically while still producing the wrong track contents

## Required Inputs

- Expected asset path list or expected clip count
- Target video track index used for assembly
- Timeline snapshot from Premiere after assembly
- Optional transition expectation and existing execution review findings

## Mechanical Checks

- Warn when the target video track snapshot is unavailable after assembly
- Block when the target video track exists but contains fewer clips than planned
- Warn when the target video track contains more clips than planned
- Warn when clip basename order no longer matches the planned asset order
- Warn when adjacent clips leave visible gaps or overlaps on the main assembly track
- Warn when any realized clip has zero or negative duration

## Workflow

1. Generate or collect the planned asset order before assembly.
2. Assemble the timeline.
3. Read the sequence tracks immediately after assembly.
4. Compare the realized main video track against the plan.
5. Treat blockers as assembly failures, not as optional warnings.
6. Keep warnings visible for manual correction before refinement.

## Guardrails

- Do not assume `addToTimeline` success means the final track is correct.
- Review the realized track, not only individual operation results.
- Compare against the main assembly track, not title or overlay tracks.
- Do not hide mismatches just because Premiere returned a success payload.

## Common Mistakes

- Trusting placement logs without re-reading the sequence
- Forgetting that overlay tracks can exist while the main track is wrong
- Ignoring clip order drift after automatic placement
- Ignoring timing gaps that break the visual rhythm
