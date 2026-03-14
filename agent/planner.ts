import path from 'node:path';

import type { PremiereEditPlan } from '../packages/audio-beat-mcp/src/types.js';
import type { EditingBlueprint } from '../packages/premiere-mcp/src/tools/catalog/agent-orchestration.types.js';
import type {
  AgentExecutionInput,
  AgentScenarioId,
  AgentStep,
} from './types.js';

export interface PlannedTaskShape {
  scenario: AgentScenarioId;
  premiereScenario: 'natural_language' | 'docx_guided' | 'reference_video' | 'viral_style';
  successCriteria: string[];
  warnings: string[];
  plan: AgentStep[];
}

function inferScenario(input: AgentExecutionInput): AgentScenarioId {
  if (input.scenarioHint) {
    return input.scenarioHint;
  }

  if (
    input.researchTaskDir ||
    input.editingBlueprintPath ||
    ((input.referenceCandidates?.length ?? 0) > 0 && (input.referenceAssets?.length ?? 0) > 0)
  ) {
    return 'research_to_edit';
  }

  if (input.bgmPath || /卡点|beat|music|mv|节奏/i.test(input.goal)) {
    return 'music_video_edit';
  }

  if (/15\s*秒|15s|15 sec|15 second/i.test(input.goal)) {
    return 'product_video_15s';
  }

  return 'custom';
}

function mapPremiereScenario(
  scenario: AgentScenarioId,
  input: AgentExecutionInput,
): 'natural_language' | 'docx_guided' | 'reference_video' | 'viral_style' {
  if (input.docxPath) {
    return 'docx_guided';
  }

  if (
    scenario === 'research_to_edit' ||
    input.researchTaskDir ||
    input.editingBlueprintPath ||
    (input.referenceCandidates?.length ?? 0) > 0
  ) {
    return 'reference_video';
  }

  return 'natural_language';
}

function inferTargetPlatform(goal: string, explicit?: string): string | undefined {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  if (/抖音|douyin|tiktok/i.test(goal)) {
    return 'douyin';
  }
  if (/bilibili|b站/i.test(goal)) {
    return 'bilibili';
  }
  return undefined;
}

function inferDuration(goal: string, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const matched = goal.match(/(\d+(?:\.\d+)?)\s*(秒|s|sec|second)/i);
  if (matched) {
    return Number(matched[1]);
  }
  return 15;
}

export function derivePromptBlueprint(input: AgentExecutionInput): EditingBlueprint {
  const goal = input.goal;
  const targetDuration = inferDuration(goal, input.targetDurationSec);
  const fastPaced = /抖音|douyin|tiktok|快节奏|viral|节奏|卡点/i.test(goal);
  const textHeavy = /字幕|caption|口播|文案/i.test(goal);
  const beatDriven = Boolean(input.bgmPath) || /卡点|beat|节奏|音乐/i.test(goal);
  const ctaHeavy = /购买|下单|咨询|私信|评论|关注|link/i.test(goal);

  return {
    hookStyle: /口播|卖点|hook|前3秒/i.test(goal) ? 'direct_hook' : 'visual_hook',
    averageShotDuration: fastPaced ? 1.2 : 2.4,
    pacingCurve: fastPaced ? 'fast_open -> product_demo -> cta' : 'steady_open -> demo -> cta',
    transitionPattern: fastPaced ? ['hard_cut', 'speed_emphasis'] : ['hard_cut', 'clean_dissolve'],
    textOverlayStyle: textHeavy ? 'caption_heavy' : 'clean_minimal',
    musicBeatStrategy: beatDriven ? 'beat_markers_and_scale' : 'ambient_flow',
    ctaPattern: ctaHeavy ? 'end_screen' : 'spoken_prompt',
    avoidPatterns: fastPaced ? ['slow_mix_intro', 'long_static_hold'] : ['overcutting'],
    referenceCount: 0,
    targetPlatform: inferTargetPlatform(goal, input.targetPlatform),
    targetDurationRange: [Math.max(5, targetDuration - 3), targetDuration + 3],
  };
}

export function mergeBlueprintWithAudio(
  blueprint: EditingBlueprint,
  audioPlan?: PremiereEditPlan,
): EditingBlueprint {
  if (!audioPlan) {
    return blueprint;
  }

  const transitionPattern =
    audioPlan.style === 'cut_on_beat'
      ? ['hard_cut', 'beat_cut']
      : audioPlan.style === 'drum_punch'
        ? ['hard_cut', 'impact_hit']
        : blueprint.transitionPattern;

  return {
    ...blueprint,
    musicBeatStrategy: audioPlan.style,
    transitionPattern,
  };
}

function defaultSequenceName(input: AgentExecutionInput): string {
  if (input.sequenceName?.trim()) {
    return input.sequenceName.trim();
  }
  return path
    .basename(input.goal)
    .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
    .trim()
    .slice(0, 48) || 'Video Agent Sequence';
}

