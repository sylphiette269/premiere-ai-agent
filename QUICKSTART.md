# 快速开始

> 这是仓库的公开上手页，目标很简单：先把环境接通，再把 Premiere Pro、MCP 客户端和本地素材目录串起来。

## 这套东西适合谁

如果你的目标是下面这些，这个仓库就对路：

- 用 `Claude Code`、`Codex` 或 `OpenClaw` 调用 MCP 工具操作 Premiere Pro
- 根据 Word 文档做视频粗剪
- 根据参考视频做节奏、结构和镜头组织模仿
- 根据提示词和本地素材目录，先让 AI 出计划，再执行粗剪
- 需要时配合 [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) 先找参考视频，再进入剪辑流程

## 使用前提

- Windows
- Node.js 18+
- Adobe Premiere Pro
- 已启用的 CEP 环境
- 一份可访问的本地素材目录
- 如果要让 AI 自己找参考视频，再额外接入 `chrome-devtools-mcp`

## 先做这几步

1. 安装依赖并构建：

```bash
npm install
npm run build
npm test
```

2. 安装 Premiere CEP 面板：

```bash
cd packages/premiere-mcp
npm run install:cep
```

如果你想改桥接目录，可以这样装：

```bash
npm run install:cep -- --bridge-dir D:/custom-bridge
```

默认桥接目录是：

```text
C:/pr-mcp-cmd
```

3. 在 Premiere 里启动桥接：

1. 打开 Premiere Pro
2. 打开一个项目
3. 打开 `Window > Extensions > PR MCP`
4. 确认桥接目录是 `C:/pr-mcp-cmd`
5. 点击 `保存桥接目录`
6. 点击 `启动桥接`
7. 点击 `测试连接`

如果这一步没通，MCP 客户端即使能看到工具，也无法真正控制 Premiere。

## 接入客户端

构建完成后，MCP server 入口在：

```text
packages/premiere-mcp/dist/index.js
```

### Codex

```bash
codex mcp add premiere_pro --env PREMIERE_TEMP_DIR=C:/pr-mcp-cmd -- node D:/path/to/premiere-mcp-editor-cn/packages/premiere-mcp/dist/index.js
```

### Claude Code

```text
command: node D:/path/to/premiere-mcp-editor-cn/packages/premiere-mcp/dist/index.js
env: PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

### OpenClaw

```text
command: node D:/path/to/premiere-mcp-editor-cn/packages/premiere-mcp/dist/index.js
env: PREMIERE_TEMP_DIR=C:/pr-mcp-cmd
```

这三套接法本质上一样，只要命令路径和 `PREMIERE_TEMP_DIR` 一致，走的就是同一条执行链路。

## 推荐输入方式

使用前，最好同时给 AI 两类输入：

1. 本地素材目录
2. 以下任意一种：
   - Word 文档
   - 参考视频
   - 提示词

素材目录是必须项。没有它，AI 就没法安全扫描素材，也没法提前规划时间线。

示例：

```text
素材目录在 D:/projects/product-video/assets
请先扫描这个目录里的素材，再根据这个 Word 文档做一版粗剪
```

如果你还接了 `chrome-devtools-mcp`，可以进一步这样提：

```text
素材目录在 D:/projects/product-video/assets
我现在只有一个目标：做一版适合抖音的 15 秒产品短视频。
请先去抖音和哔哩哔哩各找 2 到 3 个参考视频，提炼节奏、镜头组织和字幕密度，
再结合这批素材给我一版粗剪计划，确认后再执行 Premiere。
```

## 推荐顺序

最稳的流程不是上来就剪，而是按这个顺序走：

1. 扫描素材目录
2. 如果只有提示词且已接入浏览器 MCP，先找 2 到 3 个参考视频
3. 读取 Word 文档、参考视频或提示词
4. 先生成粗剪计划
5. 你确认计划
6. 再调用 Premiere MCP 执行
7. 人工复核结果，再继续精修

## 常用命令

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

## 当前边界

- 这个仓库的目标是粗剪、初版装配和流程编排，不是直接承诺无人值守成片
- 最终精剪还是需要人工复核
- 如果要走“先找参考视频再剪”的路线，还需要额外接入 `chrome-devtools-mcp`

## 相关文档

- 根仓首页说明见 [README.md](./README.md)
- 当前已知限制见 [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- 项目 skills 说明见 [SKILLS.md](./SKILLS.md)
- 如果你准备上传截图，建议放到 `docs/images/`
