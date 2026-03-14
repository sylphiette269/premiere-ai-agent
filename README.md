# Premiere Agent 首映代理

[![CI](https://github.com/sylphiette269/Premiere--agent/actions/workflows/ci.yml/badge.svg)](https://github.com/sylphiette269/Premiere--agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

英文说明可见 [README.en.md](./README.en.md)。

`Premiere Agent` 这个angent是为了自动化重复性剪辑工作而创造的：

**让 `Claude Code` 或 `Codex` 通过 MCP 工具读取和操控 Adobe Premiere Pro，辅助完成视频粗剪。**

它当前适合做的是：

- 根据 Word 文档里的剪辑需求和剪辑说明，辅助完成 Premiere 粗剪
- 根据参考视频分析风格、节奏和结构，再辅助生成粗剪结果
- 根据直接提示词做视频整体模仿粗剪
- 结合本地素材文件夹，扫描素材、规划镜头、生成粗剪步骤，并驱动 Premiere 执行

它当前**不能**被理解成：

- 全自动一键成片系统
- 稳定可靠的精剪系统
- 不需要人工检查的最终交付工具

## 你应该怎么用

你在 `Claude Code` 或 `Codex` 里接入这个仓库提供的 MCP 服务后，给 AI 提供以下信息：

1. **素材文件夹目录**
2. 下面三种输入里的任意一种：
   - Word 文档：写明视频需求、镜头安排、剪辑说明
   - 参考视频：上传参考视频给AI,让 AI 先分析风格再做粗剪
   - 提示词：直接描述要做什么视频,最好描述清楚所需要的效果和要求

注意：

**素材文件夹目录是必须给的。**

如果不给素材目录，AI 不知道本地有哪些可用素材，也无法安全地扫描、规划和导入，还有可能出现误扫描，ai会优先扫描文件夹。

## 支持的工作方式

### 1. Word 文档驱动

适合你已经把视频需求写清楚的情况。

- 你给 AI 一个 `.docx` 文件
- 文档里可以写镜头顺序、节奏、字幕、转场、重点内容
- AI 先读文档，再结合素材目录生成装配计划，会询问你确定好计划后执行
- 最后通过 MCP 调用 Premiere 做粗剪

### 2. 参考视频驱动

适合你想让 AI 模仿一个视频的大致风格和节奏。

- 你给 AI 一个参考视频路径或者上传参考视频给ai分析
- AI 先分析参考视频，提取蓝图或结构特征
- 再结合你的素材目录做匹配和粗剪规划
- 最后驱动 Premiere 执行

### 3. 提示词驱动

适合你只有一句自然语言需求的情况。

例如：

- “做一个 15 秒产品视频粗剪”
- “按抖音快节奏方式做一个开箱粗剪”
- “根据这批素材做一个带节拍感的竖屏粗剪”

## 典型使用流程

```text
Claude Code / Codex
  -> 连接本仓库提供的 MCP
  -> 告诉 AI 素材文件夹目录
  -> 提供 docx / 参考视频 / 提示词
  -> AI 扫描素材与生成计划
  -> AI 调用 Premiere MCP 工具
  -> Premiere Pro 内完成粗剪
  -> 人工复核与精修
```

## 命令示例

```bash
npm run agent:dev -- "做一个 15 秒产品视频粗剪" --asset "D:/你的素材目录"
npm run agent:dev -- "按 Word 文档做粗剪" --docx "D:/brief/需求.docx" --manifest "D:/你的素材目录/media.json"
npm run agent:dev -- "参考这个视频的节奏做粗剪" --editing-blueprint "D:/research/blueprint.json" --asset "D:/你的素材目录"
```

## 当前能力边界

这个项目目前定位很明确：

**AI 辅助完成 Premiere 粗剪，人来完成精修。**

当前还没有做稳的部分包括：

- 关键帧动画调整还不够稳定
- 转场插入仍依赖 Premiere 宿主行为和 QE DOM，不是所有转场都稳定
- 特效应用和特效参数写入在不同工程状态下仍可能失败或漂移
- 最终结果仍然需要人工在 Premiere Pro 里复核和继续调整

所以它更适合：

- 粗剪
- 初版装配
- 节奏规划
- 素材筛选与时间线起草

而不是：

- 精细动画
- 稳定批量特效处理
- 无人值守最终成片

## 仓库结构

```text
repo-root/
├── agent/                  # 顶层编排、计划、记忆、报告
├── cli/                    # 命令行入口
├── scenarios/              # 最小闭环示例
├── packages/
│   ├── premiere-mcp/       # Premiere 执行层
│   ├── audio-beat-mcp/     # 节拍分析层
│   └── video-research-mcp/ # 参考视频研究与蓝图层
└── .github/workflows/ci.yml
```

## 环境要求

- Windows
- Node.js 18+
- Adobe Premiere Pro
- 已启用 CEP
- 已安装 `packages/premiere-mcp` 提供的 CEP 面板

## 初始化

```bash
npm install
npm run build
npm test
```

## 仓库状态

- 根仓 `build` / `test` 命令已接通
- GitHub Actions CI 已配置，当前以最新 workflow 结果为准
- 已拆成 `premiere-mcp`、`audio-beat-mcp`、`video-research-mcp` 三层
- 已有顶层 agent 编排入口
- 当前主目标是把“可检查的粗剪闭环”做稳

## 协作与安全

- 贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全问题见 [SECURITY.md](./SECURITY.md)
