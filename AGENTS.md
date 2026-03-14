# AGENTS.md

## Delivery Shape

- Root repo: `video-agent` monorepo
- Tool packages live in `packages/`
- Agent orchestration lives in `agent/`, `cli/`, and `scenarios/`

## Working Rules

- Keep `packages/premiere-mcp/` as the Premiere execution layer
- Keep `packages/audio-beat-mcp/` and `packages/video-research-mcp/` as reusable tool layers
- Put cross-package orchestration in root-level `agent/`
- Prefer adapting existing package APIs over re-implementing their logic at the root
- When adding a new scenario, keep it runnable from `scenarios/` and traceable through `agent/`

## Verification

Run from the repo root:

```bash
npm install
npm run build
npm test
```
