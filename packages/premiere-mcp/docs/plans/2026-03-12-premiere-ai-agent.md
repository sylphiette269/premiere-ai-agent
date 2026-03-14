# Premiere AI Agent 实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 执行本计划。步骤使用 `- [ ]` 语法跟踪进度。

**目标：** 将现有 premiere-mcp MCP server 改造为一个独立运行的 AI agent 应用，用户在 Claude Code / Codex 中输入自然语言需求，agent 自主规划、执行、验证，全程完成 Premiere Pro 视频剪辑任务。

**架构：** 在现有 121 个 MCP 工具之上，新增 Agent 编排层（任务分解、执行循环、状态确认）、强化 system prompt / playbook、标准化错误协议。用户交互保持 Claude Code / Codex 的 MCP 接入方式不变，无需自建 UI。

**Tech Stack：** TypeScript, Node.js 18+, @modelcontextprotocol/sdk, Zod, Adobe CEP + ExtendScript

---

## 整体架构概览

```
用户 (Claude Code / Codex)
  ↓ 自然语言指令
[Phase 1] operate_premiere_mcp prompt 强化
  ↓ 结构化任务拆解
[Phase 2] agent_task 工具 (新增)
  ↓ 执行计划 + 检查点
[Phase 3] 执行循环 + post-write 状态确认
  ↓ 工具调用 + 读回验证
[Phase 4] 标准化错误协议
  ↓ error_code + 重试策略
[现有] 121 个 MCP 工具 → CEP bridge → Premiere Pro
```

## 阶段划分

| 阶段 | 名称 | 核心产出 | 依赖 |
|------|------|----------|------|
| Phase 1 | Prompt 强化 | 增强 operate_premiere_mcp + agent-guide | 无 |
| Phase 2 | Agent 编排工具 | agent_task 工具 | Phase 1 |
| Phase 3 | Post-write 状态确认 | verification 字段 + 自动读回 | Phase 2 |
| Phase 4 | 错误协议标准化 | error_code + 重试策略 | Phase 3 |

---

## Phase 1：Prompt 强化

### 目标
让 Claude Code / Codex 在读取 `operate_premiere_mcp` prompt 后，具备完整的任务拆解能力和场景 playbook，而不只是一堆注意事项。

### 涉及文件
- 修改：`src/resources/index.ts`（agentGuideResource 函数，第 398 行起）
- 修改：`src/prompts/index.ts`（operate_premiere_mcp prompt）

### 任务 1.1：在 agentGuideResource 加入任务拆解模板

**文件：** `src/resources/index.ts:398`

- [ ] 读取 `src/resources/index.ts` 第 398-510 行，确认 `agentGuideResource` 返回对象结构
- [ ] 在返回对象里新增 `taskDecompositionTemplate` 字段：

```typescript
taskDecompositionTemplate: {
  steps: [
    '1. 解析意图：用 parse_edit_request 解析用户目标',
    '2. 扫描状态：list_project_items + list_sequences',
    '3. 生成计划：plan_edit_from_request 或 plan_edit_assembly',
    '4. 合理性审查：review_edit_reasonability，blocked 时硬停止',
    '5. 执行装配：assemble_product_spot(reviewBeforeAssemble: true)',
    '6. 验证结果：检查 assemblyReview.findings，失败时向用户报告',
  ],
  onError: '遇到 ok:false 时，先读取当前状态再决定重试或向用户报告',
},
```

- [ ] 新增 `scenarioPlaybooks` 字段：

```typescript
scenarioPlaybooks: {
  productSpot_naturalLanguage: [
    'parse_edit_request',
    'plan_edit_from_request',
    'review_edit_reasonability',
    'assemble_product_spot(reviewBeforeAssemble:true)',
  ],
  productSpot_docxGuided: [
    'plan_edit_assembly(docxPath, mediaManifestPath)',
    'review_edit_reasonability',
    'assemble_product_spot(autoPlanFromManifest:true, reviewBeforeAssemble:true)',
  ],
  referenceVideoReplication: [
    'analyze_reference_video',
    'plan_replication_from_video',
    'assemble_product_spot(referenceBlueprintPath)',
    'compare_to_reference_video',
  ],
},
```

