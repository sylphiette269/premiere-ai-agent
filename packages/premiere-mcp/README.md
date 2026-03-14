# Premiere MCP for Premiere Pro + CEP

`premiere-mcp` 现在是 `video-agent` monorepo 里的 Premiere 执行包，包含 MCP server、CEP 面板、bridge 协议、测试和安装脚本。

> **English summary**: `premiere-mcp` is an MCP server that connects AI assistants (Claude, Cursor, etc.) to Adobe Premiere Pro via a CEP bridge. It exposes 128 tools, 13 resources, and 11 prompts for timeline editing, effects, color correction, keyframe animation, subtitle generation, and high-level assembly workflows. Requires Node ≥ 18, Adobe Premiere Pro with CEP enabled, and Windows.
>
> **Quick start**: `npm install && npm run build && npm run install:cep` — then add the server to your MCP client config pointing to `dist/index.js` with env var `PREMIERE_TEMP_DIR` set to the bridge directory.

## 当前能力面

- MCP tools: `128`
- MCP resources: `13`
- MCP prompts: `11`

## 当前状态

当前包已经并入 monorepo，当前验证基线是：

- Windows
- Adobe Premiere Pro with CEP enabled
- Node.js 18+
- `npm test`
- `npm run build`

代表性工具分组：

- 项目与媒体：`create_project`、`open_project`、`import_media`、`import_folder`
- 序列与时间线：`create_sequence`、`add_to_timeline`、`trim_clip`、`split_clip`
- 关键帧：`add_keyframe`、`set_keyframe_interpolation`、`get_keyframes`
- 效果与音频：`apply_effect`、`color_correct`、`adjust_audio_levels`
- 转场诊断：`inspect_transition_boundary`、`inspect_track_transition_boundaries`
- 转场安全执行：`safe_batch_add_transitions`
- 标记与导出：`add_marker`、`export_frame`、`export_sequence`
- 组合型工作流：`build_motion_graphics_demo`、`assemble_product_spot`、`build_brand_spot_from_mogrt_and_assets`
- 审查与计划：`review_edit_reasonability`、`plan_edit_assembly`、`parse_edit_request`、`plan_edit_from_request`
- 参考视频：`analyze_reference_video`、`plan_replication_from_video`、`compare_to_reference_video`
- Agent 自描述：resource `premiere://mcp/agent-guide`、prompt `operate_premiere_mcp`

## 工程规范

项目规范现在统一落在 [`docs/PROJECT-STANDARDS.md`](docs/PROJECT-STANDARDS.md)，核心要求是：

- 当前包目录是 `packages/premiere-mcp/`
- tools / resources / prompts 数量以代码或测试结果为准
- 文档说明和代码格式一起维护，不再只靠口头约定
- Git 换行与文本归一化由 `.gitattributes` 约束
- 只整理本次触达文件，不在脏工作区上做全仓大重排
- Git 提交只包含本次修改，便于回退

## 架构

```text
MCP client
  -> stdio
packages/premiere-mcp/src/index.ts
  -> bridge directory
PREMIERE_TEMP_DIR or dirname(PREMIERE_MCP_COMMAND_FILE)
  -> CEP panel
packages/premiere-mcp/cep-panel/
  -> CSInterface.evalScript()
Premiere Pro + CEP
```

## 桥接协议

桥接目录默认是 `C:/pr-mcp-cmd`，CEP 侧可通过 [`bridge-config.js`](cep-panel/js/bridge-config.js) 覆盖。

支持两套文件协议：

- `per-request`：`command-{id}.json` / `response-{id}.json`
- `legacy`：`cmd.json` / `result.json`

CEP 面板同时兼容两类命令格式：

1. 旧的 action envelope

```json
{
  "id": "demo-id",
  "action": "get_project_info",
  "params": {}
}
```

2. raw script envelope

```json
{
  "id": "demo-id",
  "script": "(function(){return JSON.stringify({ok:true});})()",
  "timestamp": "2026-03-08T12:00:00.000Z",
  "timeoutMs": 1000,
  "expiresAt": "2026-03-08T12:01:00.000Z"
}
```

如果 raw script 命令已过期，CEP 面板会直接写回：

```json
{
  "ok": false,
  "error": "command_expired",
  "expired": true,
  "id": "demo-id"
}
```

## 环境变量

优先使用：

- `PREMIERE_TEMP_DIR`

兼容旧安装流：

- `PREMIERE_MCP_COMMAND_FILE`
- `PREMIERE_MCP_RESULT_FILE`

说明：

- `src/bridge/index.ts` 会优先读取 `PREMIERE_TEMP_DIR`
- 如果未设置，会回退到 `dirname(PREMIERE_MCP_COMMAND_FILE)`
- Node 侧与 CEP 侧必须指向同一个桥接目录，否则请求和响应会落在不同位置

## 安装

```bash
npm install
npm run build
```

本地开发直接运行：

```bash
node --import tsx src/index.ts
```

