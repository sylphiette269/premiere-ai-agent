import { readFileSync } from 'node:fs';

import { z } from 'zod';

import type {
  AgentTaskResult,
  BlueprintReviewResult,
  EditingBlueprint,
  PlanStep,
  ReferencePatternAnalysis,
  ReferenceSample,
  TaskScenario,
} from './agent-orchestration.types.js';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

const PLATFORM_OPTIONS = ['douyin', 'tiktok', 'youtube', 'instagram', 'general'] as const;

export const agentTaskInputSchema = z.object({
  goal: z.string().min(1),
  mediaManifestPath: z.string().optional(),
  docxPath: z.string().optional(),
  referenceBlueprintPath: z.string().optional(),
  editingBlueprintPath: z.string().optional(),
});

export const editingBlueprintSchema = z.object({
  hookStyle: z.string(),
  averageShotDuration: z.number(),
  pacingCurve: z.string(),
  transitionPattern: z.array(z.string()),
  textOverlayStyle: z.string(),
  musicBeatStrategy: z.string(),
  ctaPattern: z.string(),
  avoidPatterns: z.array(z.string()),
  referenceCount: z.number(),
  targetPlatform: z.string().optional(),
  targetDurationRange: z.tuple([z.number(), z.number()]).optional(),
});

export const loadEditingBlueprintInputSchema = z.object({
  editingBlueprintPath: z.string().min(1),
});

export const collectReferenceVideosInputSchema = z.object({
  goal: z.string().min(1),
  platform: z.enum(PLATFORM_OPTIONS).optional(),
  styleKeywords: z.array(z.string()).optional(),
  userProvidedReferences: z.array(z.string()).optional(),
});

export const analyzeReferencePatternsInputSchema = z.object({
  references: z.array(z.any()).min(1),
  focusAreas: z.array(z.string()).optional(),
});

export const extractEditingBlueprintInputSchema = z.object({
  analysisResult: z.any(),
  targetDuration: z.number().optional(),
  targetPlatform: z.string().optional(),
});

export const reviewBlueprintReasonabilityInputSchema = z.object({
  blueprint: z.any(),
  goal: z.string().min(1),
});

function makeStep(step: PlanStep): PlanStep {
  return step;
}

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase();
}

function baseSuccessCriteria(): string[] {
  return [
    '关键写操作未出现 verification.confirmed=false',
    '不存在 blocked 或 hard-stop 错误',
    'critic_edit_result 通过',
  ];
}

export function identifyScenario(input: {
  goal: string;
  referenceBlueprintPath?: string;
  editingBlueprintPath?: string;
  docxPath?: string;
  mediaManifestPath?: string;
}): TaskScenario {
  if (input.referenceBlueprintPath) {
    return 'reference_video';
  }

  if (input.editingBlueprintPath) {
    return 'viral_style';
  }

  if (input.docxPath) {
    return 'docx_guided';
  }

  const viralKeywords = [
    '爆款',
    '抖音',
    'tiktok',
    'douyin',
    '快节奏',
    '热门',
    '平台风格',
    '模仿',
    '火的',
    '流量',
    '短视频风格',
    'viral',
    'trending',
    'fast-paced',
    'reels',
    '快手',
    'kuaishou',
    '小红书',
    'xiaohongshu',
  ];
  const goal = normalizeGoal(input.goal);
  if (viralKeywords.some((keyword) => goal.includes(keyword))) {
    return 'viral_style';
  }

  return 'natural_language';
}

