import { matchAssetsToBlueprint } from '../../video-reference-matcher.js';
import type { MediaFolderManifest } from '../../media-folder-manifest.js';
import type { VideoBlueprint } from '../../video-reference-analyzer.js';

function createBlueprint(shots: VideoBlueprint['shots']): VideoBlueprint {
  return {
    sourcePath: 'E:/reference/demo.mp4',
    totalDuration: shots.reduce((sum, shot) => sum + shot.durationSec, 0),
    estimatedFrameRate: 25,
    shots,
    pacing: {
      avgShotDurationSec: shots.reduce((sum, shot) => sum + shot.durationSec, 0) / Math.max(shots.length, 1),
      minShotDurationSec: Math.min(...shots.map((shot) => shot.durationSec)),
      maxShotDurationSec: Math.max(...shots.map((shot) => shot.durationSec)),
      cutRate: shots.length,
      rhythmPattern: 'uniform',
    },
    dominantTransitions: ['cut'],
    colorProfile: {
      warmth: 'neutral',
      saturation: 'medium',
      brightness: 'medium',
    },
    motionStyle: 'mixed',
    audioProfile: {
      hasMusic: false,
      hasVoiceover: false,
      hasNaturalSound: true,
    },
    textOverlays: [],
  };
}

function createManifest(assets: MediaFolderManifest['assets']): MediaFolderManifest {
  return {
    sourceRoot: 'E:/source',
    generatedAt: '2026-03-09T10:00:00.000Z',
    mediaPolicy: 'reference-only',
    totalFiles: assets.length,
    countsByCategory: {
      video: assets.filter((asset) => asset.category === 'video').length,
      image: assets.filter((asset) => asset.category === 'image').length,
      audio: assets.filter((asset) => asset.category === 'audio').length,
      document: assets.filter((asset) => asset.category === 'document').length,
      project: assets.filter((asset) => asset.category === 'project').length,
      other: assets.filter((asset) => asset.category === 'other').length,
    },
    assets,
  };
}

describe('matchAssetsToBlueprint', () => {
  it('produces non-fallback candidates when the manifest has strong matches for every shot', async () => {
    const blueprint = createBlueprint([
      {
        index: 0,
        startSec: 0,
        endSec: 5,
        durationSec: 5,
        transitionIn: null,
        transitionOut: 'cut',
        dominantColor: 'warm',
        motionAmount: 'medium',
        hasText: false,
        shotType: 'wide',
      },
      {
        index: 1,
        startSec: 5,
        endSec: 8,
        durationSec: 3,
        transitionIn: 'cut',
        transitionOut: 'cut',
        dominantColor: 'neutral',
        motionAmount: 'high',
        hasText: false,
        shotType: 'medium',
      },
      {
        index: 2,
        startSec: 8,
        endSec: 10,
        durationSec: 2,
        transitionIn: 'cut',
        transitionOut: null,
        dominantColor: 'cool',
        motionAmount: 'low',
        hasText: false,
        shotType: 'close',
      },
    ]);

    const manifest = createManifest([
      {
        absolutePath: 'E:/source/video/wide_intro_5s.mp4',
        relativePath: 'video/wide_intro_5s.mp4',
        basename: 'wide_intro_5s.mp4',
        extension: '.mp4',
        category: 'video',
        sizeBytes: 1000,
      },
      {
        absolutePath: 'E:/source/video/medium_action_3s.mp4',
        relativePath: 'video/medium_action_3s.mp4',
        basename: 'medium_action_3s.mp4',
        extension: '.mp4',
        category: 'video',
        sizeBytes: 1000,
      },
      {
        absolutePath: 'E:/source/images/close_detail_2s.jpg',
        relativePath: 'images/close_detail_2s.jpg',
        basename: 'close_detail_2s.jpg',
        extension: '.jpg',
        category: 'image',
        sizeBytes: 1000,
      },
    ]);

    const result = await matchAssetsToBlueprint(blueprint, manifest);

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.every((candidate) => candidate.fallback === false)).toBe(true);
    expect(result.unmatchedShotCount).toBe(0);
    expect(result.candidates.map((candidate) => candidate.matchedAsset?.relativePath)).toEqual([
      'video/wide_intro_5s.mp4',
      'video/medium_action_3s.mp4',
      'images/close_detail_2s.jpg',
    ]);
  });

  it('counts unmatched shots when there are not enough compatible assets', async () => {
    const blueprint = createBlueprint([
      {
        index: 0,
        startSec: 0,
        endSec: 4,
        durationSec: 4,
        transitionIn: null,
        transitionOut: 'cut',
        dominantColor: 'neutral',
        motionAmount: 'low',
        hasText: false,
        shotType: 'wide',
      },
      {
        index: 1,
        startSec: 4,
        endSec: 6,
        durationSec: 2,
        transitionIn: 'cut',
        transitionOut: null,
        dominantColor: 'neutral',
        motionAmount: 'high',
        hasText: false,
        shotType: 'close',
      },
    ]);
    const manifest = createManifest([
      {
        absolutePath: 'E:/source/images/wide_plate_4s.jpg',
        relativePath: 'images/wide_plate_4s.jpg',
        basename: 'wide_plate_4s.jpg',
        extension: '.jpg',
        category: 'image',
        sizeBytes: 1000,
      },
    ]);

    const result = await matchAssetsToBlueprint(blueprint, manifest);

    expect(result.unmatchedShotCount).toBe(1);
    expect(result.candidates[0]?.fallback).toBe(false);
    expect(result.candidates[1]?.fallback).toBe(true);
    expect(result.candidates[1]?.matchedAsset).toBeNull();
  });

  it('marks every shot as fallback when the manifest is empty', async () => {
    const blueprint = createBlueprint([
      {
        index: 0,
        startSec: 0,
        endSec: 3,
        durationSec: 3,
        transitionIn: null,
        transitionOut: null,
        dominantColor: 'neutral',
        motionAmount: 'medium',
        hasText: false,
        shotType: 'unknown',
      },
      {
        index: 1,
        startSec: 3,
        endSec: 6,
        durationSec: 3,
        transitionIn: null,
        transitionOut: null,
        dominantColor: 'neutral',
        motionAmount: 'medium',
        hasText: false,
        shotType: 'unknown',
      },
    ]);
    const manifest = createManifest([]);

    const result = await matchAssetsToBlueprint(blueprint, manifest);

    expect(result.unmatchedShotCount).toBe(2);
    expect(result.candidates.every((candidate) => candidate.fallback)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.matchedAsset === null)).toBe(true);
  });
});