- [ ] 运行 `npm run build` 确认编译通过
- [ ] 运行 `npm test` 确认测试通过
- [ ] 提交：`git commit -m "feat(agent): add task decomposition template and scenario playbooks to agent-guide"`

### 任务 1.2：强化 operate_premiere_mcp prompt

**文件：** `src/prompts/index.ts`

- [ ] 运行 `grep -n 'operate_premiere_mcp' src/prompts/index.ts` 找到 prompt 定义位置
- [ ] 读取该 prompt 的完整 messages 数组
- [ ] 在 messages 数组末尾追加一条 `user` 角色消息：

```typescript
text('user',
  '开始任何编辑任务前，请先执行以下步骤：\n' +
  '1. 读取 premiere://mcp/agent-guide 获取任务拆解模板和场景 playbook\n' +
  '2. 读取 premiere://project/info 了解当前项目状态\n' +
  '3. 按 taskDecompositionTemplate.steps 拆解任务再执行\n' +
  '4. 遇到 assemblyReview.blocked 时，停止并向用户报告具体原因\n' +
  '5. 每次写操作后，确认返回结果中 ok:true 再继续下一步'
),
```

- [ ] 运行 `npm run build` && `npm test`
- [ ] 提交：`git commit -m "feat(agent): add startup checklist to operate_premiere_mcp prompt"`

---

## Phase 2：Agent 编排工具

### 目标
新增 `agent_task` MCP 工具，让 Claude Code 可以显式触发任务规划，返回结构化执行步骤和场景识别结果。

### 涉及文件
- 新增：`src/tools/catalog/agent-orchestration.ts`
- 修改：`src/tools/index.ts`（注册新 catalog）
- 新增测试：`src/__tests__/tools/agent-orchestration.test.ts`

### 任务 2.1：实现 agent_task 工具核心逻辑

**文件：** `src/tools/catalog/agent-orchestration.ts`

- [ ] 新建文件，写失败测试 `src/__tests__/tools/agent-orchestration.test.ts`：

```typescript
import { executeAgentTask } from '../../tools/catalog/agent-orchestration.js';

describe('executeAgentTask', () => {
  it('自然语言目标返回 natural_language 场景和步骤列表', async () => {
    const result = await executeAgentTask({ goal: '剪一个30秒产品宣传片' });
    expect(result.ok).toBe(true);
    expect(result.plan.scenario).toBe('natural_language');
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.plan.suggestedTools[0]).toBe('parse_edit_request');
  });

  it('传入 docxPath 时返回 docx_guided 场景', async () => {
    const result = await executeAgentTask({
      goal: '按教程剪辑',
      docxPath: '/path/to/guide.docx',
    });
    expect(result.plan.scenario).toBe('docx_guided');
  });

  it('传入 referenceBlueprintPath 时优先返回 reference_video 场景', async () => {
    const result = await executeAgentTask({
      goal: '复制参考视频风格',
      referenceBlueprintPath: '/path/to/blueprint.json',
      docxPath: '/path/to/guide.docx',
    });
    expect(result.plan.scenario).toBe('reference_video');
  });
});
```

- [ ] 运行 `npm run test:jest -- --testPathPattern=agent-orchestration` 确认失败
- [ ] 实现 `src/tools/catalog/agent-orchestration.ts`：

