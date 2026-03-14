# CLAUDE.md

## Package Entry

Use this package as the Premiere execution layer inside the `video-agent` monorepo.
Recommended reading order:

1. `README.md`
2. `AGENTS.md`
3. `docs/PROJECT-STANDARDS.md`
4. MCP resource `premiere://mcp/agent-guide`
5. MCP prompt `operate_premiere_mcp`

## Execution Guidance

- Prefer structured MCP tools over free-form scripts.
- For multi-step editing work, call `agent_task` first when available.
- Verify key writes with read-back before moving on.
- Only treat the task as complete after `critic_edit_result` passes.

## Runtime Reminder

The supported local shape is:

```text
MCP client -> stdio -> packages/premiere-mcp -> CEP -> Premiere Pro
```

Keep Node-side bridge settings and CEP-side bridge settings aligned.
