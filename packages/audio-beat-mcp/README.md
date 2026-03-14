# audio-beat-mcp

`audio-beat-mcp` 是 `Premiere--agent` monorepo 里的音频节拍控制层。

它只负责三件事：

1. 分析音频里的节拍、重拍和瞬态峰值
2. 把这些时间信号转成 Premiere 友好的剪辑计划
3. 为外部 `premiere-mcp` 生成工具调用参数

它**不直接控制 Premiere Pro**。真正的时间线写入仍由 `packages/premiere-mcp/` 执行。

## 架构

```text
AI client / agent
  -> audio-beat-mcp
     -> ../premiere-mcp/python/analyze.py
     -> beat data / edit plan / Premiere tool calls
  -> premiere-mcp
     -> Premiere Pro + CEP
```

## Tools

- `analyze_music_beats`
  读取本地音频，输出 `BPM`、`beatTimes`、`onsetTimes`、`energyPeaks`
- `plan_pr_editing`
  把节拍分析结果转成 marker 计划、切点和 scale pulse 动画建议
- `generate_pr_commands`
  把编辑计划翻译成 `premiere-mcp` 可直接消费的工具调用参数

## 依赖

默认会复用同仓里的 `packages/premiere-mcp/python/analyze.py`。

先安装那边的 Python 依赖：

```bash
cd packages/premiere-mcp
pip install -r python/requirements.txt
```

可选环境变量：

- `AUDIO_BEAT_MCP_PYTHON`
- `AUDIO_BEAT_MCP_ANALYZE_SCRIPT`

## 本地运行

在 monorepo 根目录：

```bash
npm install
npm run build --workspace packages/audio-beat-mcp
npm run test --workspace packages/audio-beat-mcp
```

如果单独进入包目录：

```bash
cd packages/audio-beat-mcp
npm install
npm run build
npm test
node dist/index.js
```

## 边界

- `audio-beat-mcp` 负责分析、规划和命令生成
- `premiere-mcp` 负责真正的 marker、keyframe 和插值写入
- 要影响真实时间线，必须把输出继续交给 `premiere-mcp`