```typescript
import { z } from 'zod';

export const agentTaskInputSchema = z.object({
  goal: z.string().describe('用户的自然语言编辑目标'),
  mediaManifestPath: z.string().optional().describe('素材清单 JSON 路径'),
  docxPath: z.string().optional().describe('DOCX 教程路径'),
  referenceBlueprintPath: z.string().optional().describe('参考视频蓝图 JSON 路径'),
});

export type AgentTaskInput = z.infer<typeof agentTaskInputSchema>;

export interface AgentTaskResult {
  ok: boolean;
  plan: {
    scenario: 'natural_language' | 'docx_guided' | 'reference_video';
    steps: string[];
    suggestedTools: string[];
    warnings: string[];
  };
}

const SCENARIO_STEPS = {
  natural_language: [
    'parse_edit_request: 解析用户意图和时长偏好',
    'list_project_items: 扫描当前项目素材',
    'plan_edit_from_request: 生成确定性装配参数',
    'review_edit_reasonability: 合理性审查，blocked 时硬停止',
    'assemble_product_spot(reviewBeforeAssemble:true): 执行装配',
    '检查 assemblyReview.findings，向用户报告结果',
  ],
  docx_guided: [
    'list_project_items: 扫描当前项目素材',
    'plan_edit_assembly(docxPath, mediaManifestPath): 生成装配计划',
    'review_edit_reasonability: 合理性审查，blocked 时硬停止',
    'assemble_product_spot(autoPlanFromManifest:true, reviewBeforeAssemble:true): 执行装配',
    '检查 assemblyReview.findings，向用户报告结果',
  ],
  reference_video: [
    'analyze_reference_video: 分析参考视频，生成蓝图',
    'list_project_items: 扫描当前项目素材',
    'plan_replication_from_video: 匹配素材与蓝图',
    'assemble_product_spot(referenceBlueprintPath): 执行装配',
    'compare_to_reference_video: QA 比对，报告差异',
  ],
} as const;

export async function executeAgentTask(input: AgentTaskInput): Promise<AgentTaskResult> {
  const scenario: AgentTaskResult['plan']['scenario'] = input.referenceBlueprintPath
    ? 'reference_video'
    : input.docxPath
    ? 'docx_guided'
    : 'natural_language';

  const steps = [...SCENARIO_STEPS[scenario]];
  const suggestedTools = steps.map(s => s.split(':')[0].trim());
  const warnings: string[] = [];

  if (scenario === 'natural_language' && !input.mediaManifestPath) {
    warnings.push('未提供 mediaManifestPath，装配工具将使用项目已导入素材');
  }

  return { ok: true, plan: { scenario, steps, suggestedTools, warnings } };
}

export function createAgentOrchestrationCatalogSnapshot() {
  return [
    {
      name: 'agent_task',
      description:
        '分析用户编辑目标，识别场景类型（自然语言/DOCX教程/参考视频），返回结构化执行步骤和建议工具序列。在开始复杂编辑任务前调用此工具。',
      inputSchema: agentTaskInputSchema,
    },
  ];
}
```

- [ ] 运行测试确认通过
- [ ] 提交：`git commit -m "feat(agent): implement agent_task orchestration tool"`

### 任务 2.2：注册 agent_task 到 MCP 工具列表

**文件：** `src/tools/index.ts`

- [ ] 读取 `src/tools/index.ts`，找到 catalog 导入和 `getAvailableTools()` 的位置
- [ ] 新增导入：

```typescript
import {
  createAgentOrchestrationCatalogSnapshot,
  executeAgentTask,
  agentTaskInputSchema,
} from './catalog/agent-orchestration.js';
```

- [ ] 在 `getAvailableTools()` 返回数组里追加：

```typescript
...createAgentOrchestrationCatalogSnapshot(),
```

- [ ] 在 `executeTool()` switch/if 路由里加入：

```typescript
case 'agent_task': {
  const input = agentTaskInputSchema.parse(args);
  return executeAgentTask(input);
}
```

- [ ] 运行 `npm run build` && `npm test`
- [ ] 提交：`git commit -m "feat(agent): register agent_task in MCP tool surface"`

---

## Phase 3：Post-Write 状态确认机制

### 目标
写操作（add_to_timeline、add_keyframe、apply_effect 等）执行后，response 里自动附带 `verification` 字段，agent 无需再手动调读回工具。

### 涉及文件
- 修改：`src/bridge/types.ts`（BridgeResponse 加 verification 字段）
- 修改：`src/tools/execution-groups.ts`（editing group 加 post-write 读回）
- 新增测试：`src/__tests__/bridge/post-write-verification.test.ts`

### 任务 3.1：扩展 BridgeResponse 类型

**文件：** `src/bridge/types.ts`

- [ ] 读取 `src/bridge/types.ts` 确认现有 response 类型定义
- [ ] 新增 `verification` 可选字段：

```typescript
export interface VerificationResult {
  confirmed: boolean;
  readBackTool?: string;
  readBackResult?: unknown;
  mismatch?: string;
}

// 在 BridgeResponse（或等效类型）里追加：
verification?: VerificationResult;
```

