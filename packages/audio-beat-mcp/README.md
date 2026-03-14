# audio-beat-mcp

`audio-beat-mcp` is the new audio control layer.

It does exactly three things:

1. Analyze beats and transient hits from audio
2. Turn that timing data into a Premiere-friendly edit plan
3. Generate tool-call arguments for an external `premiere-mcp`

It does not control Premiere Pro directly. Execution stays in `premiere-mcp/`.

## Architecture

```text
AI client
  -> audio-beat-mcp
     -> ../premiere-mcp/python/analyze.py
     -> beat data / edit plan / Premiere tool calls
  -> premiere-mcp
     -> Premiere Pro + CEP
```

## Tools

- `analyze_music_beats`
  - input: local audio path
  - output: BPM, `beatTimes`, `onsetTimes`, `energyPeaks`
- `plan_pr_editing`
  - input: beat analysis result
  - output: marker plan, cut points, scale-pulse animation plan
- `generate_pr_commands`
  - input: edit plan plus Premiere context
  - output: argument arrays for `add_marker`, `add_keyframe`, and `set_keyframe_interpolation`

## Dependency

By default this project reuses `../premiere-mcp/python/analyze.py`.

Install the Python requirements from that project first:

```bash
cd ../premiere-mcp
pip install -r python/requirements.txt
```

Optional overrides:

- `AUDIO_BEAT_MCP_PYTHON`
- `AUDIO_BEAT_MCP_ANALYZE_SCRIPT`

## Local Run

```bash
npm install
npm run build
npm test
node dist/index.js
```

## MCP Config Example

```json
{
  "mcpServers": {
    "audio-beat": {
      "command": "node",
      "args": ["E:/作业1/audio-beat-mcp/dist/index.js"],
      "env": {
        "AUDIO_BEAT_MCP_PYTHON": "python",
        "AUDIO_BEAT_MCP_ANALYZE_SCRIPT": "E:/作业1/premiere-mcp/python/analyze.py"
      }
    },
    "premiere": {
      "command": "node",
      "args": ["E:/作业1/premiere-mcp/dist/index.js"]
    }
  }
}
```

## Boundary

- `audio-beat-mcp` owns analysis, planning, and command generation
- `premiere-mcp` owns actual marker creation, keyframe writes, and interpolation updates
- To affect a real timeline, feed `generate_pr_commands` output into `premiere-mcp`