function generateNaturalLanguagePlan(input: {
  goal: string;
}): AgentTaskResult {
  return {
    ok: true,
    plan: {
      scenario: 'natural_language',
      researchRequired: false,
      prerequisites: [
        '读取当前项目状态',
        '解析自然语言目标',
        '在执行装配前完成合理性审查',
      ],
      successCriteria: [
        ...baseSuccessCriteria(),
        'plan_edit_from_request 返回可执行计划',
      ],
      warnings: [],
      suggestedTools: [
        'parse_edit_request',
        'plan_edit_from_request',
        'review_edit_reasonability',
        'assemble_product_spot',
        'critic_edit_result',
      ],
      discouragedTools: ['build_timeline_from_xml'],
      steps: [
        makeStep({
          id: 'step_01',
          title: '解析自然语言需求',
          tool: 'parse_edit_request',
          purpose: '把自然语言目标解析成结构化意图',
          required: true,
          onFailure: 'abort',
          phase: 'planning',
        }),
        makeStep({
          id: 'step_02',
          title: '生成剪辑计划',
          tool: 'plan_edit_from_request',
          purpose: '将意图转成可执行计划',
          required: true,
          onFailure: 'abort',
          dependsOn: ['step_01'],
          phase: 'planning',
        }),
        makeStep({
          id: 'step_03',
          title: '计划合理性审查',
          tool: 'review_edit_reasonability',
          purpose: '阻断明显不可执行或不合理的计划',
          required: true,
          onFailure: 'abort',
          dependsOn: ['step_02'],
          phase: 'planning',
        }),
        makeStep({
          id: 'step_04',
          title: '执行剪辑装配',
          tool: 'assemble_product_spot',
          purpose: '执行实际装配',
          argsHint: { reviewBeforeAssemble: true },
          required: true,
          onFailure: 'read_state_then_retry',
          retryPolicy: { maxAttempts: 2, retryableOnly: true },
          dependsOn: ['step_03'],
          requiresVerification: true,
          phase: 'execution',
        }),
        makeStep({
          id: 'step_05',
          title: '独立审稿',
          tool: 'critic_edit_result',
          purpose: '独立检查结构、节奏和技术质量',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_04'],
          phase: 'review',
        }),
      ],
    },
  };
}

function generateDocxGuidedPlan(input: {
  goal: string;
  docxPath?: string;
  mediaManifestPath?: string;
}): AgentTaskResult {
  const missingInfo: string[] = [];
  if (!input.docxPath) {
    missingInfo.push('docxPath');
  }
  if (!input.mediaManifestPath) {
    missingInfo.push('mediaManifestPath');
  }
  if (missingInfo.length > 0) {
    return {
      ok: false,
      plan: {
        scenario: 'docx_guided',
        prerequisites: [],
        successCriteria: [],
        warnings: [],
        suggestedTools: [],
        discouragedTools: ['build_timeline_from_xml'],
        steps: [],
        researchRequired: false,
      },
      cannotPlan: {
        reason: '缺少 DOCX 指引任务所需输入',
        missingInfo,
      },
    };
  }

  return {
    ok: true,
    plan: {
      scenario: 'docx_guided',
      researchRequired: false,
      prerequisites: [
        'DOCX 脚本存在且可读取',
        'media manifest 可读取',
        'review_edit_reasonability 未 blocked',
      ],
      successCriteria: [
        ...baseSuccessCriteria(),
        'plan_edit_assembly 成功产出装配计划',
      ],
      warnings: [],
      suggestedTools: [
        'plan_edit_assembly',
        'review_edit_reasonability',
        'assemble_product_spot',
        'critic_edit_result',
      ],
      discouragedTools: ['build_timeline_from_xml'],
      steps: [
        makeStep({
          id: 'step_01',
          title: '生成 DOCX 装配计划',
          tool: 'plan_edit_assembly',
          purpose: '从 DOCX 与 manifest 生成装配计划',
          required: true,
          onFailure: 'abort',
          phase: 'planning',
        }),
        makeStep({
          id: 'step_02',
          title: '合理性审查',
          tool: 'review_edit_reasonability',
          purpose: '阻断无法执行或素材不匹配的计划',
          required: true,
          onFailure: 'abort',
          dependsOn: ['step_01'],
          phase: 'planning',
        }),
        makeStep({
          id: 'step_03',
          title: '执行剪辑装配',
          tool: 'assemble_product_spot',
          purpose: '基于 DOCX 计划执行装配',
          argsHint: {
            autoPlanFromManifest: true,
            reviewBeforeAssemble: true,
          },
          required: true,
          onFailure: 'read_state_then_retry',
          retryPolicy: { maxAttempts: 2, retryableOnly: true },
          dependsOn: ['step_02'],
          requiresVerification: true,
          phase: 'execution',
        }),
        makeStep({
          id: 'step_04',
          title: '独立审稿',
          tool: 'critic_edit_result',
          purpose: '独立检查结构和交付质量',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_03'],
          phase: 'review',
        }),
      ],
    },
  };
}