- [ ] 运行 `npm run build` 确认类型通过
- [ ] 提交：`git commit -m "feat(agent): add VerificationResult to bridge types"`

### 任务 3.2：editing 执行组加 post-write 读回

**文件：** `src/tools/execution-groups.ts`

- [ ] 读取 `src/tools/execution-groups.ts`，确认 `createEditingExecutionGroup` 的结构
- [ ] 新增辅助函数 `withVerification`：

```typescript
async function withVerification(
  toolName: string,
  result: Record<string, unknown>,
  readBackFn?: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  if (!readBackFn) return result;
  try {
    const readBackResult = await readBackFn();
    return {
      ...result,
      verification: {
        confirmed: true,
        readBackTool: toolName + '_readback',
        readBackResult,
      },
    };
  } catch (e) {
    return {
      ...result,
      verification: {
        confirmed: false,
        mismatch: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
```

- [ ] 在 `add_to_timeline`、`add_keyframe`、`apply_effect` 这三个最常用写操作的返回处，包一层 `withVerification`
- [ ] 新增失败测试 `src/__tests__/bridge/post-write-verification.test.ts`，验证写操作返回含 `verification.confirmed`
- [ ] 运行测试确认通过
- [ ] 运行 `npm run build` && `npm test`
- [ ] 提交：`git commit -m "feat(agent): add post-write verification to key editing tools"`

---

## Phase 4：错误协议标准化

### 目标
所有工具失败响应统一返回 `{ ok: false, error_code: string, message: string, retryable: boolean }`，agent 可程序化判断是否重试，而不是解析错误文本。

### 涉及文件
- 修改：`src/utils/errors.ts`（新建或扩展，定义 error_code 枚举）
- 修改：`src/mcp-runtime.ts`（CallTool 错误处理统一格式化）
- 新增测试：`src/__tests__/utils/error-protocol.test.ts`

### 任务 4.1：定义标准错误码

**文件：** `src/utils/errors.ts`

- [ ] 检查 `src/utils/` 目录，确认是否已有 `errors.ts`
- [ ] 新建或追加标准错误码定义：

```typescript
export const AGENT_ERROR_CODES = {
  BRIDGE_TIMEOUT:      { code: 'BRIDGE_TIMEOUT',      retryable: true  },
  BRIDGE_EXPIRED:      { code: 'BRIDGE_EXPIRED',      retryable: true  },
  PREMIERE_SCRIPT_ERR: { code: 'PREMIERE_SCRIPT_ERR', retryable: false },
  INVALID_CLIP_ID:     { code: 'INVALID_CLIP_ID',     retryable: false },
  TRANSITION_UNSAFE:   { code: 'TRANSITION_UNSAFE',   retryable: false },
  ASSEMBLY_BLOCKED:    { code: 'ASSEMBLY_BLOCKED',    retryable: false },
  UNKNOWN:             { code: 'UNKNOWN',             retryable: false },
} as const;

export type AgentErrorCode = keyof typeof AGENT_ERROR_CODES;

export function classifyError(message: string): AgentErrorCode {
  if (message.includes('timeout') || message.includes('TIMEOUT')) return 'BRIDGE_TIMEOUT';
  if (message.includes('command_expired') || message.includes('expired')) return 'BRIDGE_EXPIRED';
  if (message.includes('invalid clip') || message.includes('clipId')) return 'INVALID_CLIP_ID';
  if (message.includes('gap') || message.includes('overlap')) return 'TRANSITION_UNSAFE';
  if (message.includes('blocked')) return 'ASSEMBLY_BLOCKED';
  if (message.includes('ExtendScript') || message.includes('evalScript')) return 'PREMIERE_SCRIPT_ERR';
  return 'UNKNOWN';
}

export function buildAgentError(message: string) {
  const codeKey = classifyError(message);
  const { code, retryable } = AGENT_ERROR_CODES[codeKey];
  return { ok: false, error_code: code, message, retryable };
}
```

- [ ] 新增失败测试：

