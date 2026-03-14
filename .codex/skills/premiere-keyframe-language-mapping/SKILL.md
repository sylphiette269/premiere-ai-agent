---
name: premiere-keyframe-language-mapping
description: Use when user prompts, DOCX guides, or review notes mention keyframes, graph curves, Bezier or Continuous Bezier easing, zoom, slide, fade, hold, Motion, Opacity, Scale, Position, Rotation, or Anchor Point and the repo needs explicit Premiere property, time, value, and verification decisions instead of coarse motion defaults.
---

# Premiere Keyframe Language Mapping

## Overview

Treat animation as explicit property changes over time. Convert each motion request into:

- one target
- one property
- one or more keyframes
- an optional interpolation requirement
- an explicit validation requirement

Do not collapse `Bezier` or `Continuous Bezier` into a vague `smooth` result.

## Required Workflow

1. Identify the exact target clip or effect parameter.
2. Convert language such as `rotate`, `zoom`, `fade`, or `hold` into explicit properties.
3. Build keyframes per property, sorted by time.
4. Keep interpolation requirements separate from value requirements.
5. For exact tutorial work, inspect or clear old keys before writing the new pair.
6. If the guide says `select both keyframes` or `open graph editor`, keep that as an execution requirement.
7. If the tool surface cannot prove the requested interpolation state, mark the gap instead of claiming success.

## Quick Reference

| Request language | Property or plan | Minimum pattern |
| --- | --- | --- |
| `zoom`, `push in`, `slow zoom` | `Scale` | start value + end value |
| `rotate`, `spin` | `Rotation` | start value + end value |
| `fade in`, `fade out` | `Opacity` | 2 keyframes |
| `slide`, `move`, `drift` | `Position` | usually 2 keyframes, coordinates required |
| `hold`, `pause`, `freeze` | same property | repeated value at later time |
| `Bezier` | interpolation plan | preserve values, update interpolation |
| `Continuous Bezier` | interpolation plan | preserve values, update both selected keys |
| `open graph editor` | validation or UI execution cue | not a value change by itself |

## Simplified Request Mode

When the user does not want to specify exact times manually, default to clip-local timing:

- `start` means the clip start time
- `end` means the visible clip end time
- `tail` means the last readable moment of the clip, usually a small offset before `end`
- `whole clip` means from clip start to clip tail

If the target clip is already on the timeline, prefer reading its actual start and end from Premiere instead of asking the user for seconds.

Allow short commands like these:

- `第2张做淡入`
- `第3张做淡出`
- `第4张做推近`
- `第5张做拉远`
- `第2张做先推近再停住`
- `第3张做左右轻微摇摆`
- `第2张按第1张的关键帧复刻`

Expand them into explicit property plans automatically, then execute only after the target clip and clip range are confirmed from the timeline.

## Built-In Recipe Defaults

Use these as default recipes when the user only names the effect and does not override values:

| Effect name | Default property plan |
| --- | --- |
| `淡入` | `Opacity: 0 -> 100` over the first 20% of the clip |
| `淡出` | `Opacity: 100 -> 0` over the last 20% of the clip |
| `淡入淡出` | fade in over the first 15%, hold, fade out over the last 15% |
| `推近` | `Scale: 100 -> 108~115` over the whole clip |
| `拉远` | `Scale: 108~115 -> 100` over the whole clip |
| `轻微旋转` | `Rotation: negative small angle -> positive small angle` over the whole clip |
| `复刻上一张` | inspect source clip values first, then copy matching property plans to the target clip |

If the guide or the user already established a stronger project-specific recipe, prefer that recipe over these defaults.

## Output Shape

```json
{
  "target": "clip_or_layer_id",
  "propertyPlans": [
    {
      "property": "Basic 3D > Rotation",
      "keyframes": [
        { "time": 0.0, "value": -30 },
        { "time": 3.9, "value": 30 }
      ]
    }
  ],
  "interpolationPlans": [
    {
      "property": "Basic 3D > Rotation",
      "times": [0.0, 3.9],
      "mode": "continuous_bezier",
      "selectionScope": "both-keyframes"
    }
  ],
  "validation": [
    "Confirm the property has exactly the intended keyframe pair.",
    "Confirm the requested interpolation mode was applied."
  ],
  "assumptions": [],
  "unresolved": []
}
```