function generateReferenceVideoPlan(input: {
  goal: string;
  referenceBlueprintPath?: string;
}): AgentTaskResult {
  return {
    ok: true,
    plan: {
      scenario: 'reference_video',
      researchRequired: true,
      prerequisites: [
        '完成参考视频分析',
        '生成复刻计划',
        'review_edit_reasonability 未 blocked',
      ],
      successCriteria: [
        ...baseSuccessCriteria(),
        'compare_to_reference_video 输出可接受差异报告',
      ],
      warnings: [
        '参考视频复刻质量依赖参考蓝图或源视频分析质量',
      ],
      suggestedTools: [
        'analyze_reference_video',
        'plan_replication_from_video',
        'review_edit_reasonability',
        'assemble_product_spot',
        'compare_to_reference_video',
        'critic_edit_result',
      ],
      discouragedTools: ['build_timeline_from_xml'],
      steps: [
        makeStep({
          id: 'step_01',
          title: '分析参考视频',
          tool: 'analyze_reference_video',
          purpose: '提取参考视频结构和风格蓝图',
          required: true,
          onFailure: 'report_and_stop',
          phase: 'research',
        }),
        makeStep({
          id: 'step_02',
          title: '生成复刻计划',
          tool: 'plan_replication_from_video',
          purpose: '将参考蓝图映射到可执行计划',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_01'],
          phase: 'research',
        }),
        makeStep({
          id: 'step_03',
          title: '合理性审查',
          tool: 'review_edit_reasonability',
          purpose: '阻断明显不合理的复刻计划',
          required: true,
          onFailure: 'abort',
          dependsOn: ['step_02'],
          phase: 'planning',
        }),
        makeStep({
          id: 'step_04',
          title: '执行复刻装配',
          tool: 'assemble_product_spot',
          purpose: '按参考蓝图执行装配',
          required: true,
          onFailure: 'read_state_then_retry',
          retryPolicy: { maxAttempts: 2, retryableOnly: true },
          dependsOn: ['step_03'],
          requiresVerification: true,
          phase: 'execution',
        }),
        makeStep({
          id: 'step_05',
          title: '对比参考视频',
          tool: 'compare_to_reference_video',
          purpose: '检查最终装配与参考的偏差',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_04'],
          phase: 'verification',
        }),
        makeStep({
          id: 'step_06',
          title: '独立审稿',
          tool: 'critic_edit_result',
          purpose: '从独立视角审查结果',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_05'],
          phase: 'review',
        }),
      ],
    },
  };
}

