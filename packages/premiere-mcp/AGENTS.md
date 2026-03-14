# AGENTS.md

## Project Scope

This package is the local Adobe Premiere Pro automation layer inside the monorepo.
The runtime shape is:

```text
TypeScript MCP server -> CEP bridge -> Premiere Pro
```

It is not a web app, not a hosted API, and not a cloud job system.

## Startup Order

1. Read `README.md`.
2. Start the server from `packages/premiere-mcp/` with `node --import tsx src/index.ts` for development or `node dist/index.js` after build.
3. In an MCP client, read resource `premiere://mcp/agent-guide`.
4. Read prompt `operate_premiere_mcp`.
5. For complex editing tasks, prefer `agent_task` before direct write tools.

## Guardrails

- Treat `build_timeline_from_xml` as disabled unless the repo explicitly re-enables it.
- After important write operations, check read-back and `verification.confirmed`.
- Stop on `blocked`, `VERIFICATION_FAILED`, `CRITIC_FAILED`, or `TOOL_DISABLED`.
- Do not report completion before `critic_edit_result` passes.

## Common Commands

```bash
npm install
npm run build
npm test
npm run install:cep
node --import tsx src/index.ts
```
