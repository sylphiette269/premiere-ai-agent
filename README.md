# Premiere MCP 剪辑助手 v0.1.0

[![CI](https://github.com/sylphiette269/premiere-mcp-editor-cn/actions/workflows/ci.yml/badge.svg)](https://github.com/sylphiette269/premiere-mcp-editor-cn/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

面向 `Claude Code`、`Codex` 和 `OpenClaw` 的 Premiere Pro MCP 剪辑助手，支持文档、参考视频、提示词和本地素材目录驱动的粗剪工作流。

> ⚠️ 版本说明：当前 `v0.1.0` 为首个公开整理版，已统一中文发布页、GitHub Release 模板、Issue / PR 模板和 `OpenClaw` 接入口径。当前更适合粗剪、初版装配和节奏规划，不承诺无人值守最终成片。

## 原理

```text
┌───────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│ Claude Code    │────▶│                      │────▶│                    │
│ Codex          │     │  premiere-mcp        │     │  Bridge 目录       │
│ OpenClaw       │◀────│  MCP 服务 + 协议层   │◀────│  C:/pr-mcp-cmd     │
└───────────────┘     └──────────────────────┘     └────────────────────┘
         ▲                                                   │
         │                                                   ▼
┌────────────────────┐                             ┌────────────────────┐
│ audio-beat-mcp     │                             │ PR MCP CEP 面板     │
│ video-research-mcp │                             │ Adobe Premiere Pro  │
└────────────────────┘                             └────────────────────┘
```

## 核心特性

- `Claude Code / Codex / OpenClaw` 接入兼容：同一套 `MCP` 服务入口，适合不同客户端复用。
- `Premiere Pro` 真执行链路：不是只给文本建议，而是通过 `bridge + CEP` 真正把规划写进时间线。
- `Word 文档驱动`：可把 `.docx` 剪辑说明转成装配计划，再进入 Premiere 执行。
- `参考视频驱动`：支持先提取参考视频节奏和结构，再回填到本地素材粗剪。
- `提示词驱动`：只有一句需求时，也能先规划镜头和节奏，再进入执行阶段。
- `浏览器参考检索增强`：可选配合 `chrome-devtools-mcp`，先去抖音或哔哩哔哩找参考，再生成更稳的粗剪方案。
- `音频节拍拆层`：`audio-beat-mcp` 负责节拍分析和节奏规划，不把所有逻辑都挤进一个包里。
- `参考视频研究拆层`：`video-research-mcp` 负责候选收集、信号提取和 `blueprint.json` 聚合。
- `中文优先发布面`：首页、快速开始、Issue / PR 模板、Release 模板都已统一成中文口径。
- `工作流先规划后执行`：默认更适合“先扫描素材 -> 先给计划 -> 人确认 -> 再执行”的可检查闭环。

## 快速开始

### 1. 安装依赖

在仓库根目录执行：

```bash
npm install
npm run build
npm test
```

### 2. 安装并启动 Premiere 桥接面板

```bash
cd packages/premiere-mcp
npm run install:cep
```

然后在 Premiere Pro 中：

1. 打开一个项目
2. 打开 `Window > Extensions > PR MCP`
3. 确认桥接目录是 `C:/pr-mcp-cmd`
4. 点击 `保存桥接目录`
5. 点击 `启动桥接`
6. 点击 `测试连接`

### 3. 接入 Claude Code / Codex / OpenClaw

构建完成后，`MCP` 入口在：

```text
packages/premiere-mcp/dist/index.js
```

`Codex` 示例：

```bash
codex mcp add premiere_pro --env PREMIERE_TEMP_DIR=C:/pr-mcp-cmd -- node D:/path/to/premiere-mcp-editor-cn/packages/premiere-mcp/dist/index.js
```

`Claude Code` / `OpenClaw` 核心配置：

```text
command: node D:/path/to/premiere-mcp-editor-cn/packages/premiere-mcp/dist/index.js
env: PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

### 4. 准备输入

使用前至少给 AI 两类输入：

1. 本地素材文件夹目录
2. 以下任意一种：
   - `Word` 文档
   - 参考视频
   - 提示词

示例：

```text
素材目录在 D:/projects/product-video/assets
请先扫描这个目录里的素材，再根据这份 Word 文档给我一版粗剪计划
```

### 5. 先规划，再执行

推荐工作顺序：

1. 扫描素材目录
2. 读取 `docx` / 参考视频 / 提示词
3. 先生成粗剪计划
4. 你确认计划
5. 再调用 Premiere MCP 真正执行
6. 人工复核结果并继续精修

## 主要配置项

| 配置项 | 说明 | 默认值 / 建议值 |
| --- | --- | --- |
| `packages/premiere-mcp/dist/index.js` | `MCP` 服务入口 | 构建后使用 |
| `PREMIERE_TEMP_DIR` | `bridge` 目录 | `C:/pr-mcp-cmd` |
| `PREMIERE_MCP_COMMAND_FILE` | 命令文件路径覆盖 | 可选，不配置时优先走 `PREMIERE_TEMP_DIR` |
| `PR MCP` 面板 | Premiere 内桥接面板 | 必须保持启动 |
| `chrome-devtools-mcp` | 浏览器参考检索增强 | 可选 |
| 素材目录 | 本地素材扫描入口 | 必填 |
| 输入方式 | `docx / 参考视频 / 提示词` | 至少一种 |

## 主要命令

根仓：

```bash
npm run build
npm test
npm run agent:dev -- "做一个 15 秒产品视频粗剪" --asset "D:/你的素材目录"
```

`packages/premiere-mcp`：

```bash
cd packages/premiere-mcp
npm run install:cep
npm run scan:media -- --input "D:/你的素材目录" --output "docs/media.md" --json "docs/media.json"
npm run plan:edit -- --docx "D:/brief/需求.docx" --media-json "docs/media.json" --output "docs/plan.md"
npm run review:edit -- --docx "D:/brief/需求.docx" --media-json "docs/media.json" --output "docs/review.md"
```

## 项目结构

```text
premiere-mcp-editor-cn/
├── agent/                     # 顶层工作流编排、计划、记忆、报告
├── cli/                       # 命令行入口
├── scenarios/                 # 最小闭环示例
├── packages/
│   ├── premiere-mcp/          # Premiere 执行层
│   ├── audio-beat-mcp/        # 音频节拍分析层
│   └── video-research-mcp/    # 参考视频研究与蓝图层
├── test/                      # 根仓测试入口
├── scripts/                   # 根仓脚本
├── QUICKSTART.md              # 快速开始
├── CHANGELOG.md               # 版本日志
└── .github/                   # CI、Issue、PR、Release 模板
```

## 技术架构

### 文档驱动链路

```text
Word 文档
  -> convert:docx
  -> plan:edit / review:edit
  -> premiere-mcp
  -> Premiere Pro
```

### 参考视频驱动链路

```text
参考视频 / 候选链接
  -> video-research-mcp
  -> blueprint.json
  -> premiere-mcp
  -> Premiere Pro
```

### 节拍驱动链路

```text
本地音频
  -> audio-beat-mcp
  -> 节拍规划 / 工具参数
  -> premiere-mcp
  -> Premiere Pro
```

### 执行设计

- 默认走“先规划、再确认、后执行”的流程
- `Premiere` 里的 `PR MCP` 面板与 Node 侧 `bridge` 目录必须一致
- 包级拆分以职责清晰为主，不追求所有能力堆到单点入口

## 工具格式

`Claude Code`、`Codex`、`OpenClaw` 发来的能力定义，最终都会通过 `premiere-mcp` 转成可执行的时间线操作。

对外理解时，可以把它概括成这条链：

```text
用户需求
  -> MCP 客户端
  -> premiere-mcp
  -> Bridge / CEP
  -> Premiere 时间线操作
```

在这个仓库里，最常见的输入来源有三类：

- 文档：`docx -> markdown -> 规划 -> 执行`
- 参考视频：`参考视频 -> blueprint -> 规划 -> 执行`
- 节拍数据：`音频 -> beat plan -> 工具参数 -> 执行`

## 环境变量

| 环境变量 | 说明 |
| --- | --- |
| `PREMIERE_TEMP_DIR` | 推荐的桥接目录配置 |
| `PREMIERE_MCP_COMMAND_FILE` | 命令文件路径覆盖 |
| `PREMIERE_MCP_RESULT_FILE` | 结果文件路径覆盖 |

## 执行边界与人工复核

- 这个项目默认不是“上来就剪”，而是“先扫描素材、先给计划、确认后执行”
- 当前更适合粗剪、初版装配、节奏规划和素材筛选
- 不适合直接承诺无人值守最终成片
- 高层关键帧、精细运动动画、复杂特效参数仍更适合人工精修
- 只要 Bridge 目录、CEP 面板或客户端配置不一致，就可能出现“工具可见但实际不执行”
- 最终结果仍应在 Premiere Pro 中人工复核镜头顺序、节奏、字幕、转场和特效

## 更新日志

- 当前版本：[`v0.1.0`](./CHANGELOG.md)
- 详细变更记录见：[CHANGELOG.md](./CHANGELOG.md)
- GitHub Release 文案模板见：[.github/RELEASE_TEMPLATE.md](./.github/RELEASE_TEMPLATE.md)

## 相关文档

- 快速开始：[QUICKSTART.md](./QUICKSTART.md)
- 已知限制：[KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- 版本记录：[CHANGELOG.md](./CHANGELOG.md)
- 项目技能：[SKILLS.md](./SKILLS.md)
- 协作说明：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全说明：[SECURITY.md](./SECURITY.md)

## 致谢

这个项目在早期梳理 `bridge` 和 `MCP` 接入链路时，参考过 [`Adobe_Premiere_Pro_MCP`](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP) 中的部分思路与实现。

后续这一套工作流已经按本仓库自己的运行形态、`CEP` 桥接、拆包结构和中文发布口径重新整理。

## 免责声明 / Disclaimer

本项目仅供学习、研究、剪辑流程实验和接口调试使用。

- 本项目并非 Adobe 官方项目
- 使用本项目前，请自行确认本地软件环境、协议兼容和相关服务条款
- 真实执行结果受本地 `Premiere`、素材质量、插件环境和客户端配置影响
- 因使用本项目导致的工程损失、账号限制或其他后果，由使用者自行承担

## License

本项目采用 [MIT License](./LICENSE)。
