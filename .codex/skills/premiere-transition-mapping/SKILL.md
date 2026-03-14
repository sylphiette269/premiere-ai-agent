---
name: premiere-transition-mapping
description: Use when Word or Markdown editing guides mention transitions, easing, default transitions, or batch transition shortcuts and the repo needs to map that language into safe Premiere transition behavior
---

# Premiere Transition Mapping

## Overview

This skill separates real clip-to-clip transitions from animation easing language. It keeps Premiere automation from guessing `Cross Dissolve` when the document either specifies a different transition or only talks about keyframes.

## When to Use

- The guide mentions `转场` or `过渡`
- Some steps describe keyframes, 贝塞尔曲线, or smoother motion
- The automation keeps adding the wrong default transition
- The guide says to set a default transition and batch-apply it

## Required Loop

1. Extract transition intent from the document before editing.
2. Distinguish keyframe easing steps from clip transition steps.
3. Only apply automatic clip transitions when the document explicitly names one or explicitly says to batch-apply the selected default transition.
4. If the document does not specify a clip transition, do not fall back to `Cross Dissolve`.

## Guardrails

- Keyframe easing language is not clip transition evidence.
- Material-to-material transition language is evidence for a clip transition.
- `Set selected transition as default` and `CTRL+D` indicate a UI batch workflow, not proof that QE DOM can safely recreate the result.
- Return transition policy metadata so later stages know whether transitions were explicit or omitted.
- Treat DOCX-derived transition instructions as manual-review only until the current Premiere build proves the automation path is safe.
- Do not simulate a trim by creating one-sided or hidden-head transition artifacts on a clip.

## Common Mistakes

- Treating every `过渡` mention as a clip boundary transition
- Applying `Cross Dissolve` just because no better option was parsed
- Ignoring default-transition instructions that imply batch application
- Mixing timeline transition order hints with transition type selection
- Auto-applying guide-derived transitions without boundary verification on the host Premiere build