```typescript
import { classifyError, buildAgentError } from '../../utils/errors.js';

describe('classifyError', () => {
  it('timeout 消息返回 BRIDGE_TIMEOUT', () => {
    expect(classifyError('bridge timeout after 5000ms')).toBe('BRIDGE_TIMEOUT');
  });
  it('gap 消息返回 TRANSITION_UNSAFE', () => {
    expect(classifyError('boundary has gap 0.04s')).toBe('TRANSITION_UNSAFE');
  });
});

describe('buildAgentError', () => {
  it('BRIDGE_TIMEOUT 是 retryable', () => {
    const err = buildAgentError('timeout');
    expect(err.retryable).toBe(true);
  });
  it('INVALID_CLIP_ID 不是 retryable', () => {
    const err = buildAgentError('invalid clipId xyz');
    expect(err.retryable).toBe(false);
  });
});
```

- [ ] 运行测试确认通过
- [ ] 提交：`git commit -m "feat(agent): add standard error codes and classification"`

### 任务 4.2：统一 CallTool 错误格式

**文件：** `src/mcp-runtime.ts`

- [ ] 读取 `src/mcp-runtime.ts` 的 `CallToolRequestSchema` handler（大约第 80 行起的 catch 块）
- [ ] 将 catch 块改为使用 `buildAgentError`：

```typescript
import { buildAgentError } from './utils/errors.js';

// 在 catch 块里：
const agentErr = buildAgentError(message);
return {
  content: [{ type: 'text' as const, text: JSON.stringify(agentErr, null, 2) }],
  isError: true,
};
```

- [ ] 运行 `npm run build` && `npm test`
- [ ] 提交：`git commit -m "feat(agent): standardize CallTool error response format"`

---

## 验收标准

完成全部 4 个 Phase 后，以下场景应端到端可用：

### 场景 A：自然语言装配
```
用户：帮我剪一个30秒产品宣传片，快节奏风格
→ agent 调用 agent_task 识别场景
→ 调用 parse_edit_request + plan_edit_from_request
→ 调用 review_edit_reasonability（无 blocked）
→ 调用 assemble_product_spot(reviewBeforeAssemble:true)
→ 返回 assemblyReview，无 hard stop
→ 向用户报告完成情况
```

### 场景 B：错误自愈
```
写操作返回 { ok:false, error_code:'BRIDGE_TIMEOUT', retryable:true }
→ agent 自动重试一次
写操作返回 { ok:false, error_code:'INVALID_CLIP_ID', retryable:false }
→ agent 停止重试，向用户报告具体原因
```

### 场景 C：post-write 确认
```
add_to_timeline 执行后
→ response 含 verification.confirmed:true
→ agent 无需额外调用 list_sequence_tracks 读回
```

---

## 文件变更汇总

| 文件 | 操作 | 所属 Phase |
|------|------|------------|
| `src/resources/index.ts` | 修改（agentGuideResource）| Phase 1 |
| `src/prompts/index.ts` | 修改（operate_premiere_mcp）| Phase 1 |
| `src/tools/catalog/agent-orchestration.ts` | 新增 | Phase 2 |
| `src/tools/index.ts` | 修改（注册新 catalog）| Phase 2 |
| `src/__tests__/tools/agent-orchestration.test.ts` | 新增 | Phase 2 |
| `src/bridge/types.ts` | 修改（VerificationResult）| Phase 3 |
| `src/tools/execution-groups.ts` | 修改（withVerification）| Phase 3 |
| `src/__tests__/bridge/post-write-verification.test.ts` | 新增 | Phase 3 |
| `src/utils/errors.ts` | 新增 | Phase 4 |
| `src/mcp-runtime.ts` | 修改（错误格式）| Phase 4 |
| `src/__tests__/utils/error-protocol.test.ts` | 新增 | Phase 4 |

---

## 执行顺序建议

各 Phase 之间有依赖，**必须顺序执行**。每个 Phase 内的各任务可在确认无文件冲突后并行执行。

```
Phase 1（Prompt 强化）
  └→ Phase 2（agent_task 工具）
       └→ Phase 3（post-write 验证）
            └→ Phase 4（错误协议）
```

计划完成后，运行完整测试套件：

```bash
cd premiere-mcp
npm run build
npm test
```