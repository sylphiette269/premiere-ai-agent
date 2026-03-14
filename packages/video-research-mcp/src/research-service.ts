import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

import { TaskStore } from './cache/task-store.js';
import { aggregateBlueprint } from './research/blueprint.js';
import { parseCaptionAnalysis } from './research/captions.js';
import { probeMediaWithFfprobe } from './research/media-probe.js';
import { searchBingHtmlResults } from './search/bing-html.js';
import type {
  AggregatedBlueprint,
  IngestAssetInput,
  ManagedReferenceAsset,
  MediaProbeResult,
  RankedReferenceCandidate,
  ReferenceCandidate,
  ReferenceSet,
  ReferenceSignal,
  ResearchPlatform,
  ResearchServiceOptions,
} from './types.js';

function defaultCacheDir(): string {
  return path.resolve(process.env.VIDEO_RESEARCH_CACHE_DIR ?? path.join(process.cwd(), 'research-cache'));
}

function createTaskId(goal: string): string {
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'research-task';
  return `${slug}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function averageShotDuration(durationSeconds: number, sceneCount?: number): number {
  const effectiveSceneCount = sceneCount && sceneCount > 0
    ? sceneCount
    : Math.max(1, Math.round(durationSeconds / 1.5));
  return Number((durationSeconds / effectiveSceneCount).toFixed(2));
}

function pacingFromShotDuration(value: number): 'fast' | 'medium' | 'slow' {
  if (value <= 1.5) return 'fast';
  if (value <= 3) return 'medium';
  return 'slow';
}

function subtitleMetrics(durationSeconds: number, captionText: string, cueCount: number) {
  if (!captionText.trim() || durationSeconds <= 0) {
    return {
      subtitleStyle: 'unknown' as const,
      subtitleDensityPerMinute: 0,
    };
  }

  const subtitleDensityPerMinute = Number(((cueCount / durationSeconds) * 60).toFixed(2));
  const charactersPerMinute = (captionText.length / durationSeconds) * 60;
  return {
    subtitleStyle:
      subtitleDensityPerMinute >= 10 || charactersPerMinute >= 120
        ? 'caption_heavy' as const
        : 'caption_light' as const,
    subtitleDensityPerMinute,
  };
}

function hookStyleFromCaption(captionText: string): 'direct_hook' | 'visual_hook' {
  return captionText.trim().length > 0 ? 'direct_hook' : 'visual_hook';
}

function transitionStyleFromSceneRate(durationSeconds: number, sceneCount?: number): 'hard_cut' | 'mixed' | 'slow_mix' {
  const rate = sceneCount && durationSeconds > 0 ? sceneCount / durationSeconds : 0;
  if (rate >= 0.8) return 'hard_cut';
  if (rate >= 0.35) return 'mixed';
  return 'slow_mix';
}

function ctaPatternFromCaption(captionText: string): 'end_screen' | 'spoken_prompt' | 'none' {
  if (/(cta|点赞|关注|评论|收藏|转发|私信|点击|下期)/i.test(captionText)) {
    return 'end_screen';
  }
  if (/(说|讲|旁白|口播)/i.test(captionText)) {
    return 'spoken_prompt';
  }
  return 'none';
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export class ResearchService {
  private readonly store: TaskStore;
  private readonly fetchImpl: typeof fetch;
  private readonly probeMedia: (filePath: string) => Promise<MediaProbeResult>;

  constructor(options: ResearchServiceOptions = {}) {
    this.store = new TaskStore(path.resolve(options.cacheDir ?? defaultCacheDir()));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.probeMedia = options.probeMedia ?? probeMediaWithFfprobe;
  }

  async searchReferenceCandidates(input: {
    query: string;
    platforms: ResearchPlatform[];
    limit: number;
  }): Promise<{ candidates: ReferenceCandidate[] }> {
    const candidates: ReferenceCandidate[] = [];

    for (const platform of input.platforms) {
      const query = platform === 'bilibili'
        ? `site:www.bilibili.com/video ${input.query}`
        : `site:www.douyin.com/video ${input.query}`;
      const response = await this.fetchImpl(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${input.limit}`,
        {
          headers: { 'user-agent': 'video-research-mcp/0.1 (+https://local.tooling)' },
        },
      );
      if (!response.ok) {
        throw new Error(`Bing search failed for ${platform}: ${response.status} ${response.statusText}`);
      }
      const html = await response.text();
      candidates.push(
        ...searchBingHtmlResults({
          html,
          platform,
          query: input.query,
          limit: input.limit,
        }),
      );
    }

    return { candidates: candidates.slice(0, input.limit) };
  }

  rankReferenceCandidates(input: {
    goal: string;
    candidates: ReferenceCandidate[];
    preferredPlatforms?: ResearchPlatform[];
  }): { ranked: RankedReferenceCandidate[] } {
    const keywords = input.goal
      .toLowerCase()
      .split(/[\s,，。！？]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);

    const ranked = input.candidates.map((candidate) => {
      let score = 100 - ((candidate.searchRank ?? 10) - 1) * 6;
      const reasons: string[] = [];
      const text = `${candidate.title} ${candidate.snippet ?? ''}`.toLowerCase();
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          score += 8;
          reasons.push(`标题或摘要包含关键词 ${keyword}`);
        }
      }
      if (input.preferredPlatforms?.includes(candidate.platform)) {
        score += 10;
        reasons.push(`命中优先平台 ${candidate.platform}`);
      }
      if (candidate.searchRank) {
        reasons.push(`搜索位次 ${candidate.searchRank}`);
      }
      return { ...candidate, score, reasons };
    });

    ranked.sort((left, right) => right.score - left.score);
    return { ranked };
  }

  async confirmReferenceSet(input: {
    goal: string;
    query?: string;
    selectedCandidates: ReferenceCandidate[];
  }): Promise<{ taskId: string; taskPath: string; referenceSet: ReferenceSet }> {
    const taskId = createTaskId(input.goal);
    const taskPath = await this.store.ensureTask(taskId);
    const referenceSet: ReferenceSet = {
      taskId,
      goal: input.goal,
      query: input.query,
      selected: input.selectedCandidates,
      confirmedAt: new Date().toISOString(),
    };
    await this.store.writeJson(taskId, 'candidates.json', referenceSet);
    return { taskId, taskPath, referenceSet };
  }

  async ingestReferenceAssets(input: {
    taskId: string;
    assets: IngestAssetInput[];
  }): Promise<{ taskId: string; assets: ManagedReferenceAsset[]; assetsPath: string }> {
    const referenceSet = await this.store.readJson<ReferenceSet>(input.taskId, 'candidates.json');
    const managedAssets: ManagedReferenceAsset[] = [];

    for (const asset of input.assets) {
      const candidate = referenceSet.selected.find((item) => item.id === asset.candidateId);
      if (!candidate) {
        throw new Error(`Candidate '${asset.candidateId}' is not part of task '${input.taskId}'.`);
      }
      const extension = path.extname(asset.localPath) || '.mp4';
      const managedPath = path.join(this.store.rawDir(input.taskId), `${candidate.id}${extension}`);
      await ensureParentDir(managedPath);
      await copyFile(asset.localPath, managedPath);
      managedAssets.push({
        candidateId: candidate.id,
        platform: candidate.platform,
        title: candidate.title,
        sourceUrl: candidate.url,
        originalPath: asset.localPath,
        managedPath,
        captionPath: asset.captionPath,
        copiedAt: new Date().toISOString(),
        cleanupPolicy: 'delete_managed_copy_after_extract',
        status: 'ready',
      });
    }

    const assetsPath = await this.store.writeJson(input.taskId, 'assets.json', {
      taskId: input.taskId,
      assets: managedAssets,
    });

    return { taskId: input.taskId, assets: managedAssets, assetsPath };
  }

  async extractReferenceSignals(input: {
    taskId: string;
    cleanupManagedRawCopies: boolean;
  }): Promise<{ taskId: string; signals: ReferenceSignal[]; signalsPath: string }> {
    const assetsPayload = await this.store.readJson<{ assets: ManagedReferenceAsset[] }>(
      input.taskId,
      'assets.json',
    );
    const signals: ReferenceSignal[] = [];

    for (const asset of assetsPayload.assets) {
      const probe = await this.probeMedia(asset.managedPath);
      const captions = await parseCaptionAnalysis(asset.originalPath, asset.captionPath);
      const shotDuration = averageShotDuration(probe.durationSeconds, probe.sceneCount);
      const subtitle = subtitleMetrics(probe.durationSeconds, captions?.text ?? '', captions?.cues.length ?? 0);

      signals.push({
        candidateId: asset.candidateId,
        platform: asset.platform,
        title: asset.title,
        sourceUrl: asset.sourceUrl,
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        sceneCount: probe.sceneCount,
        averageShotDuration: shotDuration,
        pacing: pacingFromShotDuration(shotDuration),
        hookStyle: hookStyleFromCaption(captions?.text ?? ''),
        subtitleStyle: subtitle.subtitleStyle,
        subtitleDensityPerMinute: subtitle.subtitleDensityPerMinute,
        transitionStyle: transitionStyleFromSceneRate(probe.durationSeconds, probe.sceneCount),
        ctaPattern: ctaPatternFromCaption(captions?.text ?? ''),
        signalSources: ['media_probe', ...(captions ? ['caption_sidecar'] : [])],
      });

      if (captions) {
        const captionsPath = path.join(this.store.derivedDir(input.taskId), `${asset.candidateId}.captions.json`);
        await writeFile(captionsPath, `${JSON.stringify(captions, null, 2)}\n`, 'utf8');
      }
    }

    if (input.cleanupManagedRawCopies) {
      for (const asset of assetsPayload.assets) {
        await rm(asset.managedPath, { force: true });
        asset.managedPathDeleted = true;
        asset.status = 'analyzed';
      }
      await this.store.writeJson(input.taskId, 'assets.json', assetsPayload);
    }

    const signalsPath = await this.store.writeJson(input.taskId, 'signals.json', {
      taskId: input.taskId,
      signals,
    });
    return { taskId: input.taskId, signals, signalsPath };
  }

  async aggregateStyleBlueprint(input: {
    taskId: string;
    targetPlatform?: string;
    targetDurationSeconds?: number;
  }): Promise<{ taskId: string; blueprint: AggregatedBlueprint; blueprintPath: string }> {
    const signalsPayload = await this.store.readJson<{ signals: ReferenceSignal[] }>(
      input.taskId,
      'signals.json',
    );
    const blueprint = aggregateBlueprint({
      signals: signalsPayload.signals,
      targetPlatform: input.targetPlatform,
      targetDurationSeconds: input.targetDurationSeconds,
    });
    const blueprintPath = await this.store.writeJson(input.taskId, 'blueprint.json', blueprint);
    return { taskId: input.taskId, blueprint, blueprintPath };
  }
}

export function createResearchService(options: ResearchServiceOptions = {}): ResearchService {
  return new ResearchService(options);
}