## Exact Tutorial Pattern

When the guide says the top photo should rotate from `-30` to `30` and then both keys should become `Continuous Bezier`, keep that pattern literal:

- property: `Basic 3D > Rotation`
- keyframes: `0.0 -> -30`, `3.9 -> 30`
- interpolation: `continuous_bezier`
- selection scope: both keyframes

Do not rewrite this as:

- `ease_in_out`
- `natural stop`
- `similar smooth curve`
- a weaker value range such as `-11 -> 2`

## Validation Rules

- Value validation proves the keyframe values, not the graph shape.
- `Continuous Bezier` requires interpolation validation, not just value validation.
- If the host API writes interpolation but cannot prove the graph-editor state, say that explicitly.
- If Premiere UI shows pixel coordinates and the API uses normalized coordinates, record the mapping instead of treating them as a mismatch.
- In simplified request mode, validate that the detected clip range matches the intended target before writing any keys.

## Fade Reference Verification

For `fade in`, `fade out`, and `fade in + fade out`, verification is mandatory after writing keys.

Use this comparison order:

1. Adobe official opacity-keyframe method
2. the named public tutorial, if the user supplied one
3. the actual clip-local Premiere result

For `effect-free` fades, the expected pattern is:

- `fade in`: `Opacity 0 -> 100`
- `fade out`: `Opacity 100 -> 0`
- `fade in + fade out`: fade in, hold, then fade out

Do not claim the fade matches the online method unless all of these are true:

- the keyframes were written on the clip-local visible range, not accidental sequence-global times
- the property resolved to the real localized opacity property on the host Premiere build
- the first and last visible values match the requested fade pattern
- any requested `Bezier` or `Continuous Bezier` requirement was verified separately or marked unproven

For fade requests, the post-write checklist is:

- verify clip start and end
- verify the opacity property name on the host UI language
- verify the written keyframe times fall inside that clip range
- compare the resulting keyframe pattern against the Adobe reference fade pattern
- if a public tutorial was named, compare against that tutorial separately and report any difference

## Still Image Motion Fallback

When the target is a still image and the requested move touches `Motion > Position`, `Motion > Scale`, `Motion > Rotation`, or `Motion > Anchor Point`, do not assume intrinsic Motion is the most reliable execution surface.

Default fallback order:

1. Prefer the repo's built-in Transform effect fallback and verify which component actually received the keys.
2. If the shot is still unstable or must match a tutorial UI exactly, Nest the clip and animate the Transform effect inside the nested sequence.
3. If the project contains many still images, prefer `Render and Replace` or pre-rendered short video clips before bulk automation.

For stubborn still-image moves, report the manual fallback plainly instead of retrying the same intrinsic Motion write loop.

## Current Repo Guardrails

- `src/natural-language-planner.ts` returns coarse motion intent, not a full per-property keyframe plan.
- `src/tools/index.ts` exposes scalar `add_keyframe`, which is safe for properties such as `Motion > Scale`, `Motion > Rotation`, `Basic 3D > Rotation`, and `Basic 3D > Tilt`.
- Vector properties and some effect coordinates need bridge verification before claiming direct execution.
- Exact tutorial recreation should prefer:
  - replace old keys instead of stacking new ones
  - explicit property names
  - explicit times
  - explicit interpolation mode
  - explicit post-write verification
- For shorthand user requests, the safe expansion order is:
  - locate clip on timeline
  - read clip start and end
  - expand shorthand to a property recipe
  - write keys in clip-local time
  - verify resulting property state

## Red Flags

- `motionStyle` is treated as a full animation plan.
- `Continuous Bezier` is rewritten as generic `smooth`.
- Existing unknown keyframes are left in place.
- Pixel-space UI values and normalized API values are compared without a mapping note.
- Success is claimed from a tool response without checking the resulting property state.
- fade keyframes are written at `0/1/3/4s` for a clip that actually lives later on the timeline.
- opacity becomes `0` immediately instead of fading because clip-local time was not verified.
- a public tutorial is treated as proof without checking whether it uses opacity keys or a transition effect.

## Reference

Read [references/keyframe-reference.md](references/keyframe-reference.md) when you need the fuller execution model, UI semantics, and tutorial-specific validation rules.
