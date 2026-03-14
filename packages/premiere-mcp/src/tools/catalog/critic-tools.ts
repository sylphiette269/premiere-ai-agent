import { z } from 'zod';

import type { EditingBlueprint } from './agent-orchestration.types.js';
import type {
  CriticInput,
  CriticResult,
  TimelineSnapshot,
} from './critic-tools.types.js';

type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
};

export const criticEditResultInputSchema = z.object({
  goal: z.string().min(1),
  scenario: z.enum([
    'natural_language',
    'docx_guided',
    'reference_video',
    'viral_style',
  ]),
  sequenceId: z.string().optional(),
  blueprint: z.any().optional(),
  editingBlueprintPath: z.string().optional(),
  successCriteria: z.array(z.string()).optional(),
  timelineData: z.any().optional(),
});

export const compareResultToBlueprintInputSchema = z.object({
  sequenceId: z.string().optional(),
  blueprint: z.any().optional(),
  editingBlueprintPath: z.string().optional(),
  timelineData: z.any().optional(),
});

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function runStructureChecks(
  timeline: TimelineSnapshot,
  findings: string[],
  actionableFixes: string[],
  failedCriteria: string[],
  passedCriteria: string[],
  dimensions: CriticResult['critic']['dimensions'],
) {
  if (timeline.videoClips.length === 0) {
    findings.push('时间线上没有视频 clip');
    failedCriteria.push('至少存在 1 个视频 clip');
    dimensions.structure = 0;
    return;
  }
  passedCriteria.push('存在视频 clip');

  if (timeline.audioClips.length === 0) {
    findings.push('时间线上没有音频');
    actionableFixes.push('添加背景音乐或关键音效');
    dimensions.structure = clamp(dimensions.structure - 15);
  }

  const hasHook = timeline.videoClips.some((clip) => clip.startTime < 3);
  if (!hasHook) {
    findings.push('前 3 秒没有视频内容，缺少 hook');
    actionableFixes.push('在 0-3 秒放入高信息密度镜头或标题');
    failedCriteria.push('存在 hook 段落');
    dimensions.structure = clamp(dimensions.structure - 20);
  } else {
    passedCriteria.push('存在 hook 段落');
  }

  const sortedClips = [...timeline.videoClips].sort((left, right) => left.startTime - right.startTime);
  for (let index = 1; index < sortedClips.length; index += 1) {
    const gap = sortedClips[index].startTime - sortedClips[index - 1].endTime;
    if (gap > 0.5) {
      findings.push(
        `视频轨道在 ${sortedClips[index - 1].endTime.toFixed(1)}s - ${sortedClips[index].startTime.toFixed(1)}s 存在空洞`,
      );
      actionableFixes.push(
        `填补 ${sortedClips[index - 1].endTime.toFixed(1)}s 之后的时间线空洞`,
      );
      dimensions.structure = clamp(dimensions.structure - 10);
    }
  }
}

function runPacingChecks(
  timeline: TimelineSnapshot,
  input: CriticInput,
  findings: string[],
  actionableFixes: string[],
  failedCriteria: string[],
  passedCriteria: string[],
  dimensions: CriticResult['critic']['dimensions'],
) {
  const clips = timeline.videoClips;
  if (clips.length < 2) {
    return;
  }

  const durations = clips.map((clip) => clip.duration);
  const averageDuration =
    durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const variance =
    durations.reduce((sum, duration) => sum + (duration - averageDuration) ** 2, 0) /
    durations.length;

  if (input.scenario === 'viral_style') {
    if (averageDuration > 2) {
      findings.push(
        `镜头平均时长 ${averageDuration.toFixed(1)}s 过长，不符合快节奏要求`,
      );
      actionableFixes.push('缩短镜头时长，尤其是前 5 秒镜头');
      failedCriteria.push('镜头平均时长符合快节奏要求');
      dimensions.pacing = clamp(dimensions.pacing - 30);
    } else {
      passedCriteria.push('镜头平均时长符合快节奏要求');
    }
  }

  if (variance < 0.3 && clips.length > 3) {
    findings.push(`镜头时长方差仅 ${variance.toFixed(2)}，节奏过于平均`);
    actionableFixes.push('加入短镜头组和节奏变化段落');
    dimensions.pacing = clamp(dimensions.pacing - 20);
  }

  if (input.scenario === 'viral_style') {
    const shortClips = clips.filter((clip) => clip.duration < averageDuration * 0.6);
    if (clips.length > 5 && shortClips.length < 2) {
      findings.push('缺少节奏高潮段落（一组连续短镜头）');
      actionableFixes.push('在 60%-80% 区间插入 3-5 个快速剪切镜头');
      failedCriteria.push('存在节奏高潮段落');
      dimensions.pacing = clamp(dimensions.pacing - 15);
    } else if (clips.length > 5) {
      passedCriteria.push('存在节奏高潮段落');
    }
  }
}

