# Premiere MCP 剪辑助手 - Premiere 执行层

`premiere-mcp` 是 `Premiere MCP 剪辑助手` monorepo 里的 Premiere 执行层。

它负责把 `Claude Code`、`Codex`、`OpenClaw` 或其他 MCP 客户端发来的剪辑指令，通过 bridge 和 CEP 面板真正落到 Adobe Premiere Pro 里。

## 这个包负责什么

- 暴露 Premiere 相关 MCP 工具、资源和提示词
- 负责 Node 侧 bridge 协议
- 负责 CEP 面板安装和 bridge 目录写入
- 负责把高层装配计划真正执行到 Premiere 时间线

## 这个包不负责什么

- 不负责顶层工作流编排
- 不负责参考视频研究
- 不负责音频节拍分析

这些能力分别由根仓 `agent/` 目录、`packages/video-research-mcp/`、`packages/audio-beat-mcp/` 负责。

## 适合接入的客户端

- `Claude Code`
- `Codex`
- `OpenClaw`
- 其他兼容 MCP 的客户端

## 快速开始

```bash
npm install
npm run build
npm run install:cep
```

然后把 `dist/index.js` 注册到你的 MCP 客户端，并把：

```text
PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

和 Premiere 面板里的 bridge 目录保持一致。

## 典型链路

```text
MCP 客户端
  -> premiere-mcp
  -> bridge 目录
  -> CEP 面板
  -> Adobe Premiere Pro
```

## 主要能力

- 项目与素材管理
- 序列与时间线操作
- 关键帧相关工具
- 效果、音频和导出
- 文档驱动装配计划
- 参考视频驱动装配计划
- 自然语言驱动装配计划

## 环境变量

- `PREMIERE_TEMP_DIR`
- `PREMIERE_MCP_COMMAND_FILE`
- `PREMIERE_MCP_RESULT_FILE`

推荐优先使用 `PREMIERE_TEMP_DIR`。

## 常用命令

```bash
npm run build
npm test
npm run install:cep
npm run scan:media -- --input "D:/素材目录" --output "docs/media.md" --json "docs/media.json"
npm run plan:edit -- --docx "D:/brief/需求.docx" --media-json "docs/media.json" --output "docs/plan.md"
npm run review:edit -- --docx "D:/brief/需求.docx" --media-json "docs/media.json" --output "docs/review.md"
```

## 当前边界

- 这层更适合做粗剪与初版装配，不适合直接承诺无人值守最终成片
- 高层关键帧能力仍以辅助和人工调整为主
- bridge 与 CEP 面板目录必须一致，否则客户端能看到工具但无法真正执行

## 说明

这个包当前对外应当理解成 `Premiere MCP 剪辑助手` monorepo 里的 Premiere 执行层，而不是一个独立的泛化视频自动化仓库。