function generateViralStylePlan(input: {
  goal: string;
  editingBlueprintPath?: string;
  editingBlueprint?: EditingBlueprint;
}): AgentTaskResult {
  if (input.editingBlueprintPath) {
    return {
      ok: true,
      plan: {
        scenario: 'viral_style',
        researchRequired: false,
        prerequisites: [
          '外部 research 已产出 EditingBlueprint JSON',
          'review_blueprint_reasonability 通过',
          '装配与 QA 统一消费同一个 editingBlueprintPath',
        ],
        successCriteria: [
          '视频总时长在目标范围内',
          '存在明确 hook 段落（前 3 秒）',
          '镜头平均时长符合蓝图节奏要求',
          'compare_result_to_blueprint 输出可接受偏差',
          '通过 critic_edit_result 审核',
        ],
        warnings: [
          '外部蓝图文件不可读或字段缺失时应直接中止，不要退回 synthetic research。',
        ],
        suggestedTools: [
          'assemble_product_spot_closed_loop',
          'load_editing_blueprint',
          'review_blueprint_reasonability',
          'assemble_product_spot',
          'compare_result_to_blueprint',
          'critic_edit_result',
        ],
        discouragedTools: ['build_timeline_from_xml'],
        blueprint: input.editingBlueprint,
        steps: [
          makeStep({
            id: 'step_01',
            title: '加载外部编辑蓝图',
            tool: 'load_editing_blueprint',
            purpose: '读取并校验外部 research 生成的 EditingBlueprint JSON',
            argsHint: { editingBlueprintPath: input.editingBlueprintPath },
            required: true,
            onFailure: 'report_and_stop',
            phase: 'research',
          }),
          makeStep({
            id: 'step_02',
            title: '审核蓝图合理性',
            tool: 'review_blueprint_reasonability',
            purpose: '确认外部蓝图可执行、具体、符合目标',
            argsHint: { goal: input.goal },
            required: true,
            onFailure: 'abort',
            dependsOn: ['step_01'],
            phase: 'planning',
          }),
          makeStep({
            id: 'step_03',
            title: '执行剪辑装配',
            tool: 'assemble_product_spot',
            purpose: '基于外部 EditingBlueprint 执行剪辑装配',
            argsHint: {
              reviewBeforeAssemble: true,
              editingBlueprintPath: input.editingBlueprintPath,
            },
            required: true,
            onFailure: 'read_state_then_retry',
            retryPolicy: { maxAttempts: 2, retryableOnly: true },
            dependsOn: ['step_02'],
            requiresVerification: true,
            phase: 'execution',
          }),
          makeStep({
            id: 'step_04',
            title: '对比结果与蓝图',
            tool: 'compare_result_to_blueprint',
            purpose: '检查实际结果和外部蓝图偏差',
            argsHint: { editingBlueprintPath: input.editingBlueprintPath },
            required: true,
            onFailure: 'report_and_stop',
            dependsOn: ['step_03'],
            phase: 'verification',
          }),
          makeStep({
            id: 'step_05',
            title: '独立审稿',
            tool: 'critic_edit_result',
            purpose: '独立审核最终结构、风格和目标拟合度',
            argsHint: {
              scenario: 'viral_style',
              editingBlueprintPath: input.editingBlueprintPath,
            },
            required: true,
            onFailure: 'report_and_stop',
            dependsOn: ['step_04'],
            phase: 'review',
          }),
        ],
      },
    };
  }

  return {
    ok: true,
    plan: {
      scenario: 'viral_style',
      researchRequired: true,
      prerequisites: [
        '至少分析 3-5 个同类型参考视频或参考样本',
        '输出 hook / pacing / transition / subtitle / CTA 模式分析',
        '生成结构化 EditingBlueprint',
        'review_blueprint_reasonability 通过',
      ],
      successCriteria: [
        '视频总时长在目标范围内',
        '存在明确 hook 段落（前 3 秒）',
        '镜头平均时长符合快节奏要求（≤ 1.5 秒）',
        '转场种类不单一，cross dissolve 占比不超过 30%',
        '至少存在 1 个节奏高潮段落',
        '存在 CTA 或结尾收束',
        '通过 critic_edit_result 审核',
      ],
      warnings: [
        '风格型任务质量高度依赖研究阶段的充分性',
        '如果参考样本不足，蓝图可能不准确',
      ],
      suggestedTools: [
        'collect_reference_videos',
        'analyze_reference_patterns',
        'extract_editing_blueprint',
        'review_blueprint_reasonability',
        'assemble_product_spot',
        'compare_result_to_blueprint',
        'critic_edit_result',
      ],
      discouragedTools: ['build_timeline_from_xml'],
      steps: [
        makeStep({
          id: 'step_01',
          title: '搜集参考视频/样本',
          tool: 'collect_reference_videos',
          purpose: '搜集同类型同平台的参考样本',
          required: true,
          onFailure: 'report_and_stop',
          phase: 'research',
        }),
        makeStep({
          id: 'step_02',
          title: '分析参考模式',
          tool: 'analyze_reference_patterns',
          purpose: '提取 hook、节奏、转场、字幕和 CTA 模式',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_01'],
          phase: 'research',
        }),
        makeStep({
          id: 'step_03',
          title: '生成编辑蓝图',
          tool: 'extract_editing_blueprint',
          purpose: '把研究结果转成结构化 EditingBlueprint',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_02'],
          phase: 'research',
        }),
        makeStep({
          id: 'step_04',
          title: '审核蓝图合理性',
          tool: 'review_blueprint_reasonability',
          purpose: '确认蓝图可执行、具体、符合目标',
          required: true,
          onFailure: 'abort',
          dependsOn: ['step_03'],
          phase: 'planning',
        }),
        makeStep({
          id: 'step_05',
          title: '执行剪辑装配',
          tool: 'assemble_product_spot',
          purpose: '根据蓝图执行剪辑装配',
          argsHint: { reviewBeforeAssemble: true },
          required: true,
          onFailure: 'read_state_then_retry',
          retryPolicy: { maxAttempts: 2, retryableOnly: true },
          dependsOn: ['step_04'],
          requiresVerification: true,
          phase: 'execution',
        }),
        makeStep({
          id: 'step_06',
          title: '对比结果与蓝图',
          tool: 'compare_result_to_blueprint',
          purpose: '检查实际结果和蓝图偏差',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_05'],
          phase: 'verification',
        }),
        makeStep({
          id: 'step_07',
          title: '独立审稿',
          tool: 'critic_edit_result',
          purpose: '独立审核最终结构、风格和目标拟合度',
          required: true,
          onFailure: 'report_and_stop',
          dependsOn: ['step_06'],
          phase: 'review',
        }),
      ],
    },
  };
}