安装 CEP 扩展：

```bash
npm run install:cep
```

常见变体：

```bash
npm run install:cep -- --bridge-dir D:/custom-bridge
npm run install:cep -- --extensions-dir "C:/Users/<you>/AppData/Roaming/Adobe/CEP/extensions"
npm run install:cep -- --help
```

恢复 Windows CEP bridge：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\recover-windows-cep-bridge.ps1 -TempDir C:\pr-mcp-cmd
```

把图文 `.docx` 教程转换成 AI 可读 Markdown：

```bash
npm run convert:docx -- --input "/path/to/guide.docx" --output "docs/word-guides/guide.md"
```

把素材文件夹扫描成 AI 可读的 reference-only 清单：

```bash
npm run scan:media -- --input "/path/to/media-folder" --output "docs/media-manifests/media.md" --json "docs/media-manifests/media.json"
```

根据 DOCX 教程、素材清单和候选剪辑参数生成合理性审查报告：

```bash
npm run review:edit -- --docx "/path/to/guide.docx" --media-json "docs/media-manifests/media.json" --output "docs/reviews/guide-review.md" --asset "/path/to/shot01.mp4" --asset "/path/to/still01.jpg" --transition-name "Cross Dissolve" --transition-policy explicit --clip-duration 4 --motion-style alternate
```

根据 DOCX 教程和素材清单自动生成可检查的装配计划：

```bash
npm run plan:edit -- --docx "/path/to/guide.docx" --media-json "docs/media-manifests/media.json" --output "docs/plans/guide-plan.md"
```

对音频做节拍分析：

```bash
node --import tsx scripts/analyze-audio-track.mjs --input "/path/to/audio.wav" --output "tmp/analysis.json"
```

根据节拍分析和素材列表生成卡点计划：

```bash
node --import tsx scripts/plan-beat-sync.mjs --analysis-json "tmp/analysis.json" --clips-json "tmp/clips.json" --output "tmp/plan.json"
```

把音频分析和卡点规划串成一次 dry-run 工作流：

```bash
node --import tsx scripts/run-beat-sync-workflow.mjs --audio-input "/path/to/audio.wav" --clips-json "tmp/clips.json" --output "tmp/workflow.json" --dry-run
```

推荐顺序：

1. `npm run convert:docx` 把 Word 图文教程变成 Markdown
2. `npm run scan:media` 把素材目录变成 reference-only 清单
3. `npm run plan:edit` 先把 DOCX 教程和素材清单变成可检查的装配计划
4. 必要时用 `npm run review:edit` 对调整后的候选素材和转场再做一次审查
5. 让 AI 读取 Markdown 教程、素材清单、装配计划和审查报告，再调用 MCP

三路入口现在分别是：

1. `DOCX -> Markdown/plan/review -> assembly`
2. `reference video -> analyze_reference_video -> plan_replication_from_video -> assemble_product_spot(referenceBlueprintPath=...)`
3. `natural language prompt -> parse_edit_request -> plan_edit_from_request -> assemble_product_spot(naturalLanguagePrompt=...)`

## Acknowledgements / 说明

This project was independently developed for its initial feature set and workflow goals.
During later debugging and integration work, parts of
[`Adobe_Premiere_Pro_MCP`](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP)
were referenced to compare bridge behavior, MCP integration details, and recovery patterns.
The current repository has since evolved with its own runtime structure, tool organization,
CEP integration flow, and project-specific extensions.

这个项目在前期功能实现和整体工作流目标上主要由我独立开发完成。
在后期处理 bridge、集成和部分实现瓶颈时，我参考了
[`Adobe_Premiere_Pro_MCP`](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP)
中的部分实现，用于对比桥接行为、MCP 集成细节和恢复流程。
当前仓库已经结合自己的需求持续重构和扩展，形成了独立演进的运行时结构、工具组织方式、
CEP 集成流程和项目内能力。

## 验证

```bash
npm test
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

清理工作区临时文件和验证导出帧：

```bash
npm run cleanup:tmp -- --root "/path/to/project" --temp-root "%TEMP%" --bridge-dir "C:/pr-mcp-cmd"
```

说明：

- `cleanup:tmp` 现在除了删除工作区 `tmp_*` 外，还会清理 `premiere-fade-verify-*`、`fade_check/`、`_premiere_out/fade_check/`
- 这些验证导出图是一次性检查产物，不应继续作为正式素材留在 Premiere 项目里

测试结构：

- `test/`：Node test runner，覆盖 CEP 面板脚本、安装脚本、stdio surface
- `src/__tests__/`：Jest，覆盖 migrated bridge/tools/resources/prompts

## 仓库内本地 Skills

这些 skills 现在位于 monorepo 根目录 `.codex/skills/`，不依赖全局目录：

