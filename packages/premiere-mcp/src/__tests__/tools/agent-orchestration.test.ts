import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  checkResearchGate,
  executeAgentTask,
  generatePlan,
  identifyScenario,
} from '../../tools/catalog/agent-orchestration.js';
import type {
  EditingBlueprint,
  TaskScenario,
} from '../../tools/catalog/agent-orchestration.types.js';

describe('agent orchestration', () => {
  describe('identifyScenario', () => {
    it('detects viral_style from Chinese keywords', () => {
      expect(identifyScenario({ goal: '帮我做一个抖音爆款视频' })).toBe('viral_style');
    });

    it('detects viral_style from English keywords', () => {
      expect(identifyScenario({ goal: 'Make a TikTok style video' })).toBe('viral_style');
    });

    it('prefers docx_guided when docxPath exists', () => {
      expect(
        identifyScenario({
          goal: '按脚本剪辑',
          docxPath: '/path/to/script.docx',
        }),
      ).toBe('docx_guided');
    });

    it('prefers reference_video over keyword matches', () => {
      expect(
        identifyScenario({
          goal: '做一个爆款视频',
          referenceBlueprintPath: '/path/to/ref.json',
        }),
      ).toBe('reference_video');
    });

    it('treats editingBlueprintPath as viral_style even without keywords', () => {
      expect(
        identifyScenario({
          goal: '做一个产品视频',
          editingBlueprintPath: '/path/to/editing-blueprint.json',
        }),
      ).toBe('viral_style');
    });

    it('falls back to natural_language', () => {
      expect(identifyScenario({ goal: '剪一个30秒产品宣传片' })).toBe('natural_language');
    });
  });

  describe('generatePlan', () => {
    it('builds a viral_style plan with research steps before assemble', () => {
      const result = generatePlan('viral_style', { goal: '做爆款视频' });
      const steps = result.plan.steps;
      const assembleIndex = steps.findIndex((step) => step.tool === 'assemble_product_spot');
      const blueprintIndex = steps.findIndex(
        (step) => step.tool === 'extract_editing_blueprint',
      );

      expect(result.ok).toBe(true);
      expect(result.plan.researchRequired).toBe(true);
      expect(result.plan.prerequisites.length).toBeGreaterThanOrEqual(3);
      expect(blueprintIndex).toBeLessThan(assembleIndex);
      expect(result.plan.steps.some((step) => step.tool === 'critic_edit_result')).toBe(true);
      expect(result.plan.discouragedTools).toContain('build_timeline_from_xml');
    });

    it('builds a direct viral_style execution plan from an external editing blueprint', () => {
      const blueprint: EditingBlueprint = {
        hookStyle: 'question',
        averageShotDuration: 1.2,
        pacingCurve: 'fast-slow-fast',
        transitionPattern: ['hard_cut', 'zoom_cut'],
        textOverlayStyle: 'centered-bold',
        musicBeatStrategy: 'cut-on-beat',
        ctaPattern: 'end-screen',
        avoidPatterns: ['cross_dissolve_only'],
        referenceCount: 5,
      };

      const result = generatePlan('viral_style', {
        goal: '做一个抖音风产品视频',
        editingBlueprintPath: '/path/to/editing-blueprint.json',
        editingBlueprint: blueprint,
      });

      expect(result.ok).toBe(true);
      expect(result.plan.researchRequired).toBe(false);
      expect(result.plan.blueprint).toEqual(blueprint);
      expect(result.plan.suggestedTools[0]).toBe('assemble_product_spot_closed_loop');
      expect(result.plan.steps.map((step) => step.tool)).toEqual([
        'load_editing_blueprint',
        'review_blueprint_reasonability',
        'assemble_product_spot',
        'compare_result_to_blueprint',
        'critic_edit_result',
      ]);
      expect(result.plan.steps[2].argsHint).toMatchObject({
        reviewBeforeAssemble: true,
        editingBlueprintPath: '/path/to/editing-blueprint.json',
      });
    });

    it('does not require research for natural_language', () => {
      const result = generatePlan('natural_language', { goal: '剪个片子' });
      expect(result.plan.researchRequired).toBe(false);
    });

    it('returns success criteria for every scenario', () => {
      const scenarios: TaskScenario[] = [
        'natural_language',
        'docx_guided',
        'reference_video',
        'viral_style',
      ];

      for (const scenario of scenarios) {
        const input =
          scenario === 'docx_guided'
            ? {
                goal: 'test',
                docxPath: '/guide.docx',
                mediaManifestPath: '/manifest.json',
              }
            : { goal: 'test', referenceBlueprintPath: scenario === 'reference_video' ? '/ref.json' : undefined };
        const result = generatePlan(scenario, input);
        expect(result.plan.successCriteria.length).toBeGreaterThan(0);
      }
    });
  });

  describe('executeAgentTask', () => {
    it('returns a structured plan', () => {
      const result = executeAgentTask({ goal: '做一个产品宣传片' });
      expect(result.ok).toBe(true);
      expect(result.plan.steps.length).toBeGreaterThan(0);
      expect(result.plan.suggestedTools).toContain('parse_edit_request');
    });
    it('loads an external editing blueprint file for orchestration', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'premiere-agent-blueprint-'));
      const blueprintPath = path.join(root, 'blueprint.json');
      await writeFile(
        blueprintPath,
        JSON.stringify({
          hookStyle: 'question',
          averageShotDuration: 1.1,
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

      const result = executeAgentTask({
        goal: '做一个平台风格视频',
        editingBlueprintPath: blueprintPath,
      });

      expect(result.ok).toBe(true);
      expect(result.plan.researchRequired).toBe(false);
      expect(result.plan.blueprint?.targetPlatform).toBe('douyin');
      expect(result.plan.suggestedTools).toContain('load_editing_blueprint');
    });
  });

  describe('checkResearchGate', () => {
    it('fails viral_style without blueprint', () => {
      expect(
        checkResearchGate({
          scenario: 'viral_style',
          completedSteps: [],
        }).passed,
      ).toBe(false);
    });

    it('passes viral_style after blueprint and required steps exist', () => {
      const blueprint: EditingBlueprint = {
        hookStyle: 'question',
        averageShotDuration: 1.2,
        pacingCurve: 'fast-slow-fast',
        transitionPattern: ['hard_cut', 'zoom_cut'],
        textOverlayStyle: 'centered-bold',
        musicBeatStrategy: 'cut-on-beat',
        ctaPattern: 'end-screen',
        avoidPatterns: ['cross_dissolve_only'],
        referenceCount: 5,
      };

      expect(
        checkResearchGate({
          scenario: 'viral_style',
          completedSteps: [
            'collect_reference_videos',
            'analyze_reference_patterns',
            'extract_editing_blueprint',
          ],
          blueprint,
        }).passed,
      ).toBe(true);
    });

    it('passes viral_style when an external editing blueprint has been loaded', () => {
      const blueprint: EditingBlueprint = {
        hookStyle: 'question',
        averageShotDuration: 1.2,
        pacingCurve: 'fast-slow-fast',
        transitionPattern: ['hard_cut', 'zoom_cut'],
        textOverlayStyle: 'centered-bold',
        musicBeatStrategy: 'cut-on-beat',
        ctaPattern: 'end-screen',
        avoidPatterns: ['cross_dissolve_only'],
        referenceCount: 5,
      };

      expect(
        checkResearchGate({
          scenario: 'viral_style',
          completedSteps: ['load_editing_blueprint'],
          blueprint,
        }).passed,
      ).toBe(true);
    });

    it('passes natural_language immediately', () => {
      expect(
        checkResearchGate({
          scenario: 'natural_language',
          completedSteps: [],
        }).passed,
      ).toBe(true);
    });
  });
});
