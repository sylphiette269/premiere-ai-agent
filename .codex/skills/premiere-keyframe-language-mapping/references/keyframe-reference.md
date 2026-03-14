# Premiere Keyframe Reference

## Core Model

A usable tutorial-grade keyframe plan has two layers:

```text
value plan = { property, time, value }
interpolation plan = { property, times[], mode }
```

- Value plans answer what state the property should have.
- Interpolation plans answer how Premiere should travel between those states.
- Do not merge them into one vague word such as `smooth`.

## Static vs Animated

- No keyframe: static property.
- One keyframe: recorded state, no visible interval yet.
- Two or more time-separated keyframes: visible animation is possible.
- Same value on two time-separated keys: hold.

## Property-First Interpretation

| Language | Property | Value shape |
| --- | --- | --- |
| zoom, push in, pull out | `Scale` | scalar |
| rotate, spin | `Rotation` | scalar |
| fade in, fade out | `Opacity` | scalar |
| move, slide, drift | `Position` | vector |
| pivot around a corner | `Anchor Point` plus another property | vector plus scalar |
| effect motion such as blur amount or shadow distance | effect property | effect-specific |

## Interpolation Terms

| Term | Meaning | What must stay unchanged |
| --- | --- | --- |
| `linear` | constant rate | keyframe times and values |
| `Bezier` | curved interpolation | keyframe times and values |
| `Continuous Bezier` | connected smooth handles across the selected key | keyframe times and values |
| `Hold` | no interpolation after the key | keyframe times and values |

`Continuous Bezier` is not just `ease_in_out`. If a guide explicitly says `Continuous Bezier`, preserve that exact instruction.

## Premiere UI Semantics

Typical manual flow:

1. Select the clip.
2. Open `Effect Controls`.
3. Expand the target property.
4. Enable the stopwatch if needed.
5. Create or inspect the keyframes.
6. Open the graph editor if the guide requires curve work.
7. Select the named keyframes.
8. Apply the requested interpolation mode, such as `Continuous Bezier`.

If a guide says `select both keyframes`, that is an execution instruction, not a paraphrasable hint.

## Exact Tutorial Pattern

For the current photo-card tutorial, the strict pattern is:

```json
{
  "property": "Basic 3D > Rotation",
  "keyframes": [
    { "time": 0.0, "value": -30 },
    { "time": 3.9, "value": 30 }
  ],
  "interpolation": {
    "mode": "continuous_bezier",
    "times": [0.0, 3.9],
    "selectionScope": "both-keyframes"
  }
}
```

The following substitutions are wrong for this tutorial:

- `-11 -> 2`
- `ease_in_out`
- `close enough smooth`
- adding more keys without first checking whether old keys already exist

## Coordinate Mapping

Some Premiere effect parameters expose different coordinate spaces in the UI and in the host API.

Example:

- Premiere UI may show sequence-center light source as `960,540`
- host API may expose the same point as `[0.5, 0.5]`

When the sequence is `1920x1080`, those can describe the same center point. Record the mapping instead of treating it as a mismatch.

## Still Image Motion Workarounds

Still images can behave differently from normal video clips during Motion automation. When a still-image move is important, use this fallback order:

1. Prefer the repo's Transform effect fallback instead of assuming intrinsic Motion is authoritative.
2. Verify which component actually received the keyframes after the write.
3. If the move is still unstable or must mirror a tutorial UI exactly, Nest the clip and animate the Transform effect inside the nested sequence.
4. If a project contains many still images, prefer Render and Replace or pre-render those stills to short video clips before bulk automation.

For repeatable hero shots, saving a Transform preset is safer than rebuilding the same still-image move by hand each time.

## Current Repo Execution Limits

- Scalar keyframe values are the safest current automation target.
- Graph-editor state is harder to prove than scalar values.
- A bridge call that writes interpolation may still require UI-level verification if the repo cannot read back the exact graph state.
- If exact `Continuous Bezier` proof is required and the tool surface cannot verify it, stop and surface the gap.

## Common Failure Patterns

| Failure | Why it is wrong | Safer response |
| --- | --- | --- |
| A coarse motion preset is treated as a full keyframe plan | property, time, value, and interpolation detail are lost | expand to explicit property plans |
| New keys are appended to an already-animated property | old hidden state survives and changes the result | inspect or clear old keys first |
| `Continuous Bezier` is treated as generic smooth easing | tutorial-level interpolation detail is lost | keep an explicit interpolation plan |
| Only values are checked after execution | graph shape is unverified | add interpolation validation or surface the gap |
| UI pixel values and API normalized values are compared directly | equivalent values look different | document the mapping |

## When to Stop

Return an unresolved gap instead of claiming success when any of these are missing:

- the exact property name
- keyframe times
- required interpolation mode
- confirmation whether old keys must be replaced
- a reliable way to verify the requested graph-editor state
