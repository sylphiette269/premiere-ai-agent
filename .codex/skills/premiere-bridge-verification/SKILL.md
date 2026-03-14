---
name: premiere-bridge-verification
description: Use when changing bridge directories, CEP command envelopes, timeout handling, or bridge recovery behavior in premiere-mcp
---

# Premiere Bridge Verification

## Overview

This skill keeps the MCP side and CEP side pointed at the same bridge and verifies the command protocol still matches runtime expectations.

## When to Use

- Editing `cep-panel/js/bridge-config.js`
- Editing `src/bridge/index.ts` or `cep-panel/js/panel.js`
- Changing `command-*.json` / `response-*.json` behavior
- Debugging timeout, expiry, or recovery script issues

## Verification Loop

1. Confirm the effective bridge directory.
   - Preferred: `PREMIERE_TEMP_DIR`
   - Fallback: `dirname(PREMIERE_MCP_COMMAND_FILE)`
   - CEP side: `bridge-config.js`
2. Confirm the command shape.
   - legacy action envelope
   - raw script envelope with `script`, `timeoutMs`, `expiresAt`
3. Run targeted tests for panel and server surface.
4. Run full `npm test` and `npm run build`.

## Quick Checks

- `bridge-status.json` should advertise `per-request` or `legacy` explicitly.
- CEP should reject expired raw script commands with `command_expired`.
- Node and CEP must read and write the same directory.

## Common Mistakes

- Changing only the Node env or only the CEP config
- Verifying legacy mode but not per-request mode
- Treating a timeout as a tool bug before checking bridge directory mismatch