export function buildExecutionPlan(input: AgentExecutionInput): PlannedTaskShape {
  const scenario = inferScenario(input);
  const premiereScenario = mapPremiereScenario(scenario, input);
  const warnings: string[] = [];
  const plan: AgentStep[] = [];

  const canRunResearch =
    (input.referenceCandidates?.length ?? 0) > 0 &&
    (input.referenceAssets?.length ?? 0) > 0;

  if (input.researchQuery && !canRunResearch && !input.researchTaskDir && !input.editingBlueprintPath) {
    warnings.push('提供了 researchQuery，但缺少 referenceCandidates/referenceAssets，已回退为 prompt 蓝图。');
  }

  if (input.editingBlueprintPath) {
    plan.push({
      id: 'load-blueprint',
      title: '载入现成蓝图',
      action: 'use_existing_blueprint',
      mcp: 'agent',
      phase: 'planning',
      status: 'pending',
      dependsOn: [],
      input: {
        editingBlueprintPath: input.editingBlueprintPath,
      },
      retryCount: 0,
      maxRetries: 0,
    });
  } else if (input.researchTaskDir) {
    plan.push({
      id: 'reuse-research-task',
      title: '复用现成 research task',
      action: 'use_existing_research_task',
      mcp: 'agent',
      phase: 'planning',
      status: 'pending',
      dependsOn: [],
      input: {
        researchTaskDir: input.researchTaskDir,
      },
      retryCount: 0,
      maxRetries: 0,
    });
  } else if (canRunResearch) {
    plan.push({
      id: 'reference-research',
      title: '从参考素材生成风格蓝图',
      action: 'build_reference_blueprint',
      mcp: 'video-research',
      phase: 'research',
      status: 'pending',
      dependsOn: [],
      input: {
        goal: input.goal,
        researchQuery: input.researchQuery,
        referenceCandidates: input.referenceCandidates ?? [],
        referenceAssets: input.referenceAssets ?? [],
        targetDurationSec: inferDuration(input.goal, input.targetDurationSec),
        targetPlatform: inferTargetPlatform(input.goal, input.targetPlatform),
      },
      retryCount: 0,
      maxRetries: 0,
    });
  } else {
    plan.push({
      id: 'prompt-blueprint',
      title: '从目标推导初始蓝图',
      action: 'derive_prompt_blueprint',
      mcp: 'agent',
      phase: 'planning',
      status: 'pending',
      dependsOn: [],
      input: {
        goal: input.goal,
        targetDurationSec: inferDuration(input.goal, input.targetDurationSec),
        targetPlatform: inferTargetPlatform(input.goal, input.targetPlatform),
        sequenceName: defaultSequenceName(input),
      },
      retryCount: 0,
      maxRetries: 0,
    });
  }

  if (input.bgmPath) {
    plan.push({
      id: 'audio-plan',
      title: '分析 BGM 并生成节拍计划',
      action: 'analyze_music_plan',
      mcp: 'audio-beat',
      phase: 'audio',
      status: 'pending',
      dependsOn: [],
      input: {
        bgmPath: input.bgmPath,
      },
      retryCount: 0,
      maxRetries: 0,
    });
  }

  const blueprintDependsOn = plan
    .filter((step) =>
      ['load-blueprint', 'reference-research', 'prompt-blueprint', 'audio-plan'].includes(step.id),
    )
    .map((step) => step.id);

  if (!input.researchTaskDir || input.bgmPath) {
    plan.push({
      id: 'compose-blueprint',
      title: '整理统一 editing blueprint',
      action: 'compose_editing_blueprint',
      mcp: 'agent',
      phase: 'planning',
      status: 'pending',
      dependsOn: blueprintDependsOn,
      input: {
        goal: input.goal,
      },
      retryCount: 0,
      maxRetries: 0,
    });
  }

  const assembleDependsOn = plan
    .filter((step) => ['reuse-research-task', 'compose-blueprint'].includes(step.id))
    .map((step) => step.id);

  plan.push({
    id: 'assemble',
    title: '执行 Premiere 闭环装配',
    action: 'assemble_product_spot_closed_loop',
    mcp: 'premiere',
    phase: 'editing',
    status: 'pending',
    dependsOn: assembleDependsOn,
    input: {
      goal: input.goal,
      sequenceName: defaultSequenceName(input),
      assetPaths: input.assetPaths ?? [],
      docxPath: input.docxPath,
      mediaManifestPath: input.mediaManifestPath,
      subtitleSourcePath: input.subtitleSourcePath,
      subtitleLanguage: input.subtitleLanguage,
      bgmPath: input.bgmPath,
    },
    retryCount: 0,
    maxRetries: 1,
  });

  plan.push({
    id: 'critic',
    title: '审查成片结果',
    action: 'critic_edit_result',
    mcp: 'premiere',
    phase: 'review',
    status: 'pending',
    dependsOn: ['assemble'],
    input: {
      goal: input.goal,
      scenario: premiereScenario,
    },
    retryCount: 0,
    maxRetries: 0,
  });

  const successCriteria = [
    '存在可用的 editing blueprint 或 research task',
    'Premiere 闭环装配成功返回',
    'critic_edit_result 通过',
  ];

  return {
    scenario,
    premiereScenario,
    successCriteria,
    warnings,
    plan,
  };
}
