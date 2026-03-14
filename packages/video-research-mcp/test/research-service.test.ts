import assert from 'node:assert/strict';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createResearchService } from '../src/research-service.js';
import type { MediaProbeResult } from '../src/types.js';

const probeMap = new Map<string, MediaProbeResult>([
  ['ref-1.mp4', { durationSeconds: 12, width: 1080, height: 1920, sceneCount: 14 }],
  ['ref-2.mp4', { durationSeconds: 9, width: 1080, height: 1920, sceneCount: 10 }],
  ['ref-3.mp4', { durationSeconds: 15, width: 1080, height: 1920, sceneCount: 16 }],
]);

test('research service ingests local references, extracts signals, aggregates blueprint, and deletes managed raw copies', async () => {
  const sandbox = await mkdir(path.join(os.tmpdir(), `video-research-mcp-${Date.now()}`), { recursive: true });
  const sourcesDir = path.join(sandbox, 'sources');
  const cacheDir = path.join(sandbox, 'cache');

  await mkdir(sourcesDir, { recursive: true });
  await writeFile(path.join(sourcesDir, 'sample-1.mp4'), 'video-1');
  await writeFile(path.join(sourcesDir, 'sample-2.mp4'), 'video-2');
  await writeFile(path.join(sourcesDir, 'sample-3.mp4'), 'video-3');
  await writeFile(
    path.join(sourcesDir, 'sample-1.srt'),
    `1
00:00:00,000 --> 00:00:02,000
第一句强钩子

2
00:00:02,000 --> 00:00:04,000
第二句继续推进

3
00:00:04,000 --> 00:00:06,000
第三句结尾 CTA
`,
  );

  const service = createResearchService({
    cacheDir,
    probeMedia: async (filePath) => {
      const result = probeMap.get(path.basename(filePath));
      assert.ok(result, `missing probe fixture for ${path.basename(filePath)}`);
      return result;
    },
  });

  const confirmed = await service.confirmReferenceSet({
    goal: '做一个抖音高燃漫剪视频',
    query: '高燃漫剪',
    selectedCandidates: [
      {
        id: 'ref-1',
        platform: 'bilibili',
        title: '高燃漫剪模板一',
        url: 'https://www.bilibili.com/video/BV1xx411c7mD',
        searchRank: 1,
      },
      {
        id: 'ref-2',
        platform: 'douyin',
        title: '抖音卡点参考二',
        url: 'https://www.douyin.com/video/7469999999999999999',
        searchRank: 2,
      },
      {
        id: 'ref-3',
        platform: 'bilibili',
        title: '高燃漫剪模板三',
        url: 'https://www.bilibili.com/video/BV1yy411c7mE',
        searchRank: 3,
      },
    ],
  });

  assert.equal(confirmed.referenceSet.selected.length, 3);
  assert.ok(confirmed.taskPath.endsWith(confirmed.taskId));

  const ingested = await service.ingestReferenceAssets({
    taskId: confirmed.taskId,
    assets: [
      { candidateId: 'ref-1', localPath: path.join(sourcesDir, 'sample-1.mp4') },
      { candidateId: 'ref-2', localPath: path.join(sourcesDir, 'sample-2.mp4') },
      { candidateId: 'ref-3', localPath: path.join(sourcesDir, 'sample-3.mp4') },
    ],
  });

  assert.equal(ingested.assets.length, 3);
  await stat(ingested.assets[0]!.managedPath);

  const extracted = await service.extractReferenceSignals({
    taskId: confirmed.taskId,
    cleanupManagedRawCopies: true,
  });

  assert.equal(extracted.signals.length, 3);
  assert.equal(extracted.signals[0]!.subtitleStyle, 'caption_heavy');
  assert.equal(extracted.signals[0]!.transitionStyle, 'hard_cut');
  assert.equal(extracted.signals[0]!.ctaPattern, 'end_screen');

  await assert.rejects(() => access(ingested.assets[0]!.managedPath));
  await stat(path.join(sourcesDir, 'sample-1.mp4'));

  const aggregated = await service.aggregateStyleBlueprint({
    taskId: confirmed.taskId,
    targetPlatform: 'douyin',
    targetDurationSeconds: 25,
  });

  assert.equal(aggregated.blueprint.referenceCount, 3);
  assert.equal(aggregated.blueprint.targetPlatform, 'douyin');
  assert.equal(aggregated.blueprint.textOverlayStyle, 'caption_heavy');
  assert.equal(aggregated.blueprint.transitionPattern[0], 'hard_cut');
  assert.equal(aggregated.blueprint.targetDurationRange?.[0], 20);
  assert.equal(aggregated.blueprint.targetDurationRange?.[1], 30);

  const savedBlueprint = JSON.parse(
    await readFile(path.join(cacheDir, confirmed.taskId, 'blueprint.json'), 'utf8'),
  ) as { referenceCount: number };
  assert.equal(savedBlueprint.referenceCount, 3);
});
