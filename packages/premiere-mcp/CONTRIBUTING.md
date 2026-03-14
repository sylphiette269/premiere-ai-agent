# Contributing

## Scope

This package ships the Premiere execution layer only.

- Keep the MCP runtime, CEP panel, installer, and tests inside `packages/premiere-mcp/`
- Treat `audio-beat-mcp` and `video-research-mcp` as sibling packages, not as embedded subfeatures
- Treat `Adobe_Premiere_Pro_MCP/` from the wider workspace as reference material, not as the shipping target

## Development Setup

From the monorepo root:

```bash
npm install
npm run build --workspace packages/premiere-mcp
npm run test --workspace packages/premiere-mcp
```

Or inside this package:

```bash
npm install
npm run build
npm test
```

Run the MCP server locally:

```bash
node --import tsx src/index.ts
```

Install the CEP panel locally when needed:

```bash
npm run install:cep
```

## Change Rules

- Prefer targeted tests before broad refactors
- Keep both bridge modes working:
  - `per-request`: `command-{id}.json` / `response-{id}.json`
  - `legacy`: `cmd.json` / `result.json`
- Preserve `reference-only` media behavior unless the change explicitly replaces it
- Keep Node bridge env and CEP bridge config aligned

## Before Opening a Pull Request

Run:

```bash
npm test
npm run build
```

Include in the PR description:

- what changed
- how it was verified
- any known limitations or follow-up work
