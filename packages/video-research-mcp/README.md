# video-research-mcp

`video-research-mcp` 是一个低风险的参考视频研究 MCP server。

它不依赖平台账号 Cookie，不自动抓取主站登录态，而是把工作流收敛成两段：

1. 公开网页搜索候选参考链接
2. 对你确认并提供的本地参考视频做导入、信号提取、蓝图聚合

当前目标是给 `premiere-mcp` 这类剪辑执行仓提供稳定的 `blueprint.json` 输入，而不是直接控制 Premiere。

## 当前工具

- `search_reference_candidates`
  - 通过 Bing 公开搜索抓取 B站 / 抖音候选链接
- `rank_reference_candidates`
  - 根据目标风格和平台偏好排序候选
- `confirm_reference_set`
  - 固化 1 到 5 条已确认参考并创建 task 目录
- `ingest_reference_assets`
  - 把本地参考视频拷贝到托管 `raw/` 目录
- `extract_reference_signals`
  - 提取节奏、字幕、CTA 等结构化信号
- `aggregate_style_blueprint`
  - 聚合 `signals.json`，输出 `blueprint.json`

## 缓存策略

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

关键规则：

- 用户原始视频不会被删除
- `raw/` 里的托管副本在 `extract_reference_signals(cleanupManagedRawCopies=true)` 后会立即删除
- 长期保留的是 `candidates.json`、`signals.json`、`blueprint.json` 和派生字幕 JSON

## 本地运行

```bash
npm install
npm test
npm run build
node dist/index.js
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "video-research": {
      "command": "node",
      "args": ["E:/作业1/video-research-mcp/dist/index.js"],
      "env": {
        "VIDEO_RESEARCH_CACHE_DIR": "E:/作业1/video-research-mcp/research-cache"
      }
    }
  }
}
```

## 推荐工作流

1. `search_reference_candidates`
2. `rank_reference_candidates`
3. `confirm_reference_set`
4. `ingest_reference_assets`
5. `extract_reference_signals`
6. `aggregate_style_blueprint`
7. 把生成的 `blueprint.json` 路径交给 `premiere-mcp` 的后续装配链

## 当前限制

- 公开搜索依赖 Bing HTML 结果结构，后续可能需要扩展其他公开搜索 provider
- 自动视频信号提取目前优先依赖本地 `ffprobe`
- 第一版更偏 MVP：重点是把“本地参考视频 -> 蓝图 -> 删除 raw 缓存”跑通
