/**
 * Unit tests for PremiereProTools
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PremiereProTools } from '../../tools/index.js';
import { PremiereBridge } from '../../bridge/index.js';
import { analyzeVideoReference } from '../../video-reference-analyzer.js';
import { matchAssetsToBlueprint } from '../../video-reference-matcher.js';
import { compareToBlueprint } from '../../video-reference-qa.js';
import {
  buildNLAssemblyPlan,
  parseNaturalLanguageRequest,
} from '../../natural-language-planner.js';
import { analyzeAudioTrack } from '../../audio-analysis.js';
import { generateSubtitles } from '../../subtitle-generator.js';
import { escapeForExtendScript } from '../../utils/escape-for-extendscript.js';
import { jest } from '@jest/globals';
import JSZip from 'jszip';

jest.mock('../../bridge/index.js');
jest.mock('../../utils/demoAssets.js', () => ({
  createMotionDemoAssets: jest.fn().mockResolvedValue([
    { name: '01_focus.png', path: '/tmp/01_focus.png' },
    { name: '02_precision.png', path: '/tmp/02_precision.png' },
    { name: '03_finish.png', path: '/tmp/03_finish.png' },
  ]),
}));
jest.mock('../../video-reference-analyzer.js', () => ({
  analyzeVideoReference: jest.fn(),
}));
jest.mock('../../video-reference-matcher.js', () => ({
  matchAssetsToBlueprint: jest.fn(),
}));
jest.mock('../../video-reference-qa.js', () => ({
  compareToBlueprint: jest.fn(),
}));
jest.mock('../../natural-language-planner.js', () => ({
  parseNaturalLanguageRequest: jest.fn(),
  buildNLAssemblyPlan: jest.fn(),
}));
jest.mock('../../audio-analysis.js', () => ({
  analyzeAudioTrack: jest.fn(),
}));
jest.mock('../../subtitle-generator.js', () => ({
  generateSubtitles: jest.fn(),
}));

const mockAnalyzeVideoReference = jest.mocked(analyzeVideoReference);
const mockMatchAssetsToBlueprint = jest.mocked(matchAssetsToBlueprint);
const mockCompareToBlueprint = jest.mocked(compareToBlueprint);
const mockParseNaturalLanguageRequest = jest.mocked(parseNaturalLanguageRequest);
const mockBuildNLAssemblyPlan = jest.mocked(buildNLAssemblyPlan);
const mockAnalyzeAudioTrack = jest.mocked(analyzeAudioTrack);
const mockGenerateSubtitles = jest.mocked(generateSubtitles);

async function createReviewFixture(options?: {
  guideParagraphs?: string[];
  assets?: Array<{
    absolutePath: string;
    relativePath: string;
    extension: string;
    category: 'video' | 'image' | 'audio' | 'document' | 'project' | 'other';
    sizeBytes?: number;
  }>;
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-tool-review-'));
  const docxPath = path.join(root, 'guide.docx');
  const manifestPath = path.join(root, 'manifest.json');
  const zip = new JSZip();
  const guideParagraphs = options?.guideParagraphs ?? ['1. Add the requested clip transition.'];
  const assets = options?.assets ?? [
    {
      absolutePath: 'E:/source/video/shot01.mp4',
      relativePath: 'video/shot01.mp4',
      extension: '.mp4',
      category: 'video' as const,
      sizeBytes: 1024,
    },
    {
      absolutePath: 'E:/source/images/still01.jpg',
      relativePath: 'images/still01.jpg',
      extension: '.jpg',
      category: 'image' as const,
      sizeBytes: 512,
    },
  ];

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Review Guide</w:t></w:r></w:p>
    ${guideParagraphs.map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`).join('\n    ')}
  </w:body>
</w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );

  const countsByCategory = {
    video: 0,
    image: 0,
    audio: 0,
    document: 0,
    project: 0,
    other: 0,
  };
  for (const asset of assets) {
    countsByCategory[asset.category] += 1;
  }

  await writeFile(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        sourceRoot: 'E:/source',
        generatedAt: '2026-03-08T12:00:00.000Z',
        mediaPolicy: 'reference-only',
        totalFiles: assets.length,
        countsByCategory,
        assets: assets.map((asset) => ({
          absolutePath: asset.absolutePath,
          relativePath: asset.relativePath,
          basename: path.basename(asset.relativePath),
          extension: asset.extension,
          category: asset.category,
          sizeBytes: asset.sizeBytes ?? 1024,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    docxPath,
    manifestPath,
  };
}

describe('PremiereProTools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereBridge>;

  beforeEach(() => {
    mockBridge = new PremiereBridge() as jest.Mocked<PremiereBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  describe('getAvailableTools()', () => {
    it('returns the current tool catalog', () => {
      const availableTools = tools.getAvailableTools();
      const toolNames = availableTools.map((tool) => tool.name);

      expect(availableTools.length).toBeGreaterThan(50);
      expect(toolNames).toContain('list_project_items');
      expect(toolNames).toContain('build_motion_graphics_demo');
      expect(toolNames).toContain('plan_edit_assembly');
      expect(toolNames).toContain('assemble_product_spot');
      expect(toolNames).toContain('assemble_product_spot_closed_loop');
      expect(toolNames).toContain('build_brand_spot_from_mogrt_and_assets');
      expect(toolNames).toContain('review_edit_reasonability');
      expect(toolNames).toContain('analyze_reference_video');
      expect(toolNames).toContain('plan_replication_from_video');
      expect(toolNames).toContain('compare_to_reference_video');
      expect(toolNames).toContain('parse_edit_request');
      expect(toolNames).toContain('plan_edit_from_request');
      expect(toolNames).toContain('load_editing_blueprint');
      expect(toolNames).toContain('plugin_list');
      expect(toolNames).toContain('plugin_register');
      expect(toolNames).toContain('plugin_set_enabled');
      expect(toolNames).toContain('plugin_call');
      expect(toolNames).toContain('import_media');
      expect(toolNames).toContain('add_to_timeline');
      expect(toolNames).toContain('get_clip_effects');
      expect(toolNames).toContain('inspect_clip_components');
      expect(toolNames).toContain('build_timeline_from_xml');
      expect(toolNames).toContain('import_mogrt');
      expect(toolNames).not.toContain('create_nested_sequence');
      expect(toolNames).not.toContain('unnest_sequence');
    });

    it('returns valid tool metadata', () => {
      for (const tool of tools.getAvailableTools()) {
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  describe('executeTool()', () => {
    beforeEach(() => {
      mockAnalyzeVideoReference.mockReset();
      mockMatchAssetsToBlueprint.mockReset();
      mockCompareToBlueprint.mockReset();
      mockParseNaturalLanguageRequest.mockReset();
      mockBuildNLAssemblyPlan.mockReset();
    });

    it('returns a clear error for unknown tools', async () => {
      const result = await tools.executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('validates tool arguments with zod', async () => {
      const result = await tools.executeTool('create_project', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('converts bridge exceptions into tool errors', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Bridge error'));

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });

    it('registers, lists, toggles, and calls plugins through the shared bridge directory', async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'premiere-plugin-tools-'));
      const previousTempDir = process.env.PREMIERE_TEMP_DIR;
      process.env.PREMIERE_TEMP_DIR = tempDir.replace(/\\/g, '/');

      try {
        const pluginTools = new PremiereProTools(mockBridge);
        const pluginEntry = path.join(tempDir, 'plugins', 'demo.jsx');
        const manifest = {
          id: 'demo-plugin',
          name: 'Demo Plugin',
          version: '1.2.3',
          description: 'demo',
          entry: pluginEntry,
          methods: ['run'],
          enabled: true,
        };

        const registerResult = await pluginTools.executeTool('plugin_register', manifest);
        expect(registerResult.success).toBe(true);
        expect(registerResult.plugin).toMatchObject(manifest);

        const listResult = await pluginTools.executeTool('plugin_list', {});
        expect(listResult.success).toBe(true);
        expect(listResult.plugins).toHaveLength(1);
        expect(listResult.plugins[0]).toMatchObject(manifest);

        const registryPath = path.join(tempDir, 'plugins.json');
        expect(JSON.parse(readFileSync(registryPath, 'utf8'))).toEqual({
          plugins: [manifest],
        });

        const disableResult = await pluginTools.executeTool('plugin_set_enabled', {
          id: 'demo-plugin',
          enabled: false,
        });
        expect(disableResult.success).toBe(true);
        expect(disableResult.plugin.enabled).toBe(false);

        const disabledCall = await pluginTools.executeTool('plugin_call', {
          pluginId: 'demo-plugin',
          method: 'run',
          params: { amount: 2 },
        });
        expect(disabledCall.success).toBe(false);
        expect(disabledCall.error).toContain('disabled');

        await pluginTools.executeTool('plugin_set_enabled', {
          id: 'demo-plugin',
          enabled: true,
        });

        mockBridge.executeScript.mockResolvedValue({
          success: true,
          result: {
            echoed: true,
          },
        });

        const callResult = await pluginTools.executeTool('plugin_call', {
          pluginId: 'demo-plugin',
          method: 'run',
          params: { amount: 2 },
        });

        expect(callResult).toEqual({
          success: true,
          result: {
            echoed: true,
          },
        });

        const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
        expect(generatedScript).toContain('$.evalFile(__pluginFile);');
        expect(generatedScript).toContain('var __pluginMethod = "run";');
        expect(generatedScript).toContain('var __pluginParams = {"amount":2};');
        expect(generatedScript).toContain('__pluginDispatch(__pluginMethod, __pluginParams)');
      } finally {
        if (previousTempDir === undefined) {
          delete process.env.PREMIERE_TEMP_DIR;
        } else {
          process.env.PREMIERE_TEMP_DIR = previousTempDir;
        }
      }
    });

    it('analyzes a reference video through the dedicated MCP tool', async () => {
      mockAnalyzeVideoReference.mockResolvedValue({
        sourcePath: 'E:/reference/demo.mp4',
        totalDuration: 12,
        estimatedFrameRate: 25,
        shots: [],
        pacing: {
          avgShotDurationSec: 4,
          minShotDurationSec: 4,
          maxShotDurationSec: 4,
          cutRate: 3,
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
      });

      const result = await tools.executeTool('analyze_reference_video', {
        videoPath: 'E:/reference/demo.mp4',
      });

      expect(result.success).toBe(true);
      expect(result.blueprint.sourcePath).toBe('E:/reference/demo.mp4');
      expect(mockAnalyzeVideoReference).toHaveBeenCalledWith('E:/reference/demo.mp4');
    });

    it('plans replication from a reference video and manifest through the MCP tool wrapper', async () => {
      mockAnalyzeVideoReference.mockResolvedValue({
        sourcePath: 'E:/reference/demo.mp4',
        totalDuration: 12,
        estimatedFrameRate: 25,
        shots: [],
        pacing: {
          avgShotDurationSec: 4,
          minShotDurationSec: 4,
          maxShotDurationSec: 4,
          cutRate: 3,
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
      });
      mockMatchAssetsToBlueprint.mockResolvedValue({
        sourceVideoPath: 'E:/reference/demo.mp4',
        blueprint: {
          sourcePath: 'E:/reference/demo.mp4',
          totalDuration: 12,
          estimatedFrameRate: 25,
          shots: [],
          pacing: {
            avgShotDurationSec: 4,
            minShotDurationSec: 4,
            maxShotDurationSec: 4,
            cutRate: 3,
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
        },
        candidates: [],
        unmatchedShotCount: 0,
        estimatedTimelineDuration: 12,
        transitionStrategy: 'cut',
        warnings: [],
      });

      const manifestRoot = await mkdtemp(path.join(os.tmpdir(), 'premiere-reference-tool-'));
      const manifestPath = path.join(manifestRoot, 'manifest.json');
      await writeFile(
        manifestPath,
        JSON.stringify({
          sourceRoot: 'E:/source',
          generatedAt: '2026-03-09T12:00:00.000Z',
          mediaPolicy: 'reference-only',
          totalFiles: 0,
          countsByCategory: {
            video: 0,
            image: 0,
            audio: 0,
            document: 0,
            project: 0,
            other: 0,
          },
          assets: [],
        }),
        'utf8',
      );

      const result = await tools.executeTool('plan_replication_from_video', {
        videoPath: 'E:/reference/demo.mp4',
        mediaManifestPath: manifestPath,
        sequenceName: 'Replication Plan',
      });

      expect(result.success).toBe(true);
      expect(result.sequenceName).toBe('Replication Plan');
      expect(result.plan.transitionStrategy).toBe('cut');
      expect(mockMatchAssetsToBlueprint).toHaveBeenCalled();
    });

    it('compares an assembly review to a reference video blueprint through the MCP tool wrapper', async () => {
      mockAnalyzeVideoReference.mockResolvedValue({
        sourcePath: 'E:/reference/demo.mp4',
        totalDuration: 12,
        estimatedFrameRate: 25,
        shots: [],
        pacing: {
          avgShotDurationSec: 4,
          minShotDurationSec: 4,
          maxShotDurationSec: 4,
          cutRate: 3,
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
      });
      mockCompareToBlueprint.mockReturnValue({
        status: 'pass',
        shotCountMatch: true,
        durationDeltaSec: 0,
        pacingDeltaPercent: 0,
        transitionMismatches: [],
        missingShots: [],
        warnings: [],
        blockers: [],
      });

      const result = await tools.executeTool('compare_to_reference_video', {
        videoPath: 'E:/reference/demo.mp4',
        assemblyReviewJson: JSON.stringify({
          summary: {
            realizedClipCount: 0,
          },
        }),
      });

      expect(result.success).toBe(true);
      expect(result.report.status).toBe('pass');
      expect(mockCompareToBlueprint).toHaveBeenCalled();
    });

    it('parses a natural-language edit request through the MCP tool wrapper', async () => {
      mockParseNaturalLanguageRequest.mockReturnValue({
        targetDurationSec: 30,
        pacingStyle: 'fast',
        visualStyle: 'product visuals',
        transitionPreference: 'clean',
        colorMood: 'auto',
        hasVoiceover: false,
        hasMusic: false,
        textOverlayStyle: 'none',
        rawPrompt: '30s product visuals, fast, clean transitions',
      });

      const result = await tools.executeTool('parse_edit_request', {
        prompt: '30s product visuals, fast, clean transitions',
      });

      expect(result.success).toBe(true);
      expect(result.intent.targetDurationSec).toBe(30);
      expect(mockParseNaturalLanguageRequest).toHaveBeenCalled();
    });

    it('builds a natural-language assembly plan through the MCP tool wrapper', async () => {
      mockParseNaturalLanguageRequest.mockReturnValue({
        targetDurationSec: 30,
        pacingStyle: 'fast',
        visualStyle: 'product visuals',
        transitionPreference: 'clean',
        colorMood: 'auto',
        hasVoiceover: false,
        hasMusic: false,
        textOverlayStyle: 'none',
        rawPrompt: '30s product visuals, fast, clean transitions',
      });
      mockBuildNLAssemblyPlan.mockReturnValue({
        intent: {
          targetDurationSec: 30,
          pacingStyle: 'fast',
          visualStyle: 'product visuals',
          transitionPreference: 'clean',
          colorMood: 'auto',
          hasVoiceover: false,
          hasMusic: false,
          textOverlayStyle: 'none',
          rawPrompt: '30s product visuals, fast, clean transitions',
        },
        sequenceName: 'Prompt Plan',
        clipDuration: 2.5,
        transitionName: 'Cross Dissolve',
        motionStyle: 'alternate',
        assetCount: 4,
        warnings: [],
      });

      const manifestRoot = await mkdtemp(path.join(os.tmpdir(), 'premiere-request-tool-'));
      const manifestPath = path.join(manifestRoot, 'manifest.json');
      await writeFile(
        manifestPath,
        JSON.stringify({
          sourceRoot: 'E:/source',
          generatedAt: '2026-03-09T12:00:00.000Z',
          mediaPolicy: 'reference-only',
          totalFiles: 0,
          countsByCategory: {
            video: 0,
            image: 0,
            audio: 0,
            document: 0,
            project: 0,
            other: 0,
          },
          assets: [],
        }),
        'utf8',
      );

      const result = await tools.executeTool('plan_edit_from_request', {
        prompt: '30s product visuals, fast, clean transitions',
        mediaManifestPath: manifestPath,
        sequenceName: 'Prompt Plan',
      });

      expect(result.success).toBe(true);
      expect(result.plan.sequenceName).toBe('Prompt Plan');
      expect(result.plan.transitionName).toBe('Cross Dissolve');
      expect(mockBuildNLAssemblyPlan).toHaveBeenCalled();
    });

    it('loads an external editing blueprint through the MCP tool wrapper', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-tool-blueprint-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'question',
          averageShotDuration: 1.2,
          pacingCurve: 'fast-slow-fast',
          transitionPattern: ['hard_cut', 'zoom_cut'],
          textOverlayStyle: 'centered-bold',
          musicBeatStrategy: 'cut-on-beat',
          ctaPattern: 'end-screen',
          avoidPatterns: ['cross_dissolve_only'],
          referenceCount: 4,
          targetPlatform: 'douyin',
        }),
        'utf8',
      );

      const result = await tools.executeTool('load_editing_blueprint', {
        editingBlueprintPath: blueprintPath,
      });

      expect(result.ok).toBe(true);
      expect(result.editingBlueprintPath).toBe(blueprintPath);
      expect(result.blueprint.targetPlatform).toBe('douyin');
    });

    it('compares a timeline to an external editing blueprint path', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-compare-blueprint-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'question',
          averageShotDuration: 1.2,
          pacingCurve: 'fast-slow-fast',
          transitionPattern: ['hard_cut', 'zoom_cut'],
          textOverlayStyle: 'centered-bold',
          musicBeatStrategy: 'cut-on-beat',
          ctaPattern: 'end-screen',
          avoidPatterns: ['cross_dissolve_only'],
          referenceCount: 4,
          targetDurationRange: [4, 8],
        }),
        'utf8',
      );

      const result = await tools.executeTool('compare_result_to_blueprint', {
        editingBlueprintPath: blueprintPath,
        timelineData: {
          totalDuration: 4.8,
          videoClips: [
            { id: 'v1', duration: 1.2, trackIndex: 0, startTime: 0, endTime: 1.2 },
            { id: 'v2', duration: 1.2, trackIndex: 0, startTime: 1.2, endTime: 2.4 },
            { id: 'v3', duration: 1.2, trackIndex: 0, startTime: 2.4, endTime: 3.6 },
            { id: 'v4', duration: 1.2, trackIndex: 0, startTime: 3.6, endTime: 4.8 },
          ],
          audioClips: [
            { id: 'a1', duration: 4.8, trackIndex: 0, startTime: 0, endTime: 4.8 },
          ],
          transitions: [
            { type: 'hard_cut', duration: 0, position: 1.2 },
            { type: 'zoom_cut', duration: 0, position: 2.4 },
          ],
          effects: [],
          textLayers: [
            { text: 'HOOK', startTime: 0, duration: 1 },
          ],
        },
      });

      expect(result.ok).toBe(true);
      expect(result.comparison.adherenceScore).toBeGreaterThan(70);
    });

    it('lets critic_edit_result load an external editing blueprint path', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-critic-blueprint-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'question',
          averageShotDuration: 1.2,
          pacingCurve: 'fast-slow-fast',
          transitionPattern: ['hard_cut', 'zoom_cut'],
          textOverlayStyle: 'centered-bold',
          musicBeatStrategy: 'cut-on-beat',
          ctaPattern: 'end-screen',
          avoidPatterns: ['cross_dissolve_only'],
          referenceCount: 4,
        }),
        'utf8',
      );

      const result = await tools.executeTool('critic_edit_result', {
        goal: '做一个抖音风视频',
        scenario: 'viral_style',
        editingBlueprintPath: blueprintPath,
        timelineData: {
          totalDuration: 4.8,
          videoClips: [
            { id: 'v1', duration: 1.2, trackIndex: 0, startTime: 0, endTime: 1.2 },
            { id: 'v2', duration: 1.2, trackIndex: 0, startTime: 1.2, endTime: 2.4 },
            { id: 'v3', duration: 1.2, trackIndex: 0, startTime: 2.4, endTime: 3.6 },
            { id: 'v4', duration: 1.2, trackIndex: 0, startTime: 3.6, endTime: 4.8 },
          ],
          audioClips: [
            { id: 'a1', duration: 4.8, trackIndex: 0, startTime: 0, endTime: 4.8 },
          ],
          transitions: [
            { type: 'hard_cut', duration: 0, position: 1.2 },
            { type: 'zoom_cut', duration: 0, position: 2.4 },
          ],
          effects: [],
          textLayers: [
            { text: 'HOOK', startTime: 0, duration: 1 },
          ],
        },
      });

      expect(result.ok).toBe(true);
      expect(result.critic.score).toBeGreaterThan(50);
    });

    it('runs assemble_product_spot_closed_loop from a research task directory', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-closed-loop-'));
      const researchTaskDir = await mkdtemp(path.join(root, 'task-'));
      const blueprintPath = path.join(researchTaskDir, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'visual_hook',
          averageShotDuration: 1.2,
          pacingCurve: 'fast dynamic rhythm',
          transitionPattern: ['cut'],
          textOverlayStyle: 'minimal',
          musicBeatStrategy: 'cut-on-beat',
          ctaPattern: 'end-screen',
          avoidPatterns: [],
          referenceCount: 4,
          targetPlatform: 'douyin',
          targetDurationRange: [4, 8],
        }),
        'utf8',
      );

      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-closed-loop',
        name: 'Closed Loop Spot',
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-c', name: 'c.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-d', name: 'd.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 1.2 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 1.2, outPoint: 2.4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-c', name: 'c.mp4', inPoint: 2.4, outPoint: 3.6 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-d', name: 'd.mp4', inPoint: 3.6, outPoint: 4.8 } as any);
      mockAnalyzeAudioTrack.mockResolvedValue({
        tempo: 128,
        beats: [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2],
        beat_count: 8,
        duration: 4.8,
      } as any);
      mockBridge.executeScript = jest.fn().mockImplementation(async (script: string) => {
        if (script.includes('sequence.markers.createMarker')) {
          return { success: true, markerId: `marker-${Math.random()}` } as any;
        }
        return {
          success: true,
          sequenceId: 'seq-closed-loop',
          videoTracks: [
            {
              index: 0,
              name: 'Video 1',
              clipCount: 4,
              clips: [
                { id: 'clip-a', duration: 1.2, trackIndex: 0, startTime: 0, endTime: 1.2 },
                { id: 'clip-b', duration: 1.2, trackIndex: 0, startTime: 1.2, endTime: 2.4 },
                { id: 'clip-c', duration: 1.2, trackIndex: 0, startTime: 2.4, endTime: 3.6 },
                { id: 'clip-d', duration: 1.2, trackIndex: 0, startTime: 3.6, endTime: 4.8 },
              ],
            },
          ],
          audioTracks: [
            {
              index: 0,
              name: 'Audio 1',
              clipCount: 1,
              clips: [
                { id: 'audio-1', duration: 4.8, trackIndex: 0, startTime: 0, endTime: 4.8 },
              ],
            },
          ],
        } as any;
      });

      const result = await tools.executeTool('assemble_product_spot_closed_loop', {
        goal: '做一个抖音风产品快剪',
        sequenceName: 'Closed Loop Spot',
        researchTaskDir,
        assetPaths: ['/a.mp4', '/b.mp4', '/c.mp4', '/d.mp4'],
        motionStyle: 'none',
        bgmPath: '/music/bgm.mp3',
      });

      expect(result.success).toBe(true);
      expect(result.editingBlueprintPath).toBe(blueprintPath);
      expect(result.assembly.sequence.id).toBe('seq-closed-loop');
      expect(result.comparison.adherenceScore).toBeGreaterThanOrEqual(70);
      expect(result.qualityGate.passed).toBe(true);
      expect(result.beatMarkers.success).toBe(true);
      expect(result.beatMarkers.markerCount).toBeGreaterThan(0);
      expect(result.manualKeyframePlan.length).toBeGreaterThan(0);
      expect(result.executionReport.finalOutcome).toBe('success');
      expect(mockBridge.createSequence).toHaveBeenCalledWith(
        'Closed Loop Spot',
        undefined,
        undefined,
      );
    });

    it('auto-generates subtitles when the blueprint expects caption-heavy overlays', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-closed-loop-subtitles-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'direct_hook',
          averageShotDuration: 1.5,
          pacingCurve: 'steady-build-fast',
          transitionPattern: ['cut'],
          textOverlayStyle: 'bold kinetic captions',
          musicBeatStrategy: 'music_support_only',
          ctaPattern: 'end-screen',
          avoidPatterns: [],
          referenceCount: 4,
          targetPlatform: 'douyin',
          targetDurationRange: [1, 3],
        }),
        'utf8',
      );

      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-subtitles',
        name: 'Subtitle Spot',
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-srt', name: 'captions.srt', projectItemId: 'item-srt' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 1.5 } as any);
      mockGenerateSubtitles.mockResolvedValue({
        srtPath: '/tmp/captions.srt',
        language: 'zh',
        durationSec: 1.5,
        backend: 'auto',
        warnings: [],
        entries: [
          { start: 0, end: 1.5, text: '字幕内容' },
        ],
      } as any);
      mockBridge.executeScript = jest.fn().mockImplementation(async (script: string) => {
        if (script.includes('sequence.createCaptionTrack')) {
          return { success: true, message: 'Caption track created' } as any;
        }
        return {
          success: true,
          sequenceId: 'seq-subtitles',
          videoTracks: [
            {
              index: 0,
              name: 'Video 1',
              clipCount: 1,
              clips: [
                { id: 'clip-a', duration: 1.5, trackIndex: 0, startTime: 0, endTime: 1.5 },
              ],
            },
          ],
          audioTracks: [],
        } as any;
      });

      const result = await tools.executeTool('assemble_product_spot_closed_loop', {
        goal: '做一个抖音风字幕快剪',
        sequenceName: 'Subtitle Spot',
        editingBlueprintPath: blueprintPath,
        assetPaths: ['/a.mp4'],
        subtitleSourcePath: '/audio/dialogue.wav',
        motionStyle: 'none',
      });

      expect(result.success).toBe(true);
      expect(result.subtitleAutomation.success).toBe(true);
      expect(result.subtitleAutomation.result.entryCount).toBe(1);
      expect(result.qualityGate.subtitleAutomationPassed).toBe(true);
    });

    it('blocks assemble_product_spot_closed_loop when blueprint review fails', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-closed-loop-blocked-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'visual_hook',
          averageShotDuration: 6,
          pacingCurve: 'slow',
          transitionPattern: [],
          textOverlayStyle: 'minimal',
          musicBeatStrategy: 'soft',
          ctaPattern: 'none',
          avoidPatterns: [],
          referenceCount: 1,
          targetPlatform: 'douyin',
        }),
        'utf8',
      );

      const result = await tools.executeTool('assemble_product_spot_closed_loop', {
        goal: '做一个抖音风快节奏产品视频',
        sequenceName: 'Blocked Closed Loop Spot',
        editingBlueprintPath: blueprintPath,
        assetPaths: ['/a.mp4', '/b.mp4'],
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blueprintReview.approved).toBe(false);
      expect(result.qualityGate.reasons).toContain('review_blueprint_reasonability 未通过');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });
  });

  describe('bridge-backed wrappers', () => {
    it('passes through successful imports', async () => {
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        success: true,
        id: 'item-123',
        name: 'video.mp4',
        type: 'footage',
        mediaPath: '/path/to/video.mp4'
      });

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(mockBridge.importMedia).toHaveBeenCalledWith('/path/to/video.mp4');
      expect(result.success).toBe(true);
      expect(result.id).toBe('item-123');
    });

    it('surfaces import failures instead of claiming success', async () => {
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        success: false,
        error: 'Import failed'
      } as any);

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Import failed');
    });

    it('rejects generated verification artifacts before bridge import', async () => {
      mockBridge.importMedia = jest.fn();

      const result = await tools.executeTool('import_media', {
        filePath: 'C:/Users/test/AppData/Local/Temp/premiere-fade-verify-demo/frame-17.jpg'
      });

      expect(mockBridge.importMedia).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('generated_verification_artifact_not_allowed');
    });

    it('passes through successful timeline placement', async () => {
      mockBridge.addToTimeline = jest.fn().mockResolvedValue({
        success: true,
        id: 'clip-123',
        name: 'video.mp4'
      } as any);

      const result = await tools.executeTool('add_to_timeline', {
        sequenceId: 'seq-123',
        projectItemId: 'item-456',
        trackIndex: 0,
        time: 0
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('clip-123');
    });

    it('surfaces timeline placement failures instead of claiming success', async () => {
      mockBridge.addToTimeline = jest.fn().mockResolvedValue({
        success: false,
        error: 'Track not found'
      } as any);

      const result = await tools.executeTool('add_to_timeline', {
        sequenceId: 'seq-123',
        projectItemId: 'item-456',
        trackIndex: 99,
        time: 0
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Track not found');
    });

    it('forwards explicit sequence settings when create_sequence omits presetPath', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-custom',
        name: 'Custom Sequence'
      } as any);

      const result = await tools.executeTool('create_sequence', {
        name: 'Custom Sequence',
        width: 1920,
        height: 1080,
        frameRate: 25,
        sampleRate: 48000
      });

      expect(result.success).toBe(true);
      expect(mockBridge.createSequence).toHaveBeenCalledWith(
        'Custom Sequence',
        undefined,
        {
          width: 1920,
          height: 1080,
          frameRate: 25,
          sampleRate: 48000
        }
      );
    });

    it('forwards clip-derived sequence creation options through create_sequence', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-clip-derived',
        name: 'Clip Derived Sequence',
      } as any);

      const result = await tools.executeTool('create_sequence', {
        name: 'Clip Derived Sequence',
        mediaPath: 'E:/media/shot01.mp4',
        avoidCreateNewSequence: true,
      });

      expect(result.success).toBe(true);
      expect(mockBridge.createSequence).toHaveBeenCalledWith(
        'Clip Derived Sequence',
        undefined,
        undefined,
        {
          mediaPath: 'E:/media/shot01.mp4',
          avoidCreateNewSequence: true,
        },
      );
    });

    it('builds a timeline from generated FCP XML and imports the resulting sequence', async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'premiere-xml-timeline-'));
      mockBridge.getBridgeDirectory = jest.fn().mockReturnValue(tempDir);
      mockBridge.openProject = jest.fn().mockResolvedValue({
        id: 'project-original',
        name: '3.prproj',
        path: 'E:/下载/新建文件夹/3.prproj',
        isOpen: true,
      } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: true,
          settings: {
            name: '参考竖屏序列',
            sequenceID: 'seq-ref-1',
            width: 1080,
            height: 1920,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          items: [
            {
              id: '000f4241',
              name: '镜头 01.jpg',
              type: 'footage',
              mediaPath: 'E:/作业 1/镜头 01.jpg',
              metadata: {
                resolution: '2160 x 3840',
              },
            },
            {
              id: '000f4242',
              name: '镜头 02.jpg',
              type: 'footage',
              mediaPath: 'E:/作业 1/镜头 02.jpg',
              metadata: {
                resolution: '2160 x 3840',
              },
            },
            {
              id: '000f4246',
              name: '音乐 bed.wav',
              type: 'footage',
              mediaPath: 'E:/作业 1/音乐 bed.wav',
            },
          ],
          bins: [],
          totalItems: 3,
          totalBins: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          openResult: true,
          originalProjectPath: 'E:/下载/新建文件夹/3.prproj',
          tempProjectDirectory: `${tempDir.replace(/\\/g, '/')}/timeline-project-temp`,
        })
        .mockResolvedValueOnce({
          success: true,
          sequence: {
            id: 'seq-temp-1',
            name: 'XML测试序列',
            duration: 10,
            videoTrackCount: 1,
            audioTrackCount: 1,
          },
          tempProjectPath: `${tempDir.replace(/\\/g, '/')}/timeline-project-temp/XML测试序列.prproj`,
          createdSequences: [
            {
              id: 'seq-temp-1',
              name: 'XML测试序列',
              duration: 10,
              videoTrackCount: 1,
              audioTrackCount: 1,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          currentProjectPath: 'E:/下载/新建文件夹/3.prproj',
        })
        .mockResolvedValueOnce({
          success: true,
          before: {
            'seq-existing-1': true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          sequence: {
            id: 'seq-xml-1',
            name: 'XML测试序列',
            duration: 10,
            videoTrackCount: 1,
            audioTrackCount: 1,
          },
          createdSequences: [
            {
              id: 'seq-xml-1',
              name: 'XML测试序列',
              duration: 10,
              videoTrackCount: 1,
              audioTrackCount: 1,
            },
          ],
        });

        const result = await tools.executeTool('build_timeline_from_xml', {
          sequenceName: 'XML测试序列',
          clips: [
            {
              projectItemId: '000f4241',
            durationSec: 5,
            zoomFrom: 100,
            zoomTo: 115,
            centerFrom: [540, 960],
            centerTo: [560, 940],
            rotationFrom: -3,
            rotationTo: 1,
          },
            { projectItemId: '000f4242', durationSec: 5, zoomFrom: 108, zoomTo: 100 },
          ],
          transitionDurationSec: 0.5,
          audioProjectItemId: '000f4246',
          frameRate: 30,
          allowExperimentalMotion: true,
        });

      expect(result.success).toBe(true);
      expect(result.sequenceId).toBe('seq-xml-1');
      expect(result.sequenceName).toBe('XML测试序列');
      expect(result.xmlPath).toMatch(/timeline-.*\.xml$/);
      expect(result.importStrategy).toBe('openFCPXML-importSequences');
      expect(result.tempProjectPath).toMatch(/XML测试序列\.prproj$/);
      expect(mockBridge.openProject).toHaveBeenCalledWith('E:/下载/新建文件夹/3.prproj');

      const writtenXml = readFileSync(result.xmlPath, 'utf8');
      expect(writtenXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(writtenXml).toContain('<name>Cross Dissolve</name>');
      expect(writtenXml).toContain('<width>1080</width>');
      expect(writtenXml).toContain('<height>1920</height>');
      expect(writtenXml).toContain('<keyframe><when>0</when><value>50</value></keyframe>');
      expect(writtenXml).toContain('<keyframe><when>150</when><value>57.5</value></keyframe>');
      expect(writtenXml).toContain('<parameterid>center</parameterid>');
      expect(writtenXml).toContain('<parameterid>rotation</parameterid>');
      expect(writtenXml).toContain('<horiz>540</horiz><vert>960</vert>');
      expect(writtenXml).toContain('<keyframe><when>0</when><value>-3</value></keyframe>');
      expect(writtenXml).toContain('<pathurl>file://localhost/E%3A/%E4%BD%9C%E4%B8%9A%201/%E9%95%9C%E5%A4%B4%2001.jpg</pathurl>');

      const importScript = mockBridge.executeScript.mock.calls[2]?.[0] as string;
      expect(importScript).toContain('var xmlFile = new File(');
      expect(importScript).toContain('app.openFCPXML(xmlFile.fsName');
      const tempPollScript = mockBridge.executeScript.mock.calls[3]?.[0] as string;
      expect(tempPollScript).toContain('normalizedTempProjectDirectory');
      const projectImportScript = mockBridge.executeScript.mock.calls[5]?.[0] as string;
      expect(projectImportScript).toContain('app.project.importSequences(');
      const finalPollScript = mockBridge.executeScript.mock.calls[6]?.[0] as string;
      expect(finalPollScript).toContain('not_ready_yet');
    });

      it('blocks experimental XML center and rotation motion unless explicitly allowed', async () => {
        const result = await tools.executeTool('build_timeline_from_xml', {
          sequenceName: 'XML测试序列',
          clips: [
            {
              projectItemId: '000f4241',
              durationSec: 5,
              centerFrom: [540, 960],
              rotationFrom: -3,
            },
          ],
        });

        expect(result.success).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.experimentalMotionFields).toEqual(['center', 'rotation']);
        expect(result.error).toContain('allowExperimentalMotion: true');
        expect(mockBridge.executeScript).not.toHaveBeenCalled();
      });

    it('does not expose remove_effect as an available tool', async () => {
      const toolNames = tools.getAvailableTools().map((tool) => tool.name);

      expect(toolNames).not.toContain('remove_effect');

      const result = await tools.executeTool('remove_effect', {
        clipId: 'clip-1',
        effectName: 'Gaussian Blur'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool 'remove_effect' not found");
    });

    it('keeps removeEffect on a QE DOM path with an unsupported fallback while remaining hidden publicly', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        error: 'Effect removal is not supported by the available QE DOM APIs for this clip.'
      });

      const result = await (tools as any).removeEffect('clip-1', 'Gaussian Blur');

      expect(result.success).toBe(false);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('app.enableQE();');
      expect(generatedScript).toContain('var qeSeq = qe.project.getActiveSequence();');
      expect(generatedScript).toContain('var qeClip = qeTrack.getItemAt(info.clipIndex);');
      expect(generatedScript).toContain('typeof qeEffect.remove === "function"');
      expect(generatedScript).toContain('Tool remains hidden from the public tool list');
    });

    it('escapes non-ASCII effect names before embedding the hidden removeEffect script', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        error: 'Effect removal is not supported by the available QE DOM APIs for this clip.',
      });

      await (tools as any).removeEffect('clip-1', '高斯模糊');

      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      const effectLiteral = escapeForExtendScript(JSON.stringify('高斯模糊'));
      expect(generatedScript).toContain(`if (names[nameIndex] === ${effectLiteral})`);
      expect(generatedScript).toContain(`effectName: ${effectLiteral}`);
    });

    it('removes the unsupported stabilize_clip method parameter from the public tool schema', () => {
      const stabilizeTool = tools.getAvailableTools().find((tool) => tool.name === 'stabilize_clip');

      expect(stabilizeTool).toBeDefined();
      expect(stabilizeTool?.description).toContain('Warp Stabilizer');

      const parsedArgs = stabilizeTool?.inputSchema.parse({
        clipId: 'clip-1',
        method: 'subspace',
        smoothness: 25
      });

      expect(parsedArgs).toEqual({
        clipId: 'clip-1',
        smoothness: 25
      });
    });
  });

  describe('script-backed tools', () => {
    it('executes list_project_items', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        items: [],
        bins: [],
        totalItems: 0,
        totalBins: 0
      });

      const result = await tools.executeTool('list_project_items', {});

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('includes metadata fields when list_project_items requests includeMetadata', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        items: [],
        bins: [],
        totalItems: 0,
        totalBins: 0
      });

      const result = await tools.executeTool('list_project_items', {
        includeMetadata: true
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('item.getFootageInterpretation');
      expect(generatedScript).toContain('item.getOutPoint');
      expect(generatedScript).toContain('item.getProjectColumnsMetadata');
    });

    it('renders includeBins as an explicit numeric flag for list_project_items', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        items: [],
        bins: [],
        totalItems: 0,
        totalBins: 0,
      });

      const result = await tools.executeTool('list_project_items', {
        includeBins: false,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('bins: 0 === 1 ? bins : []');
    });

    it('uses current argument names for split_clip', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clips: ['clip-a', 'clip-b']
      });

      const result = await tools.executeTool('split_clip', {
        clipId: 'clip-123',
        splitTime: 5.5
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var splitSeconds = 5.5;');
      expect(generatedScript).not.toContain('info.clip.start.seconds + 5.5');
    });

    it('trims clips with method-based updates when available and falls back to direct time assignments otherwise', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-123'
      });

      const result = await tools.executeTool('trim_clip', {
        clipId: 'clip-123',
        inPoint: 1.5,
        outPoint: 4.5
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var oldStart = clip.start.seconds;');
      expect(generatedScript).toContain('var oldEnd = clip.end.seconds;');
      expect(generatedScript).toContain('var oldInPoint = clip.inPoint.seconds;');
      expect(generatedScript).toContain('var oldOutPoint = clip.outPoint.seconds;');
      expect(generatedScript).toContain('var newStart = oldStart + 1.5;');
      expect(generatedScript).toContain('var newEnd = oldStart + 4.5;');
      expect(generatedScript).toContain('var newInPoint = oldInPoint + 1.5;');
      expect(generatedScript).toContain('var newOutPoint = oldInPoint + 4.5;');
      expect(generatedScript).toContain('var newInTicks = __secondsToTicks(newInPoint);');
      expect(generatedScript).toContain('var newOutTicks = __secondsToTicks(newOutPoint);');
      expect(generatedScript).toContain('var canSetTrimPoints = typeof clip.setInPoint === "function" && typeof clip.setOutPoint === "function";');
      expect(generatedScript).toContain('if (canSetTrimPoints) {');
      expect(generatedScript).toContain('clip.setInPoint(newInTicks, 4);');
      expect(generatedScript).toContain('clip.setOutPoint(newOutTicks, 4);');
      expect(generatedScript).toContain('if (newStart !== oldStart && canMoveClip) {');
      expect(generatedScript).toContain('clip.move(__secondsToTicks(newStart - oldStart));');
      expect(generatedScript).toContain('clip.start = fallbackStart;');
      expect(generatedScript).toContain('clip.end = fallbackEnd;');
      expect(generatedScript).toContain('clip.inPoint = fallbackIn;');
      expect(generatedScript).toContain('clip.outPoint = fallbackOut;');
    });

    it('validates trim_clip requests against the current visible clip duration before applying them', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-123'
      });

      const result = await tools.executeTool('trim_clip', {
        clipId: 'clip-123',
        outPoint: 12
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('if (requestedOutPoint !== null && requestedOutPoint > oldDuration)');
      expect(generatedScript).toContain('if (requestedInPoint !== null && requestedInPoint >= oldDuration)');
      expect(generatedScript).toContain('if (requestedDuration !== null && requestedDuration > oldDuration)');
      expect(generatedScript).toContain('return JSON.stringify({ success: false, error: "Trim points exceed current clip duration" });');
    });

    it('uses current argument names for add_transition', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionId: 'trans-123'
      });

      const result = await tools.executeTool('add_transition', {
        clipId1: 'clip-1',
        clipId2: 'clip-2',
        transitionName: 'Cross Dissolve',
        duration: 0.75
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var info2 = __findClip("clip-2")');
      expect(generatedScript).toContain('info1.sequenceId !== info2.sequenceId');
      expect(generatedScript).toContain('var targetSequence = __openSequenceById(earlierInfo.sequenceId);');
      expect(generatedScript).toContain('info1.trackIndex !== info2.trackIndex');
      expect(generatedScript).toContain('Math.abs(info1.clipIndex - info2.clipIndex) !== 1');
      expect(generatedScript).toContain('var deltaToNext = laterInfo.clip.start.seconds - earlierInfo.clip.end.seconds;');
      expect(generatedScript).toContain('__buildTransitionFailure("invalid_clip_pair"');
      expect(generatedScript).toContain('__buildTransitionFailure("qe_add_transition_failed"');
      expect(generatedScript).toContain('String(frames)');
      expect(generatedScript).not.toContain('frames + ":00"');
    });

    it('opens the resolved sequence and returns structured sequence context for add_transition', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionId: 'trans-123'
      });

      const result = await tools.executeTool('add_transition', {
        clipId1: 'clip-a',
        clipId2: 'clip-b',
        transitionName: 'Cross Dissolve',
        duration: 0.5
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('info1.sequenceId !== info2.sequenceId');
      expect(generatedScript).toContain('var targetSequence = __openSequenceById(earlierInfo.sequenceId);');
      expect(generatedScript).toContain('sequenceId: earlierInfo.sequenceId');
      expect(generatedScript).toContain('sequenceName: earlierInfo.sequenceName');
      expect(generatedScript).toContain('trackType: earlierInfo.trackType');
      expect(generatedScript).toContain('trackIndex: earlierInfo.trackIndex');
      expect(generatedScript).toContain('clipIndex1: info1.clipIndex');
      expect(generatedScript).toContain('clipIndex2: info2.clipIndex');
      expect(generatedScript).toContain('durationFrames: frames');
      expect(generatedScript).toContain('adjacencyDeltaSec: deltaToNext');
    });

    it('opens the clip sequence before add_transition_to_clip and returns sequence context', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionId: 'trans-456'
      });

      const result = await tools.executeTool('add_transition_to_clip', {
        clipId: 'clip-a',
        transitionName: 'Dip to Black',
        position: 'end',
        duration: 0.5
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var targetSequence = __openSequenceById(info.sequenceId);');
      expect(generatedScript).toContain('__buildTransitionFailure("sequence_activation_failed"');
      expect(generatedScript).toContain('__buildTransitionFailure("transition_not_found"');
      expect(generatedScript).toContain('sequenceId: info.sequenceId');
      expect(generatedScript).toContain('trackType: info.trackType');
      expect(generatedScript).toContain('trackIndex: info.trackIndex');
      expect(generatedScript).toContain('clipIndex: info.clipIndex');
      expect(generatedScript).toContain('durationFrames: frames');
    });

    it('diagnoses transition boundaries before QE insertion', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        canAddSharedTransition: false,
        issues: ['timeline-gap'],
      });

      const result = await tools.executeTool('inspect_transition_boundary', {
        clipId1: 'clip-a',
        clipId2: 'clip-b',
        duration: 0.5,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sameTrackType = info1.trackType === info2.trackType;');
      expect(generatedScript).toContain('var sameSequence = info1.sequenceId === info2.sequenceId;');
      expect(generatedScript).toContain('var adjacentByIndex = sameTrack && Math.abs(info1.clipIndex - info2.clipIndex) === 1;');
      expect(generatedScript).toContain('boundaryType = "gap"');
      expect(generatedScript).toContain('sequenceActivationSucceeded');
      expect(generatedScript).toContain('qeSequenceAvailable');
      expect(generatedScript).toContain('durationFrames = __getDurationFramesForSequence(targetSequence, 0.5);');
      expect(generatedScript).toContain('canAddSharedTransition');
    });

    it('inspects all transition boundaries on a track before batch insertion', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        canBatchAddTransitions: false,
        summary: {
          contiguousBoundaries: 1,
          gapBoundaries: 1,
          overlapBoundaries: 0,
          canAddSharedTransitionCount: 1,
        },
      });

      const result = await tools.executeTool('inspect_track_transition_boundaries', {
        sequenceId: 'sequence-1',
        trackIndex: 0,
        duration: 0.5,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sequence = __findSequence("sequence-1");');
      expect(generatedScript).toContain('var activationTarget = __openSequenceById(sequence.sequenceID);');
      expect(generatedScript).toContain('var track = sequence.videoTracks[0];');
      expect(generatedScript).toContain('if (clipCount < 2) topLevelIssues.push("insufficient-clips");');
      expect(generatedScript).toContain('for (var i = 0; i < clipCount - 1; i++) {');
      expect(generatedScript).toContain('var boundaryDeltaSec = nextClip.start.seconds - currentClip.end.seconds;');
      expect(generatedScript).toContain('boundaryType = "gap"');
      expect(generatedScript).toContain('boundaryType = "overlap"');
      expect(generatedScript).toContain('durationFrames = __getDurationFramesForSequence(sequence, 0.5);');
      expect(generatedScript).toContain('canBatchAddTransitions');
      expect(generatedScript).toContain('summary: {');
      expect(generatedScript).toContain('boundaries: boundaries');
    });

    it('supports audio-track transition boundary inspection', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        canBatchAddTransitions: true,
      });

      const result = await tools.executeTool('inspect_track_transition_boundaries', {
        sequenceId: 'sequence-audio',
        trackIndex: 1,
        trackType: 'audio',
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var track = sequence.audioTracks[1];');
      expect(generatedScript).toContain('trackType: "audio"');
    });

    it('safely batch-adds transitions only on inspected safe boundaries', async () => {
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: true,
          sequenceId: 'sequence-1',
          sequenceName: 'Sequence 1',
          trackType: 'video',
          trackIndex: 0,
          totalBoundaries: 2,
          durationFrames: 15,
          issues: [],
          summary: {
            contiguousBoundaries: 1,
            gapBoundaries: 1,
            overlapBoundaries: 0,
            canAddSharedTransitionCount: 1,
          },
          boundaries: [
            {
              clipId1: 'clip-a',
              clipName1: 'A',
              clipId2: 'clip-b',
              clipName2: 'B',
              clipIndex1: 0,
              clipIndex2: 1,
              boundaryType: 'contiguous',
              boundaryDeltaSec: 0,
              canAddSharedTransition: true,
              issues: [],
              durationFrames: 15,
            },
            {
              clipId1: 'clip-b',
              clipName1: 'B',
              clipId2: 'clip-c',
              clipName2: 'C',
              clipIndex1: 1,
              clipIndex2: 2,
              boundaryType: 'gap',
              boundaryDeltaSec: 0.2,
              canAddSharedTransition: false,
              issues: ['timeline-gap'],
              durationFrames: 15,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          transitionName: 'Cross Dissolve',
          duration: 0.5,
          durationFrames: 15,
          sequenceId: 'sequence-1',
          sequenceName: 'Sequence 1',
          trackType: 'video',
          trackIndex: 0,
          adjacencyDeltaSec: 0,
        });

      const result = await tools.executeTool('safe_batch_add_transitions', {
        sequenceId: 'sequence-1',
        trackIndex: 0,
        transitionName: 'Cross Dissolve',
        duration: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.partialSuccess).toBe(true);
      expect(result.transitionsAdded).toBe(1);
      expect(result.skippedBoundaries).toBe(1);
      expect(result.failedBoundaries).toBe(0);
      expect(result.skippedIssueCounts['timeline-gap']).toBe(1);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(2);
      const inspectScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      const addScript = mockBridge.executeScript.mock.calls[1]?.[0] as string;
      expect(inspectScript).toContain('canBatchAddTransitions');
      expect(addScript).toContain('qeClip.addTransition');
    });

    it('blocks safe_batch_add_transitions when inspection reports a blocking host issue', async () => {
      mockBridge.executeScript.mockResolvedValueOnce({
        success: true,
        sequenceId: 'sequence-1',
        sequenceName: 'Sequence 1',
        trackType: 'video',
        trackIndex: 0,
        totalBoundaries: 1,
        durationFrames: 15,
        issues: ['sequence-activation-failed'],
        summary: {
          contiguousBoundaries: 1,
          gapBoundaries: 0,
          overlapBoundaries: 0,
          canAddSharedTransitionCount: 0,
        },
        boundaries: [
          {
            clipId1: 'clip-a',
            clipId2: 'clip-b',
            clipIndex1: 0,
            clipIndex2: 1,
            boundaryType: 'contiguous',
            boundaryDeltaSec: 0,
            canAddSharedTransition: false,
            issues: ['sequence-activation-failed'],
            durationFrames: 15,
          },
        ],
      });

      const result = await tools.executeTool('safe_batch_add_transitions', {
        sequenceId: 'sequence-1',
        trackIndex: 0,
        transitionName: 'Cross Dissolve',
        duration: 0.5,
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.stage).toBe('inspection_blocked');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
    });

    it('searches the active sequence first and then falls back to other sequences for clip lookups', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-1'
      });

      const result = await tools.executeTool('move_clip', {
        clipId: 'clip-1',
        newTime: 12,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('function searchSequence(sequence) {');
      expect(generatedScript).toContain('var activeSequence = app.project.activeSequence;');
      expect(generatedScript).toContain('var activeMatch = searchSequence(activeSequence);');
      expect(generatedScript).toContain('if (activeMatch) return activeMatch;');
      expect(generatedScript).toContain('for (var sequenceIndex = 0; sequenceIndex < app.project.sequences.numSequences; sequenceIndex++) {');
      expect(generatedScript).toContain('if (!sequence || sequence === activeSequence) continue;');
      expect(generatedScript).toContain('var match = searchSequence(sequence);');
      expect(generatedScript).toContain('if (match) return match;');
      expect(generatedScript.indexOf('var activeMatch = searchSequence(activeSequence);')).toBeLessThan(
        generatedScript.indexOf('for (var sequenceIndex = 0; sequenceIndex < app.project.sequences.numSequences; sequenceIndex++) {'),
      );
    });

    it('serializes frame counts correctly for batch_add_transitions', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionsAdded: 2
      });

      const result = await tools.executeTool('batch_add_transitions', {
        sequenceId: 'sequence-1',
        trackIndex: 0,
        transitionName: 'Cross Dissolve',
        duration: 0.5
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sequence = __openSequenceById("sequence-1");');
      expect(generatedScript).toContain('for (var i = 0; i < clipCount - 1; i++)');
      expect(generatedScript).toContain('var frames = __getDurationFramesForSequence(sequence, 0.5);');
      expect(generatedScript).toContain('var deltaToNext = nextClip.start.seconds - currentClip.end.seconds;');
      expect(generatedScript).toContain('stage: "invalid_clip_pair"');
      expect(generatedScript).toContain('stage: "qe_add_transition_failed"');
      expect(generatedScript).toContain('String(frames)');
      expect(generatedScript).not.toContain('frames + ":00"');
      expect(generatedScript).toContain('sequenceId: sequence.sequenceID');
      expect(generatedScript).toContain('partialSuccess: added > 0 && errors.length > 0');
      expect(generatedScript).toContain('durationFrames: frames');
    });

    it('supports audio track transitions in batch_add_transitions', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionsAdded: 2
      });

      const result = await tools.executeTool('batch_add_transitions', {
        sequenceId: 'sequence-1',
        trackIndex: 1,
        trackType: 'audio',
        transitionName: 'Exponential Fade',
        duration: 0.5
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('sequence.audioTracks[1]');
      expect(generatedScript).toContain('qeSeq.getAudioTrackAt(1)');
      expect(generatedScript).toContain('qe.project.getAudioTransitionByName("Exponential Fade")');
    });

    it('rebuilds the clip on a target track when move_clip receives newTrackIndex', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-1'
      });

      const result = await tools.executeTool('move_clip', {
        clipId: 'clip-1',
        newTime: 12,
        newTrackIndex: 2
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var targetTrackIndex = 2;');
      expect(generatedScript).toContain('clip.projectItem');
      expect(generatedScript).toContain('targetTrack.overwriteClip(projectItem');
      expect(generatedScript).toContain('clip.remove(false, true);');
    });

    it('applies effect parameter values after adding the effect', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        effectName: 'Gaussian Blur'
      });

      const result = await tools.executeTool('apply_effect', {
        clipId: 'clip-1',
        effectName: 'Gaussian Blur',
        parameters: {
          Blurriness: 42,
          RepeatEdgePixels: 1
        }
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('Applied effect component not found after QE addVideoEffect/addAudioEffect.');
      expect(generatedScript).toContain('beforeComponentCount');
      expect(generatedScript).toContain('appliedComponent.properties');
      expect(generatedScript).toContain('param.displayName === "Blurriness"');
      expect(generatedScript).toContain('param.setValue(42, 1)');
      expect(generatedScript).toContain('param.displayName === "RepeatEdgePixels"');
      expect(generatedScript).toContain('param.setValue(1, 1)');
      expect(generatedScript).toContain('appliedParameters.push("Blurriness")');
      expect(generatedScript).toContain('appliedParameters.push("RepeatEdgePixels")');
    });

    it('serializes array effect parameters for point and color style values', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        effectName: 'Radial Shadow'
      });

      const result = await tools.executeTool('apply_effect', {
        clipId: 'clip-1',
        effectName: 'Radial Shadow',
        parameters: {
          LightPosition: [781, 409],
          ShadowColor: [255, 255, 255, 255]
        }
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('param.displayName === "LightPosition"');
      expect(generatedScript).toContain('param.setValue([781,409], 1)');
      expect(generatedScript).toContain('param.displayName === "ShadowColor"');
      expect(generatedScript).toContain('if (param.setColorValue)');
      expect(generatedScript).toContain('param.setColorValue(255, 255, 255, 255, 1)');
      expect(generatedScript).toContain('param.setValue([255,255,255,255], 1)');
    });

    it('escapes non-ASCII effect and parameter names before embedding apply_effect scripts', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        effectName: '高斯模糊'
      });

      const result = await tools.executeTool('apply_effect', {
        clipId: 'clip-1',
        effectName: '高斯模糊',
        parameters: {
          模糊度: 42
        }
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      const effectLiteral = escapeForExtendScript(JSON.stringify('高斯模糊'));
      const paramLiteral = escapeForExtendScript(JSON.stringify('模糊度'));
      expect(generatedScript).toContain(`qe.project.getVideoEffectByName(${effectLiteral})`);
      expect(generatedScript).toContain(`param.displayName === ${paramLiteral}`);
      expect(generatedScript).toContain(`appliedParameters.push(${paramLiteral})`);
    });

    it('queues renders through Adobe Media Encoder and honors startImmediately', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        jobId: 'job-123',
        startedImmediately: true
      });

      const result = await tools.executeTool('add_to_render_queue', {
        sequenceId: 'sequence-1',
        outputPath: 'C:/exports/output.mp4',
        presetPath: 'C:/presets/h264.epr',
        startImmediately: true
      });

      expect(result.success).toBe(true);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sequence = __findSequence("sequence-1")');
      expect(generatedScript).toContain('var encoder = app.encoder');
      expect(generatedScript).toContain('encoder.encodeSequence(');
      expect(generatedScript).toContain('"C:/exports/output.mp4"');
      expect(generatedScript).toContain('"C:/presets/h264.epr"');
      expect(generatedScript).toContain('if (typeof encoder.launchEncoder === "function")');
      expect(generatedScript).toContain('if (true)');
      expect(generatedScript).toContain('encoder.startBatch();');
    });

    it('reapplies preserved effects when replace_clip receives preserveEffects', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Clip replaced'
      });

      const result = await tools.executeTool('replace_clip', {
        clipId: 'clip-1',
        newProjectItemId: 'item-2',
        preserveEffects: true
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var shouldPreserveEffects = 1 === 1;');
      expect(generatedScript).toContain('if (shouldPreserveEffects && info.clip.components) {');
      expect(generatedScript).toContain('var preservedEffects = [];');
      expect(generatedScript).toContain('var intrinsicComponentNames = {');
      expect(generatedScript).toContain('preservedEffects.push({');
      expect(generatedScript).toContain('reappliedEffects.push(effectRecord.displayName || effectRecord.matchName);');
    });

    it('routes delete_project_item through Project.deleteAsset for footage while guarding references', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        deleted: true,
      });

      const result = await tools.executeTool('delete_project_item', {
        projectItemId: 'item-1',
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('function __collectProjectItemReferences(nodeId)');
      expect(generatedScript).toContain('Project item is still referenced by clips in the project');
      expect(generatedScript).toContain('function __resolveProjectViewIdForCurrentProject()');
      expect(generatedScript).toContain('app.setProjectViewSelection([item], projectViewId);');
      expect(generatedScript).toContain('item.select();');
      expect(generatedScript).toContain('app.project.deleteAsset();');
      expect(generatedScript).toContain('var remaining = __findProjectItem("item-1");');
      expect(generatedScript).toContain('selectionMode: selectionMode');
      expect(generatedScript).toContain('allowReferenced: false');
    });

    it('lets delete_project_item bypass the reference guard when explicitly allowed', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        deleted: true,
      });

      const result = await tools.executeTool('delete_project_item', {
        projectItemId: 'item-1',
        allowReferenced: true,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('if (references.length && false) {');
      expect(generatedScript).toContain('allowReferenced: true');
    });

    it('applies LUT intensity when apply_lut receives intensity', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'LUT applied'
      });

      const result = await tools.executeTool('apply_lut', {
        clipId: 'clip-1',
        lutPath: 'C:/looks/cinematic.cube',
        intensity: 35
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('p.displayName === "Input LUT"');
      expect(generatedScript).toContain('p.displayName === "Input LUT Intensity"');
      expect(generatedScript).toContain('p.displayName === "Blend"');
      expect(generatedScript).toContain('p.setValue(35, true)');
    });

    it('activates the requested sequence before add_track', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'audio track added'
      });

      const result = await tools.executeTool('add_track', {
        sequenceId: 'sequence-2',
        trackType: 'audio'
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sequence = __findSequence("sequence-2")');
      expect(generatedScript).toContain('app.project.openSequence(sequence.sequenceID);');
      expect(generatedScript).toContain('var qeSeq = qe.project.getActiveSequence();');
    });

    it('uses a reverse speed multiplier when reverse_clip delegates to speed_change', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Clip speed adjusted'
      });

      const result = await tools.executeTool('reverse_clip', {
        clipId: 'clip-1',
        maintainAudioPitch: true
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('qeClip.setSpeed(-1');
      expect(generatedScript).toContain('qeClip.setSpeed(-1, 1);');
      expect(generatedScript).not.toContain('qeClip.setSpeed(-100');
    });

    it('imports folders through app.project.importFiles and resolves bins by name safely', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        importedItems: [],
        errors: [],
        totalImported: 0,
        totalErrors: 0
      });

      const folderPath = 'C:/media/"selects"';
      const binName = 'Daily "Selects"';
      const result = await tools.executeTool('import_folder', {
        folderPath,
        binName,
        recursive: true
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain(`var folder = new Folder(${JSON.stringify(folderPath)});`);
      expect(generatedScript).toContain(`targetBin = __findChildByName(app.project.rootItem, ${JSON.stringify(binName)}) || app.project.rootItem;`);
      expect(generatedScript).toContain('var importResult = app.project.importFiles([file.fsName], true, targetBin, false);');
      expect(generatedScript).toContain('file instanceof Folder && 1 === 1');
      expect(generatedScript).not.toContain('targetBin.importFiles([file.fsName]);');
      expect(generatedScript).not.toContain(`app.project.rootItem.children[${JSON.stringify(binName)}]`);
    });

    it('resolves parent bins by name safely when creating bins', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        binName: 'New Bin',
        binId: 'bin-1',
        parentBin: 'Parent "Bin"'
      });

      const parentBinName = 'Parent "Bin"';
      const result = await tools.executeTool('create_bin', {
        name: 'New Bin',
        parentBinName
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain(`parentBin = __findChildByName(app.project.rootItem, ${JSON.stringify(parentBinName)}) || app.project.rootItem;`);
      expect(generatedScript).not.toContain(`app.project.rootItem.children[${JSON.stringify(parentBinName)}]`);
    });

    it('converts audio keyframe times from seconds to ticks before writing them', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Audio keyframes added',
        addedKeyframes: []
      });

      const result = await tools.executeTool('add_audio_keyframes', {
        clipId: 'clip-1',
        keyframes: [
          { time: 1.5, level: -6 }
        ]
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var keyframeTimeTicks = __secondsToTicks(1.5);');
      expect(generatedScript).toContain('volumeProperty.addKey(keyframeTimeTicks);');
      expect(generatedScript).toContain('volumeProperty.setValueAtKey(keyframeTimeTicks, -6, true);');
      expect(generatedScript).toContain('addedKeyframes.push({ time: 1.5, level: -6, ticks: keyframeTimeTicks });');
    });

    it('converts generic keyframe writes, interpolation updates, and removals from seconds to ticks', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Keyframe added'
      });

      let result = await tools.executeTool('add_keyframe', {
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
        time: 1.25,
        value: 110
      });

      expect(result.success).toBe(true);
      let generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var keyTimeTicks = __secondsToTicks(1.25);');
      expect(generatedScript).toContain('param.addKey(keyTimeTicks);');
      expect(generatedScript).toContain('var requestedValue = 110;');
      expect(generatedScript).toContain('var hostValueInfo = __prepareKeyframeValueForHost(');
      expect(generatedScript).toContain('param.setValueAtKey(keyTimeTicks, hostValueInfo.hostValue, true);');

      mockBridge.executeScript.mockClear();
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Keyframe interpolation updated'
      });

      result = await tools.executeTool('set_keyframe_interpolation', {
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
        time: 1.25,
        interpolation: 'time'
      });

      expect(result.success).toBe(true);
      generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var keyTimeTicks = __secondsToTicks(1.25);');
      expect(generatedScript).toContain('__keyExistsAtTicks(param, keyTimeTicks)');
      expect(generatedScript).toContain('param.setInterpolationTypeAtKey(keyTimeTicks, interpolationMode, true);');
      expect(generatedScript).not.toContain('param.setValueAtKey(');

      mockBridge.executeScript.mockClear();
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Keyframe removed'
      });

      result = await tools.executeTool('remove_keyframe', {
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
        time: 1.25
      });

      expect(result.success).toBe(true);
      generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var keyTimeTicks = __secondsToTicks(1.25);');
      expect(generatedScript).toContain('param.removeKey(keyTimeTicks);');
    });

    it('converts retrieved keyframe times from ticks back to seconds with key-time fallbacks', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        isTimeVarying: true,
        keyframes: []
      });

      const result = await tools.executeTool('get_keyframes', {
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale'
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('if (typeof param.getKeyTime === "function") {');
      expect(generatedScript).toContain('keyTicks = param.getKeyTime(k);');
      expect(generatedScript).toContain('} else if (typeof param.getKeys === "function") {');
      expect(generatedScript).toContain('var allKeys = param.getKeys();');
      expect(generatedScript).toContain('var keyTimeTicks = __readKeyTicksValue(keyTicks);');
      expect(generatedScript).toContain('var keyTimeSeconds = __readKeySecondsValue(keyTicks);');
      expect(generatedScript).toContain('var valueInfo = __convertKeyframeValueForUserOutput(');
      expect(generatedScript).toContain('time: keyTimeSeconds');
      expect(generatedScript).toContain('ticks: keyTimeTicks');
      expect(generatedScript).toContain('hostValue: valueInfo.hostValue');
    });

    it('activates the requested sequence before delete_track', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Track deleted successfully'
      });

      const result = await tools.executeTool('delete_track', {
        sequenceId: 'sequence-2',
        trackType: 'video',
        trackIndex: 1
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sequence = __findSequence("sequence-2")');
      expect(generatedScript).toContain('app.project.openSequence(sequence.sequenceID);');
      expect(generatedScript).toContain('var tracks = sequence.videoTracks;');
    });

    it('activates the requested sequence before lock_track', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Track locked successfully'
      });

      const result = await tools.executeTool('lock_track', {
        sequenceId: 'sequence-2',
        trackType: 'audio',
        trackIndex: 0,
        locked: true
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var sequence = __findSequence("sequence-2")');
      expect(generatedScript).toContain('app.project.openSequence(sequence.sequenceID);');
      expect(generatedScript).toContain('var tracks = sequence.audioTracks;');
      expect(generatedScript).toContain('var lockState = 1;');
      expect(generatedScript).toContain('tracks[0].setLocked(lockState === 1);');
    });

    it('activates the clip sequence before link_audio_video selection linking', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Clip linked',
      });

      const result = await tools.executeTool('link_audio_video', {
        clipId: 'clip-1',
        linked: true,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var seq = info.sequenceId ? __openSequenceById(info.sequenceId) : app.project.activeSequence;');
      expect(generatedScript).toContain('info = __findClip("clip-1") || info;');
      expect(generatedScript).toContain('if (1 === 1) { seq.linkSelection(); } else { seq.unlinkSelection(); }');
      expect(generatedScript).toContain('message: "Clip linked"');
    });

    it('uses explicit numeric flags for enable_disable_clip state changes', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Clip disabled',
      });

      const result = await tools.executeTool('enable_disable_clip', {
        clipId: 'clip-1',
        enabled: false,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('var enabledValue = 0;');
      expect(generatedScript).toContain('info.clip.disabled = enabledValue === 1 ? false : true;');
      expect(generatedScript).toContain('message: "Clip disabled"');
    });

    it('passes numeric linked-audio flags into detect_scene_edits', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Scene edit detection performed',
      });

      const result = await tools.executeTool('detect_scene_edits', {
        sequenceId: 'sequence-1',
        action: 'ApplyCuts',
        applyCutsToLinkedAudio: false,
        sensitivity: 'High',
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('performSceneEditDetectionOnSelection("ApplyCuts", 0, "High")');
    });

    it('does not leave raw quoted ExtendScript interpolations for user-controlled strings', () => {
      const source = readFileSync(
        path.join(process.cwd(), 'src', 'tools', 'index.ts'),
        'utf8',
      );
      const unsafePatterns = [
        '__findSequence("${',
        '__findClip("${',
        'new Folder("${',
        'createBin("${',
        'getVideoEffectByName("${',
        'getAudioEffectByName("${',
        'getVideoTransitionByName("${',
        'getAudioTransitionByName("${',
        'p.setValue("${lutPath}"',
        'sequenceId: "${',
        'clipId: "${',
        'effectName: "${',
        'transitionName: "${',
        'outputPath: "${',
      ];

      unsafePatterns.forEach((pattern) => {
        expect(source).not.toContain(pattern);
      });
    });

    it('quotes sequence ids in list_sequence_tracks and keeps loop indices distinct', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequenceId: 'sequence-"1"',
        videoTracks: [],
        audioTracks: [],
      });

      const sequenceId = 'sequence-"1"';
      const result = await tools.executeTool('list_sequence_tracks', {
        sequenceId,
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain(`var sequence = __findSequence(${JSON.stringify(sequenceId)});`);
      expect(generatedScript).toContain(`sequenceId: ${JSON.stringify(sequenceId)},`);
      expect(generatedScript).toContain('for (var videoTrackIndex = 0; videoTrackIndex < sequence.videoTracks.numTracks; videoTrackIndex++)');
      expect(generatedScript).toContain('for (var audioTrackIndex = 0; audioTrackIndex < sequence.audioTracks.numTracks; audioTrackIndex++)');
    });

    it('includes continuity metadata in list_sequence_tracks clip snapshots', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequenceId: 'sequence-1',
        videoTracks: [],
        audioTracks: [],
      });

      const result = await tools.executeTool('list_sequence_tracks', {
        sequenceId: 'sequence-1',
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('clipIndex: videoClipIndex');
      expect(generatedScript).toContain('trackIndex: videoTrackIndex');
      expect(generatedScript).toContain("trackType: 'video'");
      expect(generatedScript).toContain('gapAfterSec');
      expect(generatedScript).toContain('overlapAfterSec');
      expect(generatedScript).toContain('usedActiveSequenceFallback');
    });

    it('adds adjacency metadata to list_sequence_tracks results for conformance review', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequenceId: 'seq-1',
        videoTracks: [],
        audioTracks: [],
      });

      const result = await tools.executeTool('list_sequence_tracks', {
        sequenceId: 'seq-1',
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('gapAfterSec');
      expect(generatedScript).toContain('overlapAfterSec');
      expect(generatedScript).toContain('sequenceName: sequence.name');
      expect(generatedScript).toContain('trackIndex: videoTrackIndex');
    });

    it('uses the requested sequence when adding and deleting markers', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        markerId: 'marker-1',
      });

      const sequenceId = 'sequence-"markers"';
      let result = await tools.executeTool('add_marker', {
        sequenceId,
        time: 4.2,
        name: 'Cue',
      });

      expect(result.success).toBe(true);
      let generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain(`var sequence = __findSequence(${JSON.stringify(sequenceId)});`);
      expect(generatedScript).toContain('if (!sequence) sequence = app.project.activeSequence;');

      mockBridge.executeScript.mockClear();
      result = await tools.executeTool('delete_marker', {
        sequenceId,
        markerId: 'marker-1',
      });

      expect(result.success).toBe(true);
      generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain(`var sequence = __findSequence(${JSON.stringify(sequenceId)});`);
      expect(generatedScript).toContain('if (!sequence) sequence = app.project.activeSequence;');
      expect(generatedScript).toContain('var marker = sequence.markers.getFirstMarker();');
      expect(generatedScript).toContain('var nextMarker = sequence.markers.getNextMarker(marker);');
      expect(generatedScript).toContain('sequence.markers.deleteMarker(marker);');
      expect(generatedScript).not.toContain('sequence.markers.deleteMarker(i);');
    });

    it('uses the requested sequence when toggling track visibility', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        message: 'Track visibility toggled'
      });

      const sequenceId = 'sequence-"visibility"';
      const result = await tools.executeTool('toggle_track_visibility', {
        sequenceId,
        trackIndex: 1,
        visible: false
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain(`var sequence = __findSequence(${JSON.stringify(sequenceId)});`);
      expect(generatedScript).toContain('app.project.openSequence(sequence.sequenceID);');
      expect(generatedScript).toContain('sequence = app.project.activeSequence || sequence;');
      expect(generatedScript).toContain('} else if (1 < 0) {');
      expect(generatedScript).toContain('var visibilityState = 0 === 1;');
      expect(generatedScript).toContain('if (1 < sequence.videoTracks.numTracks) {');
      expect(generatedScript).toContain('} else if (1 < sequence.audioTracks.numTracks) {');
      expect(generatedScript).not.toContain('>= 0 &&');
      expect(generatedScript).not.toContain('var sequence = app.project.activeSequence;');
    });

    it('leaves the original clip in place when cross-track move cannot be confirmed', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-1'
      });

      const result = await tools.executeTool('move_clip', {
        clipId: 'clip-1',
        newTime: 12,
        newTrackIndex: 2
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('if (!movedClip) {');
      expect(generatedScript).toContain('original clip was left in place');
      expect(generatedScript.indexOf('if (!movedClip) {')).toBeLessThan(generatedScript.indexOf('clip.remove(false, true);'));
    });
  });

  describe('high-level workflow tools', () => {
    it('reviews edit reasonability from local guide and manifest files', async () => {
      const { docxPath, manifestPath } = await createReviewFixture();

      const result = await tools.executeTool('review_edit_reasonability', {
        docxPath,
        mediaManifestPath: manifestPath,
        assetPaths: ['E:/source/video/shot01.mp4', 'E:/source/images/still01.jpg'],
        transitionName: 'Cube Spin',
        transitionPolicy: 'explicit',
        clipDuration: 4,
        motionStyle: 'alternate',
        mediaPolicy: 'reference-only',
      });

      expect(result.success).toBe(true);
      expect(result.review.status).toBe('ready');
      expect(result.review.summary.selectedAssetCount).toBe(2);
      expect(result.markdownReport).toContain('## Review Status');
    });

    it('flags guide-derived DOCX transitions as manual-only during review', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        guideParagraphs: [
          '1. Use Cube Spin transition between clips.',
        ],
        assets: [
          {
            absolutePath: 'E:/source/video/shot01.mp4',
            relativePath: 'video/shot01.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/video/shot02.mp4',
            relativePath: 'video/shot02.mp4',
            extension: '.mp4',
            category: 'video',
          },
        ],
      });

      const result = await tools.executeTool('review_edit_reasonability', {
        docxPath,
        mediaManifestPath: manifestPath,
        assetPaths: ['E:/source/video/shot01.mp4', 'E:/source/video/shot02.mp4'],
        transitionName: 'Cube Spin',
        transitionPolicy: 'guide-derived',
        motionStyle: 'none',
        mediaPolicy: 'reference-only',
      });

      expect(result.success).toBe(true);
      expect(result.review.status).toBe('blocked');
      expect(result.review.findings.some((finding: any) => finding.code === 'guide-derived-transition-manual-only')).toBe(true);
    });

    it('plans an edit assembly from local guide and manifest files', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        assets: [
          {
            absolutePath: 'E:/source/video/shot10.mp4',
            relativePath: 'video/shot10.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/video/shot2.mp4',
            relativePath: 'video/shot2.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/docs/guide.docx',
            relativePath: 'docs/guide.docx',
            extension: '.docx',
            category: 'document',
          },
        ],
      });

      const result = await tools.executeTool('plan_edit_assembly', {
        docxPath,
        mediaManifestPath: manifestPath,
        sequenceName: 'Planned Spot',
      });

      expect(result.success).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.plan.sequenceName).toBe('Planned Spot');
      expect(result.plan.assetPaths).toEqual([
        'E:/source/video/shot2.mp4',
        'E:/source/video/shot10.mp4',
      ]);
      expect(result.plan.motionStyle).toBe('none');
      expect(result.markdownPlan).toContain('# Edit Assembly Plan');
    });

    it('uses referenceBlueprintPath to switch plan_edit_assembly into blueprint matching mode', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        assets: [
          {
            absolutePath: 'E:/source/video/wide_intro_5s.mp4',
            relativePath: 'video/wide_intro_5s.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/video/medium_action_3s.mp4',
            relativePath: 'video/medium_action_3s.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/images/close_detail_2s.jpg',
            relativePath: 'images/close_detail_2s.jpg',
            extension: '.jpg',
            category: 'image',
          },
        ],
      });
      const blueprintRoot = await mkdtemp(path.join(os.tmpdir(), 'premiere-blueprint-tool-'));
      const blueprintPath = path.join(blueprintRoot, 'reference-blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          sourcePath: 'E:/reference/demo.mp4',
          totalDuration: 10,
          estimatedFrameRate: 25,
          shots: [
            {
              index: 0,
              startSec: 0,
              endSec: 5,
              durationSec: 5,
              transitionIn: null,
              transitionOut: 'cut',
              dominantColor: 'neutral',
              motionAmount: 'medium',
              hasText: false,
              shotType: 'wide',
            },
            {
              index: 1,
              startSec: 5,
              endSec: 7,
              durationSec: 2,
              transitionIn: 'cut',
              transitionOut: null,
              dominantColor: 'neutral',
              motionAmount: 'low',
              hasText: false,
              shotType: 'close',
            },
          ],
          pacing: {
            avgShotDurationSec: 3.5,
            minShotDurationSec: 2,
            maxShotDurationSec: 5,
            cutRate: 2,
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
        }),
        'utf8',
      );
      const actualMatcher = jest.requireActual('../../video-reference-matcher.js') as typeof import('../../video-reference-matcher.js');
      mockMatchAssetsToBlueprint.mockImplementation(actualMatcher.matchAssetsToBlueprint);

      const result = await tools.executeTool('plan_edit_assembly', {
        docxPath,
        mediaManifestPath: manifestPath,
        referenceBlueprintPath: blueprintPath,
      });

      expect(result.success).toBe(true);
      expect(result.plan.selectedAssets.map((entry: any) => entry.asset.relativePath)).toEqual([
        'images/close_detail_2s.jpg',
        'video/wide_intro_5s.mp4',
      ]);
    });

    it('blocks assemble_product_spot when pre-review fails', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        assets: [
          {
            absolutePath: 'E:/source/video/shot01.mp4',
            relativePath: 'video/shot01.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/docs/guide.docx',
            relativePath: 'docs/guide.docx',
            extension: '.docx',
            category: 'document',
          },
        ],
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Blocked Product Spot',
        docxPath,
        mediaManifestPath: manifestPath,
        reviewBeforeAssemble: true,
        assetPaths: ['E:/source/video/shot01.mp4', 'E:/source/docs/guide.docx'],
        transitionName: 'Cross Dissolve',
        transitionPolicy: 'explicit',
        clipDuration: 4,
        motionStyle: 'alternate',
        mediaPolicy: 'reference-only',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.review.status).toBe('blocked');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });

    it('continues assemble_product_spot when pre-review passes', async () => {
      const { docxPath, manifestPath } = await createReviewFixture();
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-review-pass',
        name: 'Reviewed Product Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.jpg' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.jpg', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Reviewed Product Spot',
        docxPath,
        mediaManifestPath: manifestPath,
        reviewBeforeAssemble: true,
        assetPaths: ['E:/source/video/shot01.mp4', 'E:/source/images/still01.jpg'],
        clipDuration: 4,
        motionStyle: 'none',
        mediaPolicy: 'reference-only',
      });

      expect(result.success).toBe(true);
      expect(result.review.status).toBe('ready');
      expect(result.sequence.id).toBe('seq-review-pass');
      expect(mockBridge.createSequence).toHaveBeenCalled();
    });

    it('blocks build_brand_spot_from_mogrt_and_assets when forwarded pre-review fails', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        assets: [
          {
            absolutePath: 'E:/source/video/shot01.mp4',
            relativePath: 'video/shot01.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/docs/guide.docx',
            relativePath: 'docs/guide.docx',
            extension: '.docx',
            category: 'document',
          },
        ],
      });

      const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
        sequenceName: 'Blocked Brand Spot',
        docxPath,
        mediaManifestPath: manifestPath,
        reviewBeforeAssemble: true,
        assetPaths: ['E:/source/video/shot01.mp4', 'E:/source/docs/guide.docx'],
        transitionName: 'Cross Dissolve',
        transitionPolicy: 'explicit',
        clipDuration: 4,
        motionStyle: 'alternate',
        mediaPolicy: 'reference-only',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.review.status).toBe('blocked');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });

    it('builds a motion graphics demo sequence', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-1',
        name: 'Demo Sequence'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-3', name: '03_finish.png' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-3', name: '03_finish.png' } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Demo Sequence'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-1');
      expect(result.assets).toHaveLength(3);
      expect(mockBridge.importMedia).toHaveBeenCalledTimes(3);
      expect(mockBridge.addToTimeline).toHaveBeenCalledTimes(3);
    });

    it('uses the requested transition settings for build_motion_graphics_demo', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-demo',
        name: 'Configured Demo Sequence'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-3', name: '03_finish.png' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-3', name: '03_finish.png' } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Configured Demo Sequence',
        transitionName: 'Dip To Black',
        transitionDuration: 1.25
      });

      expect(result.success).toBe(true);
      const transitionScripts = mockBridge.executeScript.mock.calls
        .map((call) => call[0] as string)
        .filter((script) => script.includes('qeClip.addTransition'));
      expect(transitionScripts).toHaveLength(2);
      for (const script of transitionScripts) {
        expect(script).toContain('Dip To Black');
        expect(script).toContain('duration: 1.25');
        expect(script).not.toContain('Cross Dissolve');
      }
    });

    it('derives demo transition settings from naturalLanguagePrompt when explicit transition args are omitted', async () => {
      mockParseNaturalLanguageRequest.mockReturnValue({
        targetDurationSec: 30,
        pacingStyle: 'fast',
        visualStyle: 'kinetic visuals',
        transitionPreference: 'dynamic',
        colorMood: 'auto',
        hasVoiceover: false,
        hasMusic: false,
        textOverlayStyle: 'none',
        rawPrompt: 'fast dynamic transitions',
      });
      mockBuildNLAssemblyPlan.mockReturnValue({
        intent: {
          targetDurationSec: 30,
          pacingStyle: 'fast',
          visualStyle: 'kinetic visuals',
          transitionPreference: 'dynamic',
          colorMood: 'auto',
          hasVoiceover: false,
          hasMusic: false,
          textOverlayStyle: 'none',
          rawPrompt: 'fast dynamic transitions',
        },
        sequenceName: 'Prompt Demo',
        clipDuration: 2.5,
        transitionName: 'Cube Spin',
        motionStyle: 'alternate',
        assetCount: 3,
        warnings: [],
      });
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-prompt-demo',
        name: 'Prompt Demo'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-3', name: '03_finish.png' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-3', name: '03_finish.png' } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Prompt Demo',
        naturalLanguagePrompt: 'fast dynamic transitions',
      });

      expect(result.success).toBe(true);
      const transitionScripts = mockBridge.executeScript.mock.calls
        .map((call) => call[0] as string)
        .filter((script) => script.includes('qeClip.addTransition'));
      expect(transitionScripts).toHaveLength(2);
      for (const script of transitionScripts) {
        expect(script).toContain('Cube Spin');
      }
    });

    it('writes build_motion_graphics_demo keyframes using clip-relative times', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-demo-relative',
        name: 'Relative Demo'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-3', name: '03_finish.png' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-3', name: '03_finish.png' } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Relative Demo'
      });

      expect(result.success).toBe(true);
      const keyframeScripts = mockBridge.executeScript.mock.calls
        .map((call) => call[0] as string)
        .filter((script) => script.includes('message: "Keyframe added"'));
      expect(keyframeScripts).toHaveLength(6);
      expect(keyframeScripts.some((script) => script.includes('__secondsToTicks(5.005)'))).toBe(false);
      expect(keyframeScripts.some((script) => script.includes('__secondsToTicks(10.01)'))).toBe(false);
      expect(keyframeScripts.some((script) => script.includes('__secondsToTicks(0.005)'))).toBe(true);
      expect(keyframeScripts.some((script) => script.includes('__secondsToTicks(0.01)'))).toBe(true);
    });

    it('assembles a product spot from provided assets', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-2',
        name: 'Product Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

    const result = await tools.executeTool('assemble_product_spot', {
      sequenceName: 'Product Spot',
      assetPaths: ['/a.mp4', '/b.mp4'],
      clipDuration: 4,
      motionStyle: 'none'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-2');
      expect(result.mediaPolicy).toBe('reference-only');
      expect(result.copyOperations).toBe(0);
      expect(result.transitionPolicy).toBe('explicit-only');
      expect(result.transitions).toHaveLength(0);
      expect(result.imported).toHaveLength(2);
      expect(result.placements).toHaveLength(2);
    });

    it('writes assemble_product_spot motion keyframes using clip-relative times', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-relative-spot',
        name: 'Relative Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({ success: true, message: 'Keyframe added' } as any)
        .mockResolvedValueOnce({ success: true, message: 'Keyframe added' } as any)
        .mockResolvedValueOnce({ success: true, message: 'Keyframe added' } as any)
        .mockResolvedValueOnce({ success: true, message: 'Keyframe added' } as any)
        .mockResolvedValueOnce({
          success: true,
          sequenceId: 'seq-relative-spot',
          videoTracks: [
            {
              index: 1,
              name: 'Video 2',
              clipCount: 2,
              clips: [
                { id: 'clip-a', name: 'a.mp4', trackIndex: 1, startTime: 0, endTime: 4, duration: 4 },
                { id: 'clip-b', name: 'b.mp4', trackIndex: 1, startTime: 4, endTime: 8, duration: 4 },
              ],
            },
          ],
          audioTracks: []
        } as any);

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Relative Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        clipDuration: 4,
        motionStyle: 'alternate',
        videoTrackIndex: 1,
      });

      expect(result.success).toBe(true);
      const keyframeScripts = mockBridge.executeScript.mock.calls
        .map((call) => call[0] as string)
        .filter((script) => script.includes('message: "Keyframe added"'));
      expect(keyframeScripts).toHaveLength(4);
      expect(keyframeScripts.every((script) => !script.includes('__secondsToTicks(4);'))).toBe(true);
      expect(keyframeScripts.filter((script) => script.includes('__secondsToTicks(0);'))).toHaveLength(2);
      expect(keyframeScripts.filter((script) => script.includes('__secondsToTicks(3.9);'))).toHaveLength(2);
    });

    it('uses build_timeline_from_xml for xml-compatible assemble_product_spot motion and transitions', async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'premiere-spot-xml-'));
      mockBridge.getBridgeDirectory = jest.fn().mockReturnValue(tempDir);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.jpg' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.jpg' } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: true,
          settings: {
            name: '参考竖屏序列',
            sequenceID: 'seq-ref-1',
            width: 1080,
            height: 1920,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          items: [
            {
              id: 'item-a',
              name: 'a.jpg',
              type: 'footage',
              mediaPath: 'E:/source/a.jpg',
              metadata: {
                resolution: '2160 x 3840',
              },
            },
            {
              id: 'item-b',
              name: 'b.jpg',
              type: 'footage',
              mediaPath: 'E:/source/b.jpg',
              metadata: {
                resolution: '2160 x 3840',
              },
            },
          ],
          bins: [],
          totalItems: 2,
          totalBins: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          openResult: true,
          originalProjectPath: 'E:/projects/original.prproj',
          tempProjectDirectory: 'E:/temp/timeline-project-1',
          xmlPath: 'E:/temp/timeline-1.xml',
        })
        .mockResolvedValueOnce({
          success: true,
          tempProjectPath: 'E:/temp/timeline-project-1/imported.prproj',
          sequence: {
            id: 'seq-temp-1',
            name: 'XML Product Spot',
            duration: 10,
            videoTrackCount: 1,
            audioTrackCount: 0,
          },
          createdSequences: [
            {
              id: 'seq-temp-1',
              name: 'XML Product Spot',
              duration: 10,
              videoTrackCount: 1,
              audioTrackCount: 0,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          currentProjectPath: 'E:/projects/original.prproj',
        })
        .mockResolvedValueOnce({
          success: true,
          before: {
            'seq-existing-1': true,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          sequence: {
            id: 'seq-xml-1',
            name: 'XML Product Spot',
            duration: 10,
            videoTrackCount: 1,
            audioTrackCount: 0,
          },
          createdSequences: [
            {
              id: 'seq-xml-1',
              name: 'XML Product Spot',
              duration: 10,
              videoTrackCount: 1,
              audioTrackCount: 0,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          sequenceId: 'seq-xml-1',
          sequenceName: 'XML Product Spot',
          videoTracks: [
            {
              index: 0,
              name: 'Video 1',
              clipCount: 2,
              clips: [
                { id: 'clip-a', name: 'a.jpg', startTime: 0, endTime: 5, duration: 5 },
                { id: 'clip-b', name: 'b.jpg', startTime: 5, endTime: 10, duration: 5 },
              ],
            },
          ],
          audioTracks: [],
        } as any);

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'XML Product Spot',
        assetPaths: ['/a.jpg', '/b.jpg'],
        clipDuration: 5,
        transitionName: 'Cross Dissolve',
        transitionDuration: 0.5,
        motionStyle: 'alternate',
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-xml-1');
      expect(result.xmlPath).toMatch(/timeline-.*\.xml$/);
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
      expect(mockBridge.addToTimeline).not.toHaveBeenCalled();
      expect(mockBridge.importMedia).toHaveBeenCalledTimes(2);
      expect(result.placements).toHaveLength(2);

      const writtenXml = readFileSync(result.xmlPath, 'utf8');
      expect(writtenXml).toContain('<name>Cross Dissolve</name>');
      expect(writtenXml).toContain('<keyframe><when>0</when><value>50</value></keyframe>');
      expect(writtenXml).toContain('<keyframe><when>150</when><value>54</value></keyframe>');

      const scripts = mockBridge.executeScript.mock.calls.map((call) => call[0] as string);
      expect(scripts.find((script) => script.includes('app.openFCPXML(xmlFile.fsName'))).toBeDefined();
      expect(scripts.find((script) => script.includes('app.project.importSequences('))).toBeDefined();
      expect(scripts.find((script) => script.includes('not_ready_yet'))).toBeDefined();
    });

    it('uses naturalLanguagePrompt defaults when assemble_product_spot omits explicit timing and transition settings', async () => {
      mockParseNaturalLanguageRequest.mockReturnValue({
        targetDurationSec: 30,
        pacingStyle: 'fast',
        visualStyle: 'product visuals',
        transitionPreference: 'clean',
        colorMood: 'auto',
        hasVoiceover: false,
        hasMusic: false,
        textOverlayStyle: 'none',
        rawPrompt: '30s product visuals, fast, clean transitions',
      });
      mockBuildNLAssemblyPlan.mockReturnValue({
        intent: {
          targetDurationSec: 30,
          pacingStyle: 'fast',
          visualStyle: 'product visuals',
          transitionPreference: 'clean',
          colorMood: 'auto',
          hasVoiceover: false,
          hasMusic: false,
          textOverlayStyle: 'none',
          rawPrompt: '30s product visuals, fast, clean transitions',
        },
        sequenceName: 'Prompt Driven Spot',
        clipDuration: 2.5,
        transitionName: null,
        motionStyle: 'none',
        assetCount: 2,
        warnings: [],
      });
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-prompt',
        name: 'Prompt Driven Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 2.5 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 2.5, outPoint: 5 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionName: 'Cross Dissolve',
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Prompt Driven Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        naturalLanguagePrompt: '30s product visuals, fast, clean transitions',
      });

      expect(result.success).toBe(true);
      expect(result.transitionPolicy).toBe('explicit-only');
      expect(result.transitions).toHaveLength(0);
      expect(result.clipDuration).toBe(2.5);
      expect(result.naturalLanguagePlan.transitionName).toBeNull();
      expect(result.naturalLanguagePlan.motionStyle).toBe('none');
    });

    it('uses editingBlueprintPath defaults when assemble_product_spot omits explicit timing and transition settings', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-editing-blueprint-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'cold open with bold text',
          averageShotDuration: 1.8,
          pacingCurve: 'dynamic escalation',
          transitionPattern: ['Dip To Black', 'cut'],
          textOverlayStyle: 'bold kinetic captions',
          musicBeatStrategy: 'cut on beat',
          ctaPattern: 'hard CTA on final beat',
          avoidPatterns: ['slow dissolve'],
          referenceCount: 4,
          targetPlatform: 'douyin',
          targetDurationRange: [12, 18],
        }),
        'utf8',
      );

      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-style-blueprint',
        name: 'Style Blueprint Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 1.8 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 1.8, outPoint: 3.6 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Style Blueprint Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        editingBlueprintPath: blueprintPath,
      });

      expect(result.success).toBe(true);
      expect(result.clipDuration).toBe(1.8);
      expect(result.motionStyle).toBe('alternate');
      expect(result.transitionName).toBe('Dip To Black');
      expect(result.transitionPolicy).toBe('explicit');
      expect(result.editingBlueprintPath).toBe(blueprintPath);
      expect(result.editingBlueprint.referenceCount).toBe(4);
      expect(result.transitions).toHaveLength(1);

      const transitionScripts = mockBridge.executeScript.mock.calls
        .map((call) => call[0] as string)
        .filter((script) => script.includes('qeClip.addTransition'));
      expect(transitionScripts).toHaveLength(1);
      expect(transitionScripts[0]).toContain('Dip To Black');
    });

    it('auto-plans assemble_product_spot from the guide and manifest when assetPaths are omitted', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        assets: [
          {
            absolutePath: 'E:/source/video/shot10.mp4',
            relativePath: 'video/shot10.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/video/shot2.mp4',
            relativePath: 'video/shot2.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/docs/guide.docx',
            relativePath: 'docs/guide.docx',
            extension: '.docx',
            category: 'document',
          },
        ],
      });
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-auto-plan',
        name: 'Auto Planned Product Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'shot2.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'shot10.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'shot2.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'shot10.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Auto Planned Product Spot',
        docxPath,
        mediaManifestPath: manifestPath,
        autoPlanFromManifest: true,
      });

      expect(result.success).toBe(true);
      expect(result.plannedFromManifest).toBe(true);
      expect(result.plan.assetPaths).toEqual([
        'E:/source/video/shot2.mp4',
        'E:/source/video/shot10.mp4',
      ]);
      expect(mockBridge.importMedia).toHaveBeenNthCalledWith(1, 'E:/source/video/shot2.mp4');
      expect(mockBridge.importMedia).toHaveBeenNthCalledWith(2, 'E:/source/video/shot10.mp4');
    });

    it('blocks guide-derived effects during auto-planned assembly even when applyGuideEffects is requested', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        guideParagraphs: [
          "1. Add 'Gaussian Blur' to the clip.",
          "2. Copy 'Gaussian Blur' to all other clips with CTRL+ALT+V.",
        ],
        assets: [
          {
            absolutePath: 'E:/source/video/shot01.mp4',
            relativePath: 'video/shot01.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/video/shot02.mp4',
            relativePath: 'video/shot02.mp4',
            extension: '.mp4',
            category: 'video',
          },
        ],
      });
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-effects',
        name: 'Guided Effects Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: 'shot01.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: 'shot02.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: 'shot01.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: 'shot02.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript = jest
        .fn()
        .mockResolvedValueOnce({ success: true } as any)
        .mockResolvedValueOnce({ success: true } as any)
        .mockResolvedValueOnce({
          success: true,
          videoTracks: [
            {
              index: 0,
              name: 'Video 1',
              clipCount: 2,
              clips: [
                { id: 'clip-1', name: 'shot01.mp4', startTime: 0, endTime: 4, duration: 4 },
                { id: 'clip-2', name: 'shot02.mp4', startTime: 4, endTime: 8, duration: 4 },
              ]
            }
          ],
          audioTracks: []
        } as any);

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Guided Effects Spot',
        docxPath,
        mediaManifestPath: manifestPath,
        autoPlanFromManifest: true,
        applyGuideEffects: true,
        motionStyle: 'none',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Guide-derived DOCX effects are manual-only');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
      expect(result.plan.effectPlan.globalClipEffects).toEqual(['Gaussian Blur']);
    });

    it('blocks assemble_product_spot when auto planning finds no visual assets', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        assets: [
          {
            absolutePath: 'E:/source/docs/guide.docx',
            relativePath: 'docs/guide.docx',
            extension: '.docx',
            category: 'document',
          },
        ],
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Blocked Auto Plan',
        docxPath,
        mediaManifestPath: manifestPath,
        autoPlanFromManifest: true,
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.plan.review.status).toBe('blocked');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });

    it('adds transitions only when a transition name is explicitly provided', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-2b',
        name: 'Product Spot With Transition'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionName: 'Cross Dissolve',
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Product Spot With Transition',
        assetPaths: ['/a.mp4', '/b.mp4'],
        transitionName: 'Cube Spin',
        transitionDuration: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.transitionPolicy).toBe('explicit');
      expect(result.transitions).toHaveLength(1);
      const generatedTransitionScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedTransitionScript).toContain('Clips must be adjacent to add a shared transition');
      expect(generatedTransitionScript).toContain('String(frames)');
      expect(generatedTransitionScript).not.toContain('frames + ":00"');
    });

    it('blocks guide-derived transitions during auto-planned assembly', async () => {
      const { docxPath, manifestPath } = await createReviewFixture({
        guideParagraphs: [
          "1. Use Cube Spin transition between clips.",
        ],
        assets: [
          {
            absolutePath: 'E:/source/video/shot01.mp4',
            relativePath: 'video/shot01.mp4',
            extension: '.mp4',
            category: 'video',
          },
          {
            absolutePath: 'E:/source/video/shot02.mp4',
            relativePath: 'video/shot02.mp4',
            extension: '.mp4',
            category: 'video',
          },
        ],
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Blocked Guide Transition Spot',
        docxPath,
        mediaManifestPath: manifestPath,
        autoPlanFromManifest: true,
        motionStyle: 'none',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });

    it('fails assemble_product_spot when an explicit transition operation fails', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-transition-fail',
        name: 'Broken Transition Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript = jest
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'Transition apply failed' } as any)
        .mockResolvedValueOnce({ success: true, videoTracks: [], audioTracks: [] } as any);

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Broken Transition Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        transitionName: 'Cube Spin',
        transitionDuration: 0.5,
        motionStyle: 'none',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.assemblyReview.status).toBe('blocked');
      expect(result.assemblyReview.summary.failedTransitionCount).toBe(1);
    });

    it('fails assemble_product_spot when timeline conformance review finds missing clips on the main track', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-track-mismatch',
        name: 'Broken Track Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript = jest.fn().mockResolvedValueOnce({
        success: true,
        videoTracks: [
          {
            index: 0,
            name: 'Video 1',
            clipCount: 1,
            clips: [
              {
                id: 'clip-a',
                name: 'a.mp4',
                startTime: 0,
                endTime: 4,
                duration: 4
              }
            ]
          }
        ],
        audioTracks: []
      } as any);

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Broken Track Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        motionStyle: 'none'
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.assemblyReview.status).toBe('blocked');
      expect(result.assemblyReview.findings[0].code).toBe('timeline-missing-clips');
    });

    it('surfaces sequence fallback metadata in assemble_product_spot assemblyReview', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-fallback-review',
        name: 'Fallback Review Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript = jest.fn().mockResolvedValueOnce({
        success: true,
        sequenceId: 'seq-fallback-review',
        resolvedSequenceId: 'seq-active',
        sequenceName: 'Recovered Active Sequence',
        usedActiveSequenceFallback: true,
        videoTracks: [
          {
            index: 0,
            name: 'Video 1',
            clipCount: 2,
            clips: [
              {
                id: 'clip-a',
                name: 'a.mp4',
                trackIndex: 0,
                clipIndex: 0,
                startTime: 0,
                endTime: 4,
                duration: 4,
                gapAfterSec: 0.2,
              },
              {
                id: 'clip-b',
                name: 'b.mp4',
                trackIndex: 0,
                clipIndex: 1,
                startTime: 4.2,
                endTime: 8.2,
                duration: 4,
              }
            ]
          }
        ],
        audioTracks: []
      } as any);

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Fallback Review Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        motionStyle: 'none'
      });

      expect(result.success).toBe(true);
      expect(result.assemblyReview.status).toBe('needs-review');
      expect(result.assemblyReview.summary.requestedSequenceId).toBe('seq-fallback-review');
      expect(result.assemblyReview.summary.resolvedSequenceId).toBe('seq-active');
      expect(result.assemblyReview.summary.usedActiveSequenceFallback).toBe(true);
      expect(result.assemblyReview.summary.continuityIssueCount).toBe(1);
      expect(result.assemblyReview.summary.continuityIssueSource).toBe('metadata');
      expect(result.assemblyReview.findings.map((finding: any) => finding.code)).toEqual([
        'timeline-sequence-fallback-used',
        'timeline-continuity-mismatch'
      ]);
    });

    it('builds a brand spot from assets without requiring a mogrt', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-3',
        name: 'Brand Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
        sequenceName: 'Brand Spot',
        assetPaths: ['/a.mp4', '/b.mp4']
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Brand spot assembled successfully');
      expect(result.sequence.id).toBe('seq-3');
      expect(result.overlays[0].skipped).toBe(true);
      expect(result.polish).toHaveLength(2);
    });

    it('forwards editingBlueprintPath defaults into build_brand_spot_from_mogrt_and_assets', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-brand-blueprint-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'rapid product hook',
          averageShotDuration: 2.2,
          pacingCurve: 'clean steady rhythm',
          transitionPattern: ['Dip To Black'],
          textOverlayStyle: 'clean lower-third',
          musicBeatStrategy: 'gentle beat emphasis',
          ctaPattern: 'logo and tagline close',
          avoidPatterns: [],
          referenceCount: 3,
          targetPlatform: 'bilibili',
          targetDurationRange: [20, 30],
        }),
        'utf8',
      );

      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-brand-blueprint',
        name: 'Brand Blueprint Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 2.2 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 2.2, outPoint: 4.4 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
        sequenceName: 'Brand Blueprint Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        editingBlueprintPath: blueprintPath,
      });

      expect(result.success).toBe(true);
      expect(result.clipDuration).toBe(2.2);
      expect(result.motionStyle).toBe('none');
      expect(result.transitionName).toBe('Dip To Black');
      expect(result.editingBlueprintPath).toBe(blueprintPath);
      expect(result.editingBlueprint.targetPlatform).toBe('bilibili');
    });

    it('fails build_brand_spot_from_mogrt_and_assets when the requested mogrt overlay fails', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-brand-fail',
        name: 'Brand Spot With Broken MOGRT'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript = jest
        .fn()
        .mockResolvedValueOnce({ success: true, videoTracks: [], audioTracks: [] } as any)
        .mockResolvedValueOnce({ success: false, error: 'MOGRT import failed' } as any)
        .mockResolvedValueOnce({ success: true } as any)
        .mockResolvedValueOnce({ success: true } as any)
        .mockResolvedValueOnce({ success: true, videoTracks: [], audioTracks: [] } as any);

      const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
        sequenceName: 'Brand Spot With Broken MOGRT',
        assetPaths: ['/a.mp4', '/b.mp4'],
        mogrtPath: 'C:/templates/title.mogrt',
        motionStyle: 'none',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.assemblyReview.status).toBe('blocked');
      expect(result.assemblyReview.findings[0].code).toBe('overlay-operations-failed');
    });
  });
});
