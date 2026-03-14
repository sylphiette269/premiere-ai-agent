# Contributing

## Scope

This repository ships the `premiere-mcp/` delivery target only.

- Keep the final runtime, CEP panel, installer, and tests inside this repository.
- Do not treat `Adobe_Premiere_Pro_MCP/` from the wider workspace as the shipping target.

## Development Setup

```bash
npm install
npm test
npm run build
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

- Prefer targeted tests before broad refactors.
- Keep both bridge modes working:
  - `per-request`: `command-{id}.json` / `response-{id}.json`
  - `legacy`: `cmd.json` / `result.json`
- Preserve `reference-only` media behavior unless the change explicitly replaces it.
- Keep Node bridge env and CEP bridge config aligned.

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
