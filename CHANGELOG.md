# 变更日志

这个文件用于记录当前仓库面向公开发布的版本变化。

记录原则：

- 只记录对外真正有价值的变化
- 不把临时调试噪音写进版本说明
- 不把未验证结论写成既成事实

## v0.1.0 - 2026-03-22

当前公开整理版，重点把仓库收束成更适合 GitHub 对外展示和持续发布的状态。

### 本版概览

- 根仓 README 继续强化为中文优先的公开首页
- 新增版本日志
- 新增 GitHub Release 中文模板
- 公开附属文档进一步中文化
- 对外展示名统一为“Premiere MCP 剪辑助手”
- README 与 QUICKSTART 明确补入 OpenClaw 接入口径

### 当前仓库定位

- 这是一个面向 `Claude Code / Codex / OpenClaw` 的 Premiere Pro 粗剪 MCP 助手仓库
- 核心工作流围绕 Word 文档、参考视频、提示词和本地素材目录
- 适合做粗剪、初版装配、节奏规划和素材筛选
- 不适合直接承诺无人值守最终成片

### 公开发布整理项

- 补齐 `CHANGELOG.md`
- 补齐 `.github/RELEASE_TEMPLATE.md`
- 在 README 中增加发布资料入口
- 把 `CONTRIBUTING.md`、`SECURITY.md`、`package.json` 的公开说明改成中文优先

### 当前已知边界

- 最终精剪仍然需要人工复核
- 真实效果依赖本地 Premiere、CEP 面板与 MCP 环境一起工作
- 如果工作流涉及参考视频检索增强，还需要额外接入 `chrome-devtools-mcp`

### 后续建议

- 每次正式发布时，在这个文件顶部追加新版本
- 每次发 GitHub Release 时，优先复用 `.github/RELEASE_TEMPLATE.md`
