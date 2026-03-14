import { buildNLAssemblyPlan, parseNaturalLanguageRequest } from '../../natural-language-planner.js';
import type { MediaFolderManifest } from '../../media-folder-manifest.js';

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

describe('parseNaturalLanguageRequest', () => {
  it('parses a fast clean 30-second request', () => {
    const intent = parseNaturalLanguageRequest({
      prompt: '30s product visuals, fast, clean transitions',
    });

    expect(intent.targetDurationSec).toBe(30);
    expect(intent.pacingStyle).toBe('fast');
    expect(intent.transitionPreference).toBe('clean');
    expect(intent.visualStyle).toContain('product visuals');
  });

  it('parses a slow warm request with background music', () => {
    const intent = parseNaturalLanguageRequest({
      prompt: '60s slow warm visuals with music',
    });

    expect(intent.targetDurationSec).toBe(60);
    expect(intent.pacingStyle).toBe('slow');
    expect(intent.colorMood).toBe('warm');
    expect(intent.hasMusic).toBe(true);
  });

  it('returns defaults for an empty prompt', () => {
    const intent = parseNaturalLanguageRequest({
      prompt: '',
    });

    expect(intent.targetDurationSec).toBe(60);
    expect(intent.pacingStyle).toBe('medium');
    expect(intent.transitionPreference).toBe('auto');
    expect(intent.visualStyle).toBe('auto');
  });

  it('keeps unrecognized wording inside visualStyle', () => {
    const intent = parseNaturalLanguageRequest({
      prompt: 'airy minimal premium',
    });

    expect(intent.visualStyle).toBe('airy minimal premium');
    expect(intent.pacingStyle).toBe('medium');
    expect(intent.transitionPreference).toBe('auto');
  });
});

describe('buildNLAssemblyPlan', () => {
  it('builds a deterministic assembly plan from parsed intent and a manifest', () => {
    const intent = parseNaturalLanguageRequest({
      prompt: '30s product visuals, fast, clean transitions',
    });
    const manifest = createManifest([
      {
        absolutePath: 'E:/source/video/a.mp4',
        relativePath: 'video/a.mp4',
        basename: 'a.mp4',
        extension: '.mp4',
        category: 'video',
        sizeBytes: 1000,
      },
      {
        absolutePath: 'E:/source/video/b.mp4',
        relativePath: 'video/b.mp4',
        basename: 'b.mp4',
        extension: '.mp4',
        category: 'video',
        sizeBytes: 1000,
      },
      {
        absolutePath: 'E:/source/images/c.jpg',
        relativePath: 'images/c.jpg',
        basename: 'c.jpg',
        extension: '.jpg',
        category: 'image',
        sizeBytes: 1000,
      },
    ]);

    const plan = buildNLAssemblyPlan(intent, manifest);

    expect(plan.sequenceName).toContain('AI');
    expect(plan.transitionName).toBeNull();
    expect(plan.motionStyle).toBe('none');
    expect(plan.assetCount).toBe(3);
    expect(plan.clipDuration).toBeGreaterThan(0);
  });

  it('maps only explicit transition and motion names into executable defaults', () => {
    const intent = parseNaturalLanguageRequest({
      prompt: '12s beauty montage with Cross Dissolve and zoom in motion',
    });

    const plan = buildNLAssemblyPlan(intent);

    expect(plan.transitionName).toBe('Cross Dissolve');
    expect(plan.motionStyle).toBe('push_in');
  });
});
