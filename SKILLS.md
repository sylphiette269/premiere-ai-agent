# 项目技能

这个仓库不是只靠 MCP tools 在工作。

你现在公开出来的这套流程，实际上由两层能力组成：

- `packages/premiere-mcp`、`packages/audio-beat-mcp`、`packages/video-research-mcp` 提供可执行的 MCP 工具
- `.codex/skills/` 提供项目内工作流约束、规划规则、验证要求和审查标准

也就是说，这些 skills 不是可有可无的附属物，而是这个项目之所以能稳定完成 DOCX 解析、参考视频复刻、粗剪规划、桥接验证和闭环审查的重要部分。

当前仓库内一共包含 `16` 个项目 skills，目录在：

```text
.codex/skills/
```

## 使用方式

如果你在 `Codex`、`Claude Code`、`OpenClaw` 或其他支持仓库内 skill 约定的环境里使用这个项目，这些 skills 可以作为项目本地规则直接参与工作流。

它们主要负责：

- 把模糊需求变成确定性的剪辑计划
- 约束 AI 不要乱猜转场、特效和关键帧
- 强制桥接、时间线、装配结果做验证
- 在代码变化后同步更新项目文档

## Skills 一览

### 编排与闭环

- `premiere-agent-closed-loop`
  用于把 `premiere-mcp` 从“工具集合”收口成闭环工作流，要求任务分类、research gate、写后验证、critic 审查和结构化失败输出。
- `premiere-skill-first-iteration`
  用于处理反复失败、描述不清或难以调试的问题，先把经验沉淀成项目 skill，再继续扩 MCP 行为。

### 规划与审查

- `premiere-assembly-planning`
  把 `DOCX + 素材 manifest` 变成确定性的 Premiere 装配候选方案，再进入高层时间线执行。
- `premiere-edit-reasonability-review`
  在自动装配前后检查时间线、候选素材、转场和 guide 是否合理，避免“命令成功但结果不对”。
- `premiere-guide-effect-planning`
  把文档里提到的特效、批量复制效果、效果栈规则整理成安全的 clip 级 effect plan。
- `premiere-transition-mapping`
  把文档中的“转场”“过渡”“贝塞尔”“默认转场”这些语言映射成安全的 Premiere 转场行为。
- `premiere-timeline-conformance-review`
  装配后回读时间线，检查真实 clip 顺序、数量、连续性是否和计划一致。
- `premiere-natural-language-edit-planning`
  当用户直接给提示词时，把自然语言需求转成确定性的装配默认值，不依赖外部 LLM API。
- `premiere-reference-video-replication`
  处理“参考视频 -> blueprint -> 素材匹配 -> 装配后 QA”这条复刻路径。

### 文档与素材预处理

- `premiere-docx-visual-ingest`
  处理截图很多的 Word 教程，提取有顺序的步骤、嵌入图片和未解析的视觉依赖。
- `premiere-docx-markdown-normalization`
  把提取后的 Word 内容改写成 AI 可安全读取的 Markdown，同时保留步骤顺序和截图引用。
- `premiere-reference-only-media`
  约束素材流程走 `reference-only`，只扫描原始路径，不复制、不搬运源素材。

### 桥接、关键帧与维护

- `premiere-bridge-verification`
  用于 bridge 目录、CEP 命令 envelope、超时和恢复脚本变更后的验证。
- `premiere-keyframe-language-mapping`
  把“推近、淡入、贝塞尔、Continuous Bezier、Position、Scale”这类语言映射成明确的 Premiere 属性、时间、数值和验证步骤。
- `premiere-doc-sync`
  当 tools、resources、prompts、bridge 协议、脚本或项目 skills 变化时，强制同步文档。
- `premiere-reference-migration`
  用于比较参考项目和当前项目时，做有边界的迁移，不把输出目标搞混。

## 特殊资源

`premiere-keyframe-language-mapping` 除了主 `SKILL.md`，还带了两份附属资源：

- `.codex/skills/premiere-keyframe-language-mapping/agents/openai.yaml`
- `.codex/skills/premiere-keyframe-language-mapping/references/keyframe-reference.md`

它们分别用于：

- 给支持工作流描述文件的环境提供更明确的 skill 元信息
- 补充关键帧语义、属性映射、插值、验证和 still-image fallback 的参考说明

## 这些 skills 和 MCP tools 的关系

可以把当前项目理解成这条链：

```text
用户需求
  -> project skills 约束流程
  -> 工作流规划层生成计划
  -> MCP tools 执行 Premiere 操作
  -> review / verification skills 审查结果
```

如果只有 MCP tools，没有这些 skills，AI 更容易出现下面的问题：

- 乱猜转场
- 把关键帧缓动当成 clip 转场
- 没有先扫描素材就直接装配
- 写入成功就误判为剪辑成功
- 文档、桥接协议和运行时行为发生漂移

## 相关位置

- 技能目录：[.codex/skills](./.codex/skills)
- 首页说明：[README.md](./README.md)
- 快速开始：[QUICKSTART.md](./QUICKSTART.md)
- 已知限制：[KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
