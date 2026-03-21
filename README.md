# Premiere MCP 剪辑助手（premiere-ai-agent）

[![CI](https://github.com/sylphiette269/premiere-ai-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/sylphiette269/premiere-ai-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

英文说明可见 [README.en.md](./README.en.md)。

`Premiere MCP 剪辑助手` 不是泛泛的“通用视频自动化”项目。

它真正要做的是：

**让 `Claude Code`、`Codex` 或 `OpenClaw` 通过 MCP 工具读取和操控 Adobe Premiere Pro，结合 Word 文档、参考视频、提示词和本地素材目录，辅助完成视频剪辑，当前更适合粗剪与初版装配。**

## 项目特点

这个仓库的设计重点很明确：

- 目标环境改成了 **优先面向 Windows**
- 客户端重点改成了 **Claude Code / Codex / OpenClaw**
- 工作流重点改成了 **视频粗剪**，不是泛化的 Premiere 全能自动化
- 额外加了 `audio-beat-mcp`、`video-research-mcp` 和顶层工作流编排层
- 输入方式围绕 **Word 文档、参考视频、提示词、本地素材目录** 四类信息组织
- 可选配合 [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)，让 AI 在只有提示词时也能先去抖音或哔哩哔哩搜索 2 到 3 个参考视频，再回填更稳的粗剪计划

## 当前状态

当前仓库公开可用的基线是：

- Windows
- Node.js 18+
- Adobe Premiere Pro + CEP 面板
- 根仓 `npm run build` / `npm test`
- GitHub Actions CI

当前定位也很明确：

- 适合做粗剪、初版装配、节奏规划、素材筛选
- 不适合直接承诺无人值守最终成片

相关入口：

- 快速开始见 [QUICKSTART.md](./QUICKSTART.md)
- 已知限制见 [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- 项目 skills 说明见 [SKILLS.md](./SKILLS.md)
- 版本记录见 [CHANGELOG.md](./CHANGELOG.md)
- GitHub Release 模板见 [`.github/RELEASE_TEMPLATE.md`](./.github/RELEASE_TEMPLATE.md)

## 你能用它做什么

- 根据 Word 文档里的剪辑需求和剪辑说明，辅助完成 Premiere 粗剪
- 根据参考视频分析风格、节奏和结构，再辅助生成粗剪结果
- 根据提示词规划镜头、节奏和时间线粗剪
- 结合本地素材文件夹，扫描素材、规划镜头、生成粗剪步骤，并驱动 Premiere 执行

## 这个项目不是什么

- 全自动一键成片系统
- 稳定可靠的精剪系统
- 不需要人工检查的最终交付工具

## 你应该怎么用

你在 `Claude Code`、`Codex` 或 `OpenClaw` 里接入这个仓库提供的 MCP 服务后，给 AI 提供以下信息：

1. **素材文件夹目录**
2. 下面三种输入里的任意一种：
   - Word 文档：写明视频需求、镜头安排、剪辑说明
   - 参考视频：把参考视频路径或文件交给 AI，让它先分析风格再做粗剪
   - 提示词：直接描述要做什么视频，最好把效果和要求说清楚

如果你同时接入了 [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)，那么在“只有提示词、还没找参考视频”的情况下，AI 可以先去抖音或哔哩哔哩搜索 2 到 3 个参考视频，提炼节奏、结构和风格方向，再回到本项目生成更好的粗剪计划。

注意：

**素材文件夹目录是必须给的。**

如果不给素材目录，AI 不知道本地有哪些可用素材，也无法安全地扫描、规划和导入。这个项目的典型工作流就是先扫描素材文件夹，再决定怎么装配时间线。

## 支持的工作方式

### 1. Word 文档驱动

适合你已经把视频需求写清楚的情况。

- 你给 AI 一个 `.docx` 文件
- 文档里可以写镜头顺序、节奏、字幕、转场、重点内容
- AI 先读文档，再结合素材目录生成装配计划，会询问你确定好计划后执行
- 最后通过 MCP 调用 Premiere 做粗剪

### 2. 参考视频驱动

适合你想让 AI 模仿一个视频的大致风格和节奏。

- 你给 AI 一个参考视频路径，或者直接把参考视频文件交给 AI 分析
- AI 先分析参考视频，提取蓝图或结构特征
- 再结合你的素材目录做匹配和粗剪规划
- 最后驱动 Premiere 执行

### 3. 提示词驱动

适合你只有一句自然语言需求的情况。

例如：

- “做一个 15 秒产品视频粗剪”
- “按抖音快节奏方式做一个开箱粗剪”
- “根据这批素材做一个带节拍感的竖屏粗剪”

如果同时接入了 `chrome-devtools-mcp`，这一类工作方式会更强：

- 你只给一句提示词
- AI 先去抖音 / 哔哩哔哩搜索 2 到 3 个参考视频
- 再提炼这些参考视频的节奏、镜头组织和结构套路
- 最后回到本项目生成更接近目标风格的粗剪计划

### 4. 浏览器参考检索增强（可选）

这不是本项目的硬依赖，但它和 [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) 配合时，会明显放大这个项目的作用。

更适合公开说明的写法是：

> `Premiere MCP 剪辑助手` 可选配合 `chrome-devtools-mcp` 使用。在只提供提示词的情况下，AI 可以先自行搜索 2 到 3 个抖音或哔哩哔哩参考视频，提炼节奏和结构特征，再结合本地素材目录生成更合适的 Premiere 粗剪计划。

## 实际操作步骤

下面这套流程，就是这个项目目前最适合公开展示和实际使用的方式。

### 第 1 步：在 Claude Code、Codex 或 OpenClaw 中接入 MCP

- 启动本仓库提供的 MCP 服务
- 在 `Claude Code`、`Codex` 或 `OpenClaw` 中连接这个 MCP
- 确认 AI 已经能调用 Premiere 相关工具，而不是只会输出文字建议

### 第 2 步：告诉 AI 本地素材文件夹目录

- 明确告诉 AI 你的素材目录路径
- 素材目录里可以包含视频、图片、音频、字幕草稿等内容
- 如果需要，也可以先生成或提供素材清单

示例：

```text
素材目录在 D:/projects/product-video/assets
请先扫描这个目录里的素材，再开始做粗剪规划
```

### 第 3 步：给 AI 剪辑输入

你可以用下面三种输入方式里的任意一种：

- Word 文档：适合已经整理好镜头说明、节奏、字幕和结构要求
- 参考视频：适合希望 AI 参考某个视频的节奏、风格和结构
- 提示词：适合快速说明“我要做一个什么样的视频”

示例：

```text
按这个 Word 文档里的说明做一版粗剪
参考这个视频的节奏做一版 15 秒产品视频
根据这批素材做一个偏快节奏的竖屏开箱粗剪
```

如果你同时接了 `chrome-devtools-mcp`，也可以直接这样说：

```text
素材目录在 D:/projects/snacks/assets
请先去抖音和哔哩哔哩各找 2 到 3 个同类产品短视频参考，筛出最适合这批素材的节奏和结构，
再给我一版粗剪计划，确认后再驱动 Premiere 执行。
```

### 第 4 步：让 AI 先规划，再执行 Premiere 粗剪

- 先让 AI 扫描素材并生成粗剪计划
- 再让 AI 调用 MCP 工具操控 Premiere Pro
- 让它把素材放入时间线、做镜头装配、处理基础节奏和初版粗剪

建议的指令方式：

```text
先扫描素材目录并给出粗剪计划，确认后再开始调用 Premiere 执行
```

### 第 5 步：人工复核结果并继续精修

- 检查镜头顺序是否正确
- 检查节奏是否符合预期
- 检查字幕、转场、关键帧和特效是否需要手工调整
- 在 Premiere Pro 中继续做人工精修

这个项目当前最适合承担的是：

- 粗剪
- 初版装配
- 节奏起草
- 可检查的第一版时间线

而不是直接替代人工完成最终精剪交付。

## 按客户端接入

下面这些命令和路径都是当前仓库真实可用的版本。

### 1. 先准备本仓库

在仓库根目录执行：

```bash
npm install
npm run build
npm test
```

然后安装 Premiere CEP 面板：

```bash
cd packages/premiere-mcp
npm run install:cep
```

### 2. 在 Premiere 里启动桥接面板

1. 打开 Premiere Pro，并打开一个项目
2. 打开 `Window > Extensions > PR MCP`
3. 确认桥接目录是 `C:/pr-mcp-cmd`
4. 点击 `保存桥接目录`
5. 点击 `启动桥接`
6. 点击 `测试连接`

Node 侧和 CEP 面板侧必须指向同一个桥接目录，否则 MCP 能看到工具，但实际调用会失败。

### 3. 接入 Codex

先确保 MCP server 的入口已经构建出来：

```text
packages/premiere-mcp/dist/index.js
```

然后可以按类似下面的方式注册：

```bash
codex mcp add premiere_pro --env PREMIERE_TEMP_DIR=C:/pr-mcp-cmd -- node D:/path/to/premiere-ai-agent/packages/premiere-mcp/dist/index.js
```

### 4. 接入 Claude Code

在 Claude Code 的 MCP 配置里，核心就是这两个值：

```text
command: node D:/path/to/premiere-ai-agent/packages/premiere-mcp/dist/index.js
env: PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

### 5. 接入 OpenClaw

在 OpenClaw 里，本质上也是同一套 MCP 接法：

```text
command: node D:/path/to/premiere-ai-agent/packages/premiere-mcp/dist/index.js
env: PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

说明：

- 入口仍然指向 `packages/premiere-mcp/dist/index.js`
- bridge 目录仍然要和 Premiere 面板保持一致
- OpenClaw 改完 MCP 配置后，同样要重启客户端
- Premiere 里的 `PR MCP` 面板也要保持启动

### 6. 其他 MCP 客户端

其他 MCP 客户端也一样：

- 命令指向 `packages/premiere-mcp/dist/index.js`
- 环境变量指向 `PREMIERE_TEMP_DIR=C:/pr-mcp-cmd`
- 客户端改完配置后要重启
- Premiere 里的 `PR MCP` 面板也要保持启动


## 典型使用流程

```text
Claude Code / Codex / OpenClaw
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

- 还不能把它当成“AI 自动生成关键帧动画”或“自动拉曲线 / 调缓动”的可靠工具
- 关键帧相关能力目前更适合给出手工调整建议，而不是直接完成精细运动动画
- 转场自动生成和插入目前成功率已经比较高，显式指定转场时通常更稳
- 特效本身多数情况下可以自动挂载，但特效参数写入仍可能出现异常、漂移或结果不自然
- 最终结果仍然需要人工在 Premiere Pro 里复核和继续调整

所以它更适合：

- 粗剪
- 初版装配
- 节奏规划
- 素材筛选与时间线起草

而不是：

- 精细动画
- 稳定批量特效参数精调
- 无人值守最终成片

## 仓库结构

```text
repo-root/
├── agent/                  # 顶层工作流编排、计划、记忆、报告
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
- 已有顶层工作流编排入口
- 已包含项目本地 skills，目录在 `.codex/skills/`
- 当前主目标是把“可检查的粗剪闭环”做稳

## 协作与安全

- 贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全问题见 [SECURITY.md](./SECURITY.md)
- 快速开始见 [QUICKSTART.md](./QUICKSTART.md)
- 已知限制见 [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- 项目 skills 说明见 [SKILLS.md](./SKILLS.md)

## 致谢与说明

这个项目在早期梳理 bridge 和 MCP 接入链路时，参考过
[`Adobe_Premiere_Pro_MCP`](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP)
中的部分思路与实现。

很感谢原作者愿意把这部分工作公开出来。对我来说，这不只是一个可查看的仓库，更像是一份很有帮助的起点，让我在理解 Premiere 与 MCP 的连接方式时少走了一些弯路。

在这些启发的基础上，我再结合自己的使用目标，把当前仓库逐步整理成现在这套更偏向视频粗剪协作的工作流，包括 Word 文档、参考视频、提示词、本地素材目录，以及面向 Claude Code / Codex / OpenClaw 的使用方式。
