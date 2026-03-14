# Quick Start

这里整理的是当前仓库真实可用的 Windows 快速开始流程。

## 适合谁

如果你想做的是下面这类事情，这个仓库就是对路的：

- 用 `Claude Code` 或 `Codex` 调用 MCP 工具操控 Premiere Pro
- 根据 Word 文档做视频粗剪
- 根据参考视频做风格、节奏和结构模仿
- 根据提示词和本地素材目录，让 AI 先规划，再执行 Premiere 粗剪
- 配合 [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)，让 AI 先去抖音 / 哔哩哔哩搜索 2 到 3 个参考视频，再生成更稳的粗剪计划

## 前置条件

- Windows
- Node.js 18+
- Adobe Premiere Pro
- 可用的 CEP 环境
- 一份本地素材目录
- 如果你想让 AI 自己去网页找参考视频，再额外接入 `chrome-devtools-mcp`

## 1. 安装依赖并构建

在仓库根目录执行：

```bash
npm install
npm run build
npm test
```

## 2. 安装 Premiere CEP 面板

进入 Premiere 执行包：

```bash
cd packages/premiere-mcp
npm run install:cep
```

如果你需要自定义桥接目录，也可以这样装：

```bash
npm run install:cep -- --bridge-dir D:/custom-bridge
```

默认桥接目录是：

```text
C:/pr-mcp-cmd
```

## 3. 在 Premiere 里启动桥接

1. 打开 Premiere Pro
2. 打开一个项目
3. 打开 `Window > Extensions > PR MCP`
4. 确认桥接目录是 `C:/pr-mcp-cmd`
5. 点击 `保存桥接目录`
6. 点击 `启动桥接`
7. 点击 `测试连接`

如果这里没启动成功，MCP 客户端即使看得到工具，也没法真正执行 Premiere 操作。

## 4. 接入 Codex

构建完成后，MCP server 入口在：

```text
packages/premiere-mcp/dist/index.js
```

可以按类似下面的方式注册：

```bash
codex mcp add premiere_pro --env PREMIERE_TEMP_DIR=C:/pr-mcp-cmd -- node D:/path/to/premiere-ai-agent/packages/premiere-mcp/dist/index.js
```

## 5. 接入 Claude Code

在 Claude Code 的 MCP 配置里，核心就是这两个值：

```text
command: node D:/path/to/premiere-ai-agent/packages/premiere-mcp/dist/index.js
env: PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

## 6. 告诉 AI 你要处理什么

使用前，至少给 AI 这两类输入：

1. 本地素材文件夹目录
2. 以下任意一种：
   - Word 文档
   - 参考视频
   - 提示词

素材目录是必须给的，不然 AI 无法安全扫描素材并规划时间线。

如果你还接了 `chrome-devtools-mcp`，那么在只有提示词时，AI 可以先去抖音或哔哩哔哩搜索 2 到 3 个参考视频，再回到本项目生成更好的粗剪计划。

示例：

```text
素材目录在 D:/projects/product-video/assets
请先扫描这个目录里的素材，再根据这个 Word 文档做一版粗剪
```

浏览器参考检索示例：

```text
素材目录在 D:/projects/product-video/assets
我只有一个目标：做一版适合抖音的 15 秒产品短视频。
请先去抖音和哔哩哔哩各找 2 到 3 个参考视频，提炼节奏、镜头组织和字幕密度，
再结合这批素材给我一版粗剪计划，确认后再执行 Premiere。
```

## 7. 推荐工作顺序

最稳的用法不是直接让 AI 上来就剪，而是按这个顺序来：

1. 扫描素材目录
2. 如果只有提示词且已接入浏览器 MCP，先搜索 2 到 3 个参考视频
3. 读取 Word 文档 / 参考视频 / 提示词
4. 先生成粗剪计划
5. 你确认计划
6. 再调用 Premiere MCP 真正执行
7. 人工复核结果并继续精修

## 8. 常用命令

根仓：

```bash
npm run build
npm test
npm run agent:dev -- "做一个 15 秒产品视频粗剪" --asset "D:/你的素材目录"
```

Premiere 执行包：

```bash
cd packages/premiere-mcp
npm run install:cep
npm run scan:media -- --input "D:/你的素材目录" --output "docs/media.md" --json "docs/media.json"
npm run plan:edit -- --docx "D:/brief/需求.docx" --media-json "docs/media.json" --output "docs/plan.md"
npm run review:edit -- --docx "D:/brief/需求.docx" --media-json "docs/media.json" --output "docs/review.md"
```

## 下一步

- 根仓首页说明见 [README.md](./README.md)
- 当前已知限制见 [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- 项目 skills 说明见 [SKILLS.md](./SKILLS.md)
- 如果你准备上传截图，建议放到 `docs/images/`