export function generatePlan(
  scenario: TaskScenario,
  input: {
    goal: string;
    docxPath?: string;
    mediaManifestPath?: string;
    referenceBlueprintPath?: string;
    editingBlueprintPath?: string;
    editingBlueprint?: EditingBlueprint;
  },
): AgentTaskResult {
  switch (scenario) {
    case 'viral_style':
      return generateViralStylePlan(input);
    case 'reference_video':
      return generateReferenceVideoPlan(input);
    case 'docx_guided':
      return generateDocxGuidedPlan(input);
    case 'natural_language':
    default:
      return generateNaturalLanguagePlan(input);
  }
}

export function executeAgentTask(
  input: z.infer<typeof agentTaskInputSchema>,
): AgentTaskResult {
  const scenario = identifyScenario(input);
  if (input.editingBlueprintPath) {
    try {
      const loadedBlueprint = loadEditingBlueprint({
        editingBlueprintPath: input.editingBlueprintPath,
      });
      return generatePlan(scenario, {
        ...input,
        editingBlueprint: loadedBlueprint.blueprint,
      });
    } catch (error) {
      return {
        ok: false,
        plan: {
          scenario,
          prerequisites: [],
          successCriteria: [],
          warnings: [],
          suggestedTools: ['load_editing_blueprint'],
          discouragedTools: ['build_timeline_from_xml'],
          steps: [],
          researchRequired: false,
        },
        cannotPlan: {
          reason: `Unable to read editing blueprint: ${String(error)}`,
          missingInfo: ['editingBlueprintPath'],
        },
      };
    }
  }
  return generatePlan(scenario, input);
}

export function checkResearchGate(state: {
  scenario: TaskScenario;
  completedSteps: string[];
  blueprint?: EditingBlueprint;
}): { passed: boolean; reason?: string } {
  if (state.scenario !== 'viral_style' && state.scenario !== 'reference_video') {
    return { passed: true };
  }

  if (state.scenario === 'viral_style') {
    if (!state.blueprint) {
      return {
        passed: false,
        reason: '风格型任务必须先生成 EditingBlueprint，当前尚未完成研究阶段',
      };
    }

    const requiredResearchSteps = [
      'collect_reference_videos',
      'analyze_reference_patterns',
      'extract_editing_blueprint',
    ];
    if (state.completedSteps.includes('load_editing_blueprint')) {
      return { passed: true };
    }
    const missingSteps = requiredResearchSteps.filter(
      (step) => !state.completedSteps.includes(step),
    );
    if (missingSteps.length > 0) {
      return {
        passed: false,
        reason: `研究阶段未完成，缺少: ${missingSteps.join(', ')}`,
      };
    }
  }

  if (
    state.scenario === 'reference_video' &&
    !state.completedSteps.includes('analyze_reference_video')
  ) {
    return {
      passed: false,
      reason: '参考视频复刻任务必须先完成 analyze_reference_video',
    };
  }

  return { passed: true };
}

