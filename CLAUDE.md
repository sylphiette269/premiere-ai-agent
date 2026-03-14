# CLAUDE.md

This repository is now a monorepo for an AI video agent system.

## Layout

- `packages/premiere-mcp/`
  - Premiere MCP server, CEP panel, bridge protocol, and execution tools
- `packages/audio-beat-mcp/`
  - Audio beat analysis and edit-plan helpers
- `packages/video-research-mcp/`
  - Reference-video research and blueprint aggregation
- `agent/`
  - Gateway, planner, orchestrator, memory, critic, reporter
- `cli/`
  - Repo-level command-line entrypoint
- `scenarios/`
  - Runnable examples for closed-loop flows

## Intent

The root layer should feel like a product:

- one entry
- one execution report
- one state trail
- multiple MCP-backed capabilities underneath

Keep package boundaries clean:

- package code owns tool execution details
- root agent code owns orchestration and recovery logic
