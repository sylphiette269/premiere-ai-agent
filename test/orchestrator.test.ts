import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AgentCritic } from '../agent/critic.js';
import { createVideoAgentGateway } from '../agent/gateway.js';
import { AgentMemoryStore } from '../agent/memory.js';
import { Orchestrator } from '../agent/orchestrator.js';
import { AgentReporter } from '../agent/reporter.js';

test('orchestrator runs prompt -> audio -> compose -> premiere -> critic flow', async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'video-agent-workspace-'));
  const memoryStore = new AgentMemoryStore(path.join(workspaceRoot, '.video-agent', 'tasks'));

  const orchestrator = new Orchestrator(
    {
      research: {
        async buildReferenceBlueprint() {
          throw new Error('research should not run in this scenario');
        },
      },
      audio: {
        async analyzeAndPlan() {
          return {
            analysis: {
              sourceAudioPath: 'song.mp3',
              duration: 15,
              tempo: 128,
              bpm: 128,
              beatTimes: [0, 0.5, 1],
              beatCount: 3,
              onsetTimes: [0, 1],
              onsetCount: 2,
              energyPeaks: [],
              method: 'default',
              sensitivity: 'medium',
              minGapSec: 0.12,
            },
            plan: {
              style: 'beat_markers_and_scale',
              bpm: 128,
              beatCount: 3,
              onsetCount: 2,
              cutPoints: [0, 1],
              markerPlan: [],
              animationPlan: [],
              notes: [],
            },
          };
        },
      },
      premiere: {
        async assembleClosedLoop() {
          return {
            success: true,
            sequenceId: 'seq-001',
          };
        },
        async criticEditResult() {
          return {
            critic: {
              passed: true,
              findings: [],
              actionableFixes: [],
            },
          };
        },
        async dispose() {
          return;
        },
      },
    },
    memoryStore,
    new AgentCritic(),
    new AgentReporter(),
  );

  const gateway = createVideoAgentGateway({
    workspaceRoot,
    memoryStore,
    orchestrator,
  });

  const report = await gateway.run({
    goal: '做一个 15 秒抖音产品视频',
    bgmPath: 'song.mp3',
  });

  assert.equal(report.status, 'done');
  assert.equal(report.steps.some((step) => step.id === 'audio-plan' && step.status === 'done'), true);
  assert.equal(report.artifacts.sequenceId, 'seq-001');

  const memory = JSON.parse(await readFile(report.artifacts.memoryPath, 'utf8')) as {
    checkpoints: Array<{ stepId: string }>;
  };
  assert.equal(memory.checkpoints.length > 0, true);
});

test('planner chooses research step when reference inputs exist', async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'video-agent-workspace-'));
  const memoryStore = new AgentMemoryStore(path.join(workspaceRoot, '.video-agent', 'tasks'));
  const blueprintPath = path.join(workspaceRoot, 'editing-blueprint.json');
  await writeFile(
    blueprintPath,
    `${JSON.stringify({
      hookStyle: 'visual_hook',
      averageShotDuration: 1.4,
      pacingCurve: 'fast_open -> demo -> cta',
      transitionPattern: ['hard_cut'],
      textOverlayStyle: 'caption_heavy',
      musicBeatStrategy: 'beat_markers_and_scale',
      ctaPattern: 'end_screen',
      avoidPatterns: [],
      referenceCount: 1,
      targetPlatform: 'douyin',
      targetDurationRange: [12, 18],
    }, null, 2)}\n`,
    'utf8',
  );

  const gateway = createVideoAgentGateway({
    workspaceRoot,
    memoryStore,
    orchestrator: new Orchestrator(
      {
        research: {
          async buildReferenceBlueprint() {
            return {
              blueprint: JSON.parse(await readFile(blueprintPath, 'utf8')) as Record<string, unknown>,
              blueprintPath,
              taskId: 'task-1',
              taskPath: path.join(workspaceRoot, 'research-cache', 'task-1'),
            };
          },
        },
        audio: {
          async analyzeAndPlan() {
            throw new Error('audio should not run');
          },
        },
        premiere: {
          async assembleClosedLoop() {
            return { success: true, sequenceId: 'seq-002' };
          },
          async criticEditResult() {
            return { critic: { passed: true, findings: [], actionableFixes: [] } };
          },
          async dispose() {
            return;
          },
        },
      },
      memoryStore,
      new AgentCritic(),
      new AgentReporter(),
    ),
  });

  const report = await gateway.run({
    goal: '按参考视频做一个产品短片',
    referenceCandidates: [
      {
        id: 'ref-1',
        platform: 'douyin',
        title: 'Reference',
        url: 'https://example.com/ref-1',
      },
    ],
    referenceAssets: [
      {
        candidateId: 'ref-1',
        localPath: 'E:/tmp/ref-1.mp4',
      },
    ],
  });

  assert.equal(report.status, 'done');
  assert.equal(report.steps.some((step) => step.id === 'reference-research'), true);
});
