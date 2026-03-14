---
name: premiere-reference-migration
description: Use when comparing Adobe_Premiere_Pro_MCP and premiere-mcp to selectively port bridge, tool, resource, prompt, or script behavior while keeping the final deliverable in premiere-mcp
---

# Premiere Reference Migration

## Overview

This skill keeps migration work bounded. `Adobe_Premiere_Pro_MCP` is the donor project. `premiere-mcp` is the shipping project.

## When to Use

- Porting MCP surface from the reference project
- Reconciling bridge behavior between the two repositories
- Reusing recovery or installer logic without changing the delivery target

Do not use this skill when the task is only about editing files inside the reference project.

## Workflow

1. Verify both projects before copying behavior.
2. Add or update failing tests in `premiere-mcp/` first.
3. Port server-side code into `premiere-mcp/src/`.
4. Reconcile bridge env, CEP installer, and protocol differences.
5. Keep final docs and verification in `premiere-mcp/`.

## Guardrails

- Never move the delivery target from `premiere-mcp/` to the reference project.
- Preserve `premiere-mcp/scripts/install-cep-panel.mjs` unless the task explicitly replaces the install flow.
- Keep compatibility with both `PREMIERE_TEMP_DIR` and legacy `PREMIERE_MCP_COMMAND_FILE` when bridge changes touch path resolution.

## Common Mistakes

- Copying the reference implementation without adding tests in `premiere-mcp/`
- Migrating tools but forgetting CEP bridge protocol compatibility
- Updating README or roadmap before the migrated runtime is actually green