export function collectReferenceVideos(input: z.infer<typeof collectReferenceVideosInputSchema>) {
  const platform = input.platform ?? 'general';
  const keywords = input.styleKeywords?.length
    ? input.styleKeywords
    : input.goal
        .split(/[\s,，。!！?？]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2)
        .slice(0, 5);
  const userProvided = input.userProvidedReferences ?? [];
  const syntheticCount = Math.max(3 - userProvided.length, 0);

  const references: ReferenceSample[] = [
    ...userProvided.map((reference, index) => ({
      id: `ref_user_${index + 1}`,
      title: `用户参考 ${index + 1}`,
      platform,
      hookStyle: 'direct_hook',
      pacingNote: 'front_loaded_fast',
      transitionPattern: ['hard_cut', 'zoom_cut'],
      subtitleStyle: 'centered-bold',
      ctaPattern: 'end-screen',
      sourceType: 'user_provided' as const,
      source: reference,
    })),
    ...Array.from({ length: syntheticCount }, (_, index) => ({
      id: `ref_synth_${index + 1}`,
      title: `${platform} ${keywords[0] ?? 'style'} sample ${index + 1}`,
      platform,
      hookStyle: index === 0 ? 'bold_statement' : 'question',
      pacingNote: index === 0 ? 'fast-fast-hold' : 'fast-build-fast',
      transitionPattern: index % 2 === 0 ? ['hard_cut', 'beat_cut'] : ['hard_cut', 'zoom_cut'],
      subtitleStyle: 'centered-bold',
      ctaPattern: 'comment_or_click',
      sourceType: 'synthetic' as const,
    })),
  ];

  return {
    ok: true,
    references,
    platform,
    styleKeywords: keywords,
  };
}

export function loadEditingBlueprint(
  input: z.infer<typeof loadEditingBlueprintInputSchema>,
) {
  const parsedInput = loadEditingBlueprintInputSchema.parse(input);
  const raw = readFileSync(parsedInput.editingBlueprintPath, 'utf8');
  const blueprint = editingBlueprintSchema.parse(JSON.parse(raw)) as EditingBlueprint;

  return {
    ok: true,
    blueprint,
    editingBlueprintPath: parsedInput.editingBlueprintPath,
  };
}

export function analyzeReferencePatterns(
  input: z.infer<typeof analyzeReferencePatternsInputSchema>,
) {
  const references = input.references as ReferenceSample[];
  const collect = <T extends string>(picker: (reference: ReferenceSample) => T | T[]) =>
    references.flatMap((reference) => {
      const picked = picker(reference);
      return Array.isArray(picked) ? picked : [picked];
    });

  const dominantHooks = [...new Set(collect((reference) => reference.hookStyle))];
  const pacingPatterns = [...new Set(collect((reference) => reference.pacingNote))];
  const transitionPatterns = [...new Set(collect((reference) => reference.transitionPattern))];
  const subtitlePatterns = [...new Set(collect((reference) => reference.subtitleStyle))];
  const ctaPatterns = [...new Set(collect((reference) => reference.ctaPattern))];

  const analysis: ReferencePatternAnalysis = {
    dominantHooks,
    pacingPatterns,
    transitionPatterns,
    subtitlePatterns,
    ctaPatterns,
    avoidPatterns: ['cross_dissolve_only'],
    recommendedPlatform: references[0]?.platform ?? 'general',
    sampleCount: references.length,
  };

  return {
    ok: true,
    analysis,
  };
}

