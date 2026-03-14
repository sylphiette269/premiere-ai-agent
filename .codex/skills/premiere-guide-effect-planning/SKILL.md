---
name: premiere-guide-effect-planning
description: Use when DOCX or Markdown editing guides mention named Premiere effects, copy-to-all steps, or reusable effect stacks and the repo needs to turn that guidance into safe clip-level effect planning before assembly
---

# Premiere Guide Effect Planning

## Overview

This skill keeps document-driven assembly from guessing clip effects ad hoc. It extracts named effects from the guide, distinguishes optional effects from copy-to-all instructions, and only lets high-level assembly apply them when the caller opts in explicitly.

## When to Use

- The guide names effects like `Gaussian Blur`, `Basic 3D`, `Drop Shadow`
- Some steps say to copy the current effect stack to all other clips
- The planner needs to expose reusable effects before Premiere execution
- High-level assembly should get closer to the guide without silently adding effects

## Required Loop

1. Extract effect names from the guide before assembly.
2. Separate optional effects from `copy to all clips` evidence.
3. Persist that result in the assembly plan as `effectPlan`.
4. Keep high-level assembly effect application opt-in via `applyGuideEffects: true`.
5. Treat failed guide-derived effect application as an `assemblyReview` blocker when those effects were explicitly requested.

## Guardrails

- Transition names are not clip effects and must stay out of `effectPlan`.
- `CTRL+ALT+V`, `复制到其他素材`, `all clips`, and similar wording are evidence for promoting earlier effects to `globalClipEffects`.
- If the guide mentions an effect once but never says to copy it, keep it in `optionalClipEffects`.
- Do not auto-apply guide-derived effects just because they were parsed; execution must stay explicit.
- Treat screenshot-dependent effect values such as colors, light positions, blend modes, and stack order as manual-only unless another verified source provides exact values.
- If the guide only proves that an effect exists, do not assume its parameters are safe to execute automatically.

## Common Mistakes

- Treating transition names as effects
- Applying all parsed effects by default during assembly
- Losing the evidence steps that explain why an effect was promoted
- Returning a plan without exposing whether effects are optional or global
- Auto-filling missing effect parameters from screenshots or guessed defaults
