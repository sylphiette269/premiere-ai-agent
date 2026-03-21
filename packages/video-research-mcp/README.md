# video-research-mcp

`video-research-mcp` 是 `Premiere MCP 剪辑助手` monorepo 里的参考视频研究层。
它通常由 `premiere-mcp` 间接消费，也能跟 `Claude Code`、`Codex`、`OpenClaw` 的研究链路配合使用。

它的目标不是直接控制 Premiere，而是把参考视频研究过程收敛成稳定的
`blueprint.json`，供后续剪辑层消费。

## 当前工作流

1. 通过公开搜索页拿到候选参考链接
2. 由用户确认需要研究的参考视频
3. 导入本地参考素材
4. 提取节奏、字幕、CTA 等结构化信号
5. 聚合成 `blueprint.json`

## Tools

- `search_reference_candidates`
  通过公开搜索结果收集候选参考链接
- `rank_reference_candidates`
  根据目标风格和平台偏好给候选结果排序
- `confirm_reference_set`
  固化选中的参考视频并创建 task 目录
- `ingest_reference_assets`
  把本地参考视频复制到托管 `raw/` 目录
- `extract_reference_signals`
  提取节奏、字幕、CTA 等结构化信号
- `aggregate_style_blueprint`
  聚合 `signals.json`，输出 `blueprint.json`

## 缓存结构

任务目录默认写到：

```text
./research-cache/<taskId>/
  candidates.json
  assets.json
  signals.json
  blueprint.json
  raw/
  derived/
```

规则：

- 用户原始素材不会被删除
- `raw/` 内的托管副本在 `cleanupManagedRawCopies=true` 时会被删除
- 长期保留的是 `candidates.json`、`signals.json`、`blueprint.json` 和衍生分析结果

## 本地运行

在 monorepo 根目录：

```bash
npm install
npm run build --workspace packages/video-research-mcp
npm run test --workspace packages/video-research-mcp
```

如果单独进入包目录：

```bash
cd packages/video-research-mcp
npm install
npm run build
npm test
node dist/index.js
```

## 推荐链路

1. `search_reference_candidates`
2. `rank_reference_candidates`
3. `confirm_reference_set`
4. `ingest_reference_assets`
5. `extract_reference_signals`
6. `aggregate_style_blueprint`
7. 把产出的 `blueprint.json` 路径交给 `premiere-mcp` 或根仓 `agent/` 工作流目录

## 限制

- 搜索目前依赖 Bing HTML 结果结构
- 信号提取目前优先依赖本地 `ffprobe`
- 当前版本优先解决 “本地参考视频 -> 蓝图 -> 剪辑层消费” 这条闭环