export function extractEditingBlueprint(
  input: z.infer<typeof extractEditingBlueprintInputSchema>,
) {
  const analysis = input.analysisResult as ReferencePatternAnalysis;
  const blueprint: EditingBlueprint = {
    hookStyle: analysis.dominantHooks[0] ?? 'direct_hook',
    averageShotDuration: analysis.recommendedPlatform === 'youtube' ? 2.5 : 1.2,
    pacingCurve: analysis.pacingPatterns[0] ?? 'fast-build-fast',
    transitionPattern: analysis.transitionPatterns.length > 0
      ? analysis.transitionPatterns
      : ['hard_cut', 'zoom_cut'],
    textOverlayStyle: analysis.subtitlePatterns[0] ?? 'centered-bold',
    musicBeatStrategy: 'cut-on-beat',
    ctaPattern: analysis.ctaPatterns[0] ?? 'end-screen',
    avoidPatterns: analysis.avoidPatterns.length > 0
      ? analysis.avoidPatterns
      : ['cross_dissolve_only'],
    referenceCount: analysis.sampleCount,
    targetPlatform: input.targetPlatform ?? analysis.recommendedPlatform,
    targetDurationRange:
      typeof input.targetDuration === 'number' && Number.isFinite(input.targetDuration)
        ? [Math.max(3, input.targetDuration - 5), input.targetDuration + 5]
        : undefined,
  };

  return {
    ok: true,
    blueprint,
  };
}

export function reviewBlueprintReasonability(
  blueprint: EditingBlueprint,
  goal: string,
): BlueprintReviewResult {
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (!blueprint.hookStyle) {
    issues.push('hookStyle 未定义');
    suggestions.push('明确 hook 风格，如 question / bold_statement / visual_shock');
  }
  if (!blueprint.averageShotDuration || blueprint.averageShotDuration <= 0) {
    issues.push('averageShotDuration 无效');
    suggestions.push('设定镜头平均时长，快节奏建议 0.8-1.5s');
  }
  if (!blueprint.transitionPattern || blueprint.transitionPattern.length === 0) {
    issues.push('transitionPattern 为空');
    suggestions.push('定义至少 2 种转场模式');
  }
  if (!blueprint.pacingCurve) {
    issues.push('pacingCurve 未定义');
    suggestions.push('定义节奏曲线，如 fast-slow-fast / gradual_build / constant');
  }
  if (blueprint.averageShotDuration > 5 && goal.includes('快节奏')) {
    issues.push(`镜头平均时长 ${blueprint.averageShotDuration}s 与“快节奏”目标不匹配`);
    suggestions.push('快节奏任务建议镜头平均时长 ≤ 1.5s');
  }
  if (
    blueprint.transitionPattern.length === 1 &&
    blueprint.transitionPattern[0]?.toLowerCase().includes('cross dissolve')
  ) {
    issues.push('仅使用 cross dissolve 作为唯一转场不符合风格型任务要求');
    suggestions.push('增加 hard_cut / zoom_cut / beat_cut 等转场类型');
  }
  if (!blueprint.referenceCount || blueprint.referenceCount < 3) {
    issues.push(`参考样本数量 ${blueprint.referenceCount ?? 0} 不足`);
    suggestions.push('建议至少分析 3-5 个参考样本');
  }

  return {
    approved: issues.length === 0,
    issues,
    suggestions,
  };
}

export function executeBlueprintReview(
  input: z.infer<typeof reviewBlueprintReasonabilityInputSchema>,
) {
  return {
    ok: true,
    review: reviewBlueprintReasonability(input.blueprint as EditingBlueprint, input.goal),
  };
}

export function createAgentOrchestrationCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'agent_task',
      description: '分析编辑目标，识别任务场景，并返回结构化执行计划。',
      inputSchema: agentTaskInputSchema,
    },
    {
      name: 'collect_reference_videos',
      description: '为 viral_style 或平台风格任务收集参考样本描述。',
      inputSchema: collectReferenceVideosInputSchema,
    },
    {
      name: 'load_editing_blueprint',
      description: 'Load and validate an external EditingBlueprint JSON file before viral-style assembly.',
      inputSchema: loadEditingBlueprintInputSchema,
    },
    {
      name: 'analyze_reference_patterns',
      description: '分析参考样本的 hook、节奏、转场、字幕和 CTA 模式。',
      inputSchema: analyzeReferencePatternsInputSchema,
    },
    {
      name: 'extract_editing_blueprint',
      description: '将参考模式分析结果转成结构化 EditingBlueprint。',
      inputSchema: extractEditingBlueprintInputSchema,
    },
    {
      name: 'review_blueprint_reasonability',
      description: '审核 EditingBlueprint 是否足够具体、可执行、符合目标。',
      inputSchema: reviewBlueprintReasonabilityInputSchema,
    },
  ];
}
