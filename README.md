# Video Agent

`Video Agent` 是一个面向视频生产的 AI agent 系统仓库。

它把三个原本分散的能力层收口成一个可编排的 monorepo：

- `packages/premiere-mcp`: Premiere Pro MCP + CEP bridge，负责真正的剪辑执行
- `packages/audio-beat-mcp`: 音乐节拍分析与剪辑节奏规划
- `packages/video-research-mcp`: 参考视频研究、信号提取与风格蓝图聚合
- `agent/`: 顶层大脑，负责规划、调度、记忆、审查、交付报告
- `cli/`: 用户入口
- `scenarios/`: 最小闭环场景样例

**一句话定位**

> Turn a single sentence into a video editing workflow by orchestrating research, beat analysis, and Premiere execution.

## 快速开始

```bash
npm install
npm run build
npm test
npm run agent:dev -- "做一个 15 秒抖音风格产品视频"
```

如果要真正执行 Premiere 步骤，还需要：

- Windows
- Node.js 18+
- Adobe Premiere Pro
- CEP 已启用
- 已安装 `packages/premiere-mcp` 的 CEP 面板

## 仓库结构

```text
video-agent/
├── agent/                      # 统一入口、大脑、记忆、critic、reporter
├── cli/                        # 命令行入口
├── scenarios/                  # 最小闭环样例
├── packages/
│   ├── premiere-mcp/           # Premiere 工具层
│   ├── audio-beat-mcp/         # 音乐节拍工具层
│   └── video-research-mcp/     # 研究工具层
└── .github/workflows/ci.yml    # 仓库级 CI
```

## Agent 闭环

```text
用户目标
  -> gateway
  -> planner
  -> orchestrator
       -> video-research (可选)
       -> audio-beat (可选)
       -> premiere
       -> critic
  -> reporter
```

最小默认链路：

1. 根据用户目标判断场景
2. 选择蓝图来源
3. 可选地分析 BGM 节拍
4. 生成统一 `editing-blueprint.json`
5. 调用 `assemble_product_spot_closed_loop`
6. 调用 `critic_edit_result`
7. 输出结构化报告与恢复点

## 运行样例

```bash
npm run scenario:product
npm run scenario:music
npm run scenario:research
```

## 说明

- 顶层 `agent/` 当前优先解决“总装层”问题，直接复用三个包现有能力，不重复造轮子。
- 参考视频研究默认需要本地参考素材或已有 research task；没有这些输入时，会回退为 prompt-derived blueprint。
- 现在的第一目标是把仓库形态、入口和最小闭环搭好，再逐步强化更深的自主规划与恢复策略。