function runTransitionChecks(
  timeline: TimelineSnapshot,
  input: CriticInput,
  findings: string[],
  actionableFixes: string[],
  failedCriteria: string[],
  passedCriteria: string[],
  dimensions: CriticResult['critic']['dimensions'],
) {
  const transitions = timeline.transitions;
  if (transitions.length === 0) {
    if (timeline.videoClips.length > 1 && input.scenario !== 'viral_style') {
      findings.push('没有设置任何转场效果');
      actionableFixes.push('根据风格补充必要转场');
    }
    return;
  }

  const typeCounts = transitions.reduce<Record<string, number>>((counts, transition) => {
    const key = transition.type.toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const total = transitions.length;
  const crossCount =
    (typeCounts['cross dissolve'] ?? 0) +
    (typeCounts['crossdissolve'] ?? 0) +
    (typeCounts['cross_dissolve'] ?? 0);
  const crossRatio = total > 0 ? crossCount / total : 0;

  if (input.scenario === 'viral_style' && crossRatio > 0.3) {
    findings.push(
      `Cross dissolve 占比 ${(crossRatio * 100).toFixed(0)}%（${crossCount}/${total}），超过 30% 上限`,
    );
    actionableFixes.push('减少 cross dissolve，增加 hard cut、beat cut、zoom cut');
    failedCriteria.push('cross dissolve 占比不超过 30%');
    dimensions.transitions = clamp(dimensions.transitions - 30);
  } else if (total > 0) {
    passedCriteria.push('转场多样性达标');
  }

  if (Object.keys(typeCounts).length === 1 && total > 2) {
    findings.push(`所有 ${total} 个转场都是同一种类型，过于单一`);
    actionableFixes.push('至少使用 2-3 种不同的转场策略');
    dimensions.transitions = clamp(dimensions.transitions - 20);
  }
}

function runStyleFitChecks(
  timeline: TimelineSnapshot,
  blueprint: EditingBlueprint,
  findings: string[],
  actionableFixes: string[],
  dimensions: CriticResult['critic']['dimensions'],
) {
  if (timeline.videoClips.length === 0) {
    return;
  }

  const averageDuration =
    timeline.videoClips.reduce((sum, clip) => sum + clip.duration, 0) /
    timeline.videoClips.length;
  const durationDiff = Math.abs(averageDuration - blueprint.averageShotDuration);
  if (durationDiff > 1) {
    findings.push(
      `镜头平均时长 ${averageDuration.toFixed(1)}s 偏离蓝图目标 ${blueprint.averageShotDuration}s`,
    );
    actionableFixes.push(
      `调整镜头时长，靠近蓝图目标 ${blueprint.averageShotDuration}s`,
    );
    dimensions.styleFit = clamp(dimensions.styleFit - 20);
  }

  const actualTransitions = [...new Set(timeline.transitions.map((transition) => transition.type.toLowerCase()))];
  const preferredTransitions = blueprint.transitionPattern.map((transition) => transition.toLowerCase());
  const matched = preferredTransitions.filter((preferred) =>
    actualTransitions.some((actual) => actual.includes(preferred)),
  );
  if (preferredTransitions.length > 0 && matched.length === 0) {
    findings.push(`未使用蓝图推荐转场: ${blueprint.transitionPattern.join(', ')}`);
    actionableFixes.push(`增加蓝图推荐转场: ${blueprint.transitionPattern.join(', ')}`);
    dimensions.styleFit = clamp(dimensions.styleFit - 25);
  }

  for (const avoidPattern of blueprint.avoidPatterns) {
    const normalized = avoidPattern.toLowerCase();
    if (normalized.includes('cross_dissolve')) {
      const crossCount = timeline.transitions.filter((transition) =>
        transition.type.toLowerCase().includes('cross'),
      ).length;
      if (timeline.transitions.length > 0 && crossCount / timeline.transitions.length > 0.3) {
        findings.push(`蓝图要求避免 "${avoidPattern}"，但实际仍大量使用`);
        actionableFixes.push(`降低 ${avoidPattern} 使用比例`);
        dimensions.styleFit = clamp(dimensions.styleFit - 15);
      }
    }
  }

  if (
    blueprint.hookStyle &&
    (blueprint.hookStyle.includes('text') || blueprint.hookStyle.includes('字幕'))
  ) {
    const hasHookText = timeline.textLayers.some((layer) => layer.startTime < 3);
    if (!hasHookText) {
      findings.push('蓝图要求 hook 含文字，但前 3 秒没有文字层');
      actionableFixes.push('在 hook 段落添加文字层');
      dimensions.styleFit = clamp(dimensions.styleFit - 10);
    }
  }
}

function runTechnicalChecks(
  timeline: TimelineSnapshot,
  findings: string[],
  actionableFixes: string[],
  dimensions: CriticResult['critic']['dimensions'],
) {
  const sortedClips = [...timeline.videoClips].sort((left, right) => left.startTime - right.startTime);
  for (let index = 1; index < sortedClips.length; index += 1) {
    if (sortedClips[index].trackIndex !== sortedClips[index - 1].trackIndex) {
      continue;
    }
    const overlap = sortedClips[index - 1].endTime - sortedClips[index].startTime;
    if (overlap > 0.1) {
      findings.push(
        `同一轨道 clip 重叠 ${overlap.toFixed(1)}s (位置 ${sortedClips[index].startTime.toFixed(1)}s)`,
      );
      actionableFixes.push('移除同轨道 clip 重叠');
      dimensions.technicalQuality = clamp(dimensions.technicalQuality - 15);
    }
  }

  if (timeline.audioClips.length > 0 && timeline.videoClips.length > 0) {
    const videoEnd = Math.max(...timeline.videoClips.map((clip) => clip.endTime));
    const audioEnd = Math.max(...timeline.audioClips.map((clip) => clip.endTime));
    if (videoEnd - audioEnd > 1) {
      findings.push(`音频比视频短 ${(videoEnd - audioEnd).toFixed(1)}s，结尾可能无声`);
      actionableFixes.push('延长音频或缩短视频，使音视频时长对齐');
      dimensions.technicalQuality = clamp(dimensions.technicalQuality - 10);
    }
  }

  if (timeline.totalDuration < 3) {
    findings.push(`视频总时长仅 ${timeline.totalDuration.toFixed(1)}s，可能过短`);
    dimensions.technicalQuality = clamp(dimensions.technicalQuality - 20);
  }
}

export function criticEditResult(input: CriticInput): CriticResult {
  const findings: string[] = [];
  const actionableFixes: string[] = [];
  const failedCriteria: string[] = [];
  const passedCriteria: string[] = [];
  const dimensions = {
    structure: 100,
    pacing: 100,
    transitions: 100,
    styleFit: 100,
    technicalQuality: 100,
  };

  if (!input.timelineData) {
    return {
      ok: true,
      critic: {
        passed: false,
        score: 0,
        findings: ['无法获取时间线数据，无法审稿'],
        actionableFixes: ['请提供 timelineData 或 sequenceId'],
        failedCriteria: ['时间线数据可用'],
        passedCriteria: [],
        dimensions: {
          structure: 0,
          pacing: 0,
          transitions: 0,
          styleFit: 0,
          technicalQuality: 0,
        },
      },
    };
  }

  if (input.timelineData.videoClips.length === 0) {
    return {
      ok: true,
      critic: {
        passed: false,
        score: 0,
        findings: ['时间线上没有视频 clip'],
        actionableFixes: ['先完成基础装配，再进行 critic 审稿'],
        failedCriteria: ['至少存在 1 个视频 clip'],
        passedCriteria: [],
        dimensions: {
          structure: 0,
          pacing: 0,
          transitions: 0,
          styleFit: 0,
          technicalQuality: 0,
        },
      },
    };
  }

  runStructureChecks(
    input.timelineData,
    findings,
    actionableFixes,
    failedCriteria,
    passedCriteria,
    dimensions,
  );
  runPacingChecks(
    input.timelineData,
    input,
    findings,
    actionableFixes,
    failedCriteria,
    passedCriteria,
    dimensions,
  );
  runTransitionChecks(
    input.timelineData,
    input,
    findings,
    actionableFixes,
    failedCriteria,
    passedCriteria,
    dimensions,
  );
  if (input.blueprint) {
    runStyleFitChecks(
      input.timelineData,
      input.blueprint,
      findings,
      actionableFixes,
      dimensions,
    );
  }
  runTechnicalChecks(
    input.timelineData,
    findings,
    actionableFixes,
    dimensions,
  );

  const weights = {
    structure: 0.2,
    pacing: 0.25,
    transitions: 0.2,
    styleFit: 0.2,
    technicalQuality: 0.15,
  } as const;
  const score = Math.round(
    Object.entries(weights).reduce((sum, [key, weight]) => {
      const dimension = dimensions[key as keyof typeof dimensions];
      return sum + dimension * weight;
    }, 0),
  );
  const passed = score >= 60 && failedCriteria.length === 0;

  return {
    ok: true,
    critic: {
      passed,
      score,
      findings,
      actionableFixes,
      failedCriteria,
      passedCriteria,
      dimensions,
    },
  };
}

export function compareResultToBlueprint(
  timeline: TimelineSnapshot,
  blueprint: EditingBlueprint,
): {
  ok: true;
  comparison: {
    adherentItems: string[];
    deviations: string[];
    suggestions: string[];
    adherenceScore: number;
  };
} {
  const adherentItems: string[] = [];
  const deviations: string[] = [];
  const suggestions: string[] = [];
  let adherenceScore = 100;

  if (timeline.videoClips.length > 0) {
    const averageDuration =
      timeline.videoClips.reduce((sum, clip) => sum + clip.duration, 0) /
      timeline.videoClips.length;
    if (Math.abs(averageDuration - blueprint.averageShotDuration) <= 0.5) {
      adherentItems.push(
        `镜头平均时长 ${averageDuration.toFixed(1)}s 接近蓝图目标 ${blueprint.averageShotDuration}s`,
      );
    } else {
      deviations.push(
        `镜头平均时长 ${averageDuration.toFixed(1)}s 偏离蓝图目标 ${blueprint.averageShotDuration}s`,
      );
      suggestions.push(`调整镜头时长至 ${blueprint.averageShotDuration}s 附近`);
      adherenceScore -= 15;
    }
  }

  const blueprintTransitions = blueprint.transitionPattern.map((transition) => transition.toLowerCase());
  const actualTransitions = [...new Set(timeline.transitions.map((transition) => transition.type.toLowerCase()))];
  const matchedTransitions = blueprintTransitions.filter((transition) =>
    actualTransitions.some((actual) => actual.includes(transition)),
  );
  if (blueprintTransitions.length === 0 || matchedTransitions.length >= blueprintTransitions.length * 0.5) {
    adherentItems.push(`使用了蓝图推荐的转场: ${matchedTransitions.join(', ') || 'implicit cuts'}`);
  } else {
    deviations.push(`未充分使用蓝图推荐转场 (使用 ${matchedTransitions.length}/${blueprintTransitions.length})`);
    suggestions.push(
      `增加以下转场: ${blueprintTransitions.filter((transition) => !matchedTransitions.includes(transition)).join(', ')}`,
    );
    adherenceScore -= 20;
  }

  if (blueprint.targetDurationRange) {
    const [minDuration, maxDuration] = blueprint.targetDurationRange;
    if (timeline.totalDuration >= minDuration && timeline.totalDuration <= maxDuration) {
      adherentItems.push(
        `总时长 ${timeline.totalDuration.toFixed(1)}s 在目标范围 [${minDuration}, ${maxDuration}] 内`,
      );
    } else {
      deviations.push(
        `总时长 ${timeline.totalDuration.toFixed(1)}s 超出目标范围 [${minDuration}, ${maxDuration}]`,
      );
      suggestions.push(`调整总时长至 ${minDuration}-${maxDuration}s`);
      adherenceScore -= 15;
    }
  }

  for (const avoidPattern of blueprint.avoidPatterns) {
    const violated = actualTransitions.some((transition) =>
      transition.includes(avoidPattern.toLowerCase()),
    );
    if (violated) {
      deviations.push(`使用了蓝图要求避免的模式: ${avoidPattern}`);
      suggestions.push(`移除或替换 "${avoidPattern}"`);
      adherenceScore -= 10;
    } else {
      adherentItems.push(`未使用蓝图要求避免的 "${avoidPattern}"`);
    }
  }

  return {
    ok: true,
    comparison: {
      adherentItems,
      deviations,
      suggestions,
      adherenceScore: Math.max(0, adherenceScore),
    },
  };
}

export function createCriticToolCatalogSnapshot(): ToolCatalogEntry[] {
  return [
    {
      name: 'critic_edit_result',
      description: '独立审稿工具：检查编辑结果是否符合目标、风格与技术标准。',
      inputSchema: criticEditResultInputSchema,
    },
    {
      name: 'compare_result_to_blueprint',
      description: '将当前结果与 EditingBlueprint 对比，输出偏离项与修正建议。',
      inputSchema: compareResultToBlueprintInputSchema,
    },
  ];
}