- `premiere-reference-migration`
- `premiere-bridge-verification`
- `premiere-doc-sync`
- `premiere-docx-visual-ingest`
- `premiere-docx-markdown-normalization`
- `premiere-reference-only-media`
- `premiere-transition-mapping`
- `premiere-skill-first-iteration`
- `premiere-edit-reasonability-review`
- `premiere-assembly-planning`
- `premiere-guide-effect-planning`
- `premiere-keyframe-language-mapping`
- `premiere-timeline-conformance-review`
- `premiere-reference-video-replication`
- `premiere-natural-language-edit-planning`

它们分别用于：

- 历史能力收敛与结构迁移
- bridge 目录与协议验证
- README / roadmap / vision / skills 文档同步
- Word 图文教程提取
- DOCX 到 Markdown 的中间层规范
- 素材目录扫描与 reference-only 导入约束
- 文档转场语义与高层 workflow 映射
- 复杂问题先写项目级 skill 再改 MCP
- 自动时间线的合理性审查
- 关键帧自然语言到执行链映射
- 从 DOCX + 素材清单生成可执行的装配计划
- 把文档中的效果名和复制逻辑沉淀成 `effectPlan`
- 自动装配后对主视频轨做 clip 数量、顺序和连续性复核
- 本地参考视频分析、素材匹配和装配后比对
- 直接需求到确定性装配参数的解析与规划

## 条件与限制

- 当前目标环境是 Windows + Premiere Pro（CEP 可用），不限定具体版本号
- 当前能力面已经收敛到这一套运行时里，但真实执行仍依赖 Premiere 脚本 API 和 CEP 面板
- `import_media` 与高层素材装配工作流现在默认 `reference-only`，会返回 `copied: false` 或 `copyOperations: 0`
- `assemble_product_spot` 与 `build_brand_spot_from_mogrt_and_assets` 现在只有在显式提供 `transitionName` 时才会加素材转场；未指定时不会自动回退到 `Cross Dissolve`
- DOCX 转出的 Markdown 现在会额外写出“转场执行建议”，把关键帧缓动和素材转场分开
- `npm run review:edit` 会在高层装配前检查素材类别、transition mismatch、`Cross Dissolve` 误用、reference-only 失配和未解析视觉步骤
- `npm run plan:edit` 与 MCP tool `plan_edit_assembly` 会先生成 deterministic 的 `assetPaths`、`clipDuration`、`motionStyle`、`transitionName` 候选，不再要求每次都手填高层装配顺序
- `plan_edit_assembly` 现在还会返回 `effectPlan`，把文档中的 `globalClipEffects` 和 `optionalClipEffects` 显式写进装配计划
- MCP 现在也直接暴露 `review_edit_reasonability`，AI 可以不绕外部脚本，直接在调用高层装配前做审查
- MCP 现在也直接暴露 `plan_edit_assembly`，AI 可以不绕外部脚本，直接从 `docxPath + mediaManifestPath` 生成装配计划
- MCP 现在也直接暴露 `analyze_reference_video`、`plan_replication_from_video`、`compare_to_reference_video`，可以把本地参考视频变成蓝图、匹配计划和装配后 QA
- MCP 现在也直接暴露 `parse_edit_request`、`plan_edit_from_request`，可以把直接需求变成确定性的装配默认值
- `assemble_product_spot` 与 `build_brand_spot_from_mogrt_and_assets` 现在支持 `reviewBeforeAssemble: true`；当预审结果为 `blocked`，或为 `needs-review` 且未显式允许 warnings 时，会直接拒绝装配
- `assemble_product_spot` 现在还支持 `autoPlanFromManifest: true`；当未传 `assetPaths` 且提供了 `docxPath + mediaManifestPath` 时，会先自动生成计划，再进入装配
- 当 `autoPlanFromManifest: true` 且显式传入 `applyGuideEffects: true` 时，高层装配会把 `effectPlan.globalClipEffects` 应用到自动规划出的素材上，并把失败结果并入 `assemblyReview`
- `plan_edit_assembly` 现在支持 `referenceBlueprintPath`、`matchStrategy` 和 `minMatchScore`；传入蓝图后会用参考视频匹配替代纯文件名顺序
- `build_motion_graphics_demo`、`assemble_product_spot`、`build_brand_spot_from_mogrt_and_assets` 现在支持 `referenceBlueprintPath` 或 `naturalLanguagePrompt`；两者同时传入时，蓝图优先
- `assemble_product_spot` 与 `build_brand_spot_from_mogrt_and_assets` 现在还会返回 `assemblyReview`；显式转场失败、请求的 MOGRT 失败、主视频轨和计划不一致，或参考视频比对未通过时，不再静默当成成功结果
- 当 `list_sequence_tracks` 回退到当前活动序列，或主轨检测到 `gap / overlap` 时，这些序列与连续性上下文也会进入 `assemblyReview.summary` 和 `assemblyReview.findings`
- 当 `referenceBlueprintPath` 存在时，`assemblyReview` 会额外带上 `videoQAReport`
- 包级与仓库级 `repository`、`homepage`、`bugs` 元数据已补齐，便于公开浏览和 issue 跳转
