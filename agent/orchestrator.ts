import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EditingBlueprint } from '../packages/premiere-mcp/src/tools/catalog/agent-orchestration.types.js';
import { AgentMemoryStore } from './memory.js';
import {
  buildExecutionPlan,
  derivePromptBlueprint,
  mergeBlueprintWithAudio,
} from './planner.js';
import type {
  AgentArtifacts,
  AgentCriticReview,
  AgentExecutionInput,
  AgentMemory,
  AgentReport,
  AgentStep,
  AgentTask,
} from './types.js';
import type {
  AudioBeatClient,
  PremiereClient,
  VideoResearchClient,
} from './clients.js';
import { AgentCritic } from './critic.js';
import { AgentReporter } from './reporter.js';

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

async function readBlueprint(filePath: string): Promise<EditingBlueprint> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as EditingBlueprint;
}

function mapPhaseToStatus(step: AgentStep): AgentTask['status'] {
  switch (step.phase) {
    case 'research':
      return 'researching';
    case 'audio':
      return 'beating';
    case 'editing':
      return 'editing';
    case 'review':
      return 'critiquing';
    default:
      return 'planning';
  }
}

export class Orchestrator {
  constructor(
    private readonly clients: {
      research: VideoResearchClient;
      audio: AudioBeatClient;
      premiere: PremiereClient;
    },
    private readonly memoryStore: AgentMemoryStore,
    private readonly critic: AgentCritic,
    private readonly reporter: AgentReporter,
  ) {}

  async execute(input: AgentExecutionInput): Promise<AgentReport> {
    const planned = buildExecutionPlan(input);
    const memory = await this.memoryStore.createTask(input.goal, planned.scenario);
    const task: AgentTask = {
      id: memory.taskId,
      userGoal: input.goal,
      scenario: planned.scenario,
      premiereScenario: planned.premiereScenario,
      status: 'planning',
      plan: planned.plan,
      successCriteria: planned.successCriteria,
      warnings: planned.warnings,
      taskDir: this.memoryStore.taskDir(memory.taskId),
    };
    const artifacts: AgentArtifacts = {};

    try {
      for (const step of task.plan) {
        task.status = mapPhaseToStatus(step);
        await this.memoryStore.checkpoint(memory, step.id, this.snapshot(task, artifacts));
        step.status = 'running';
        try {
          const output = await this.runStep(task, step, input, artifacts, memory);
          step.output = output;
          step.status = 'done';
          await this.memoryStore.logToolCall(memory, step.id, `${step.mcp}:${step.action}`, step.input, output);
          await this.memoryStore.checkpoint(memory, step.id, this.snapshot(task, artifacts));
        } catch (error) {
          const normalized = normalizeError(error);
          const recovered = await this.tryRecover(step, memory, normalized);
          await this.memoryStore.logToolCall(
            memory,
            step.id,
            `${step.mcp}:${step.action}`,
            step.input,
            undefined,
            normalized.message,
          );
          if (!recovered) {
            task.status = 'failed';
            const critic = this.critic.review({
              critic: {
                passed: false,
                findings: [normalized.message],
                actionableFixes: ['修正失败步骤后重新执行 agent 链路'],
              },
            });
            return await this.reporter.write(
              task,
              artifacts,
              critic,
              this.memoryStore.memoryPath(memory.taskId),
            );
          }
        }
      }

      const criticReview = this.finalCritic(artifacts);
      task.status = criticReview.needsRevision ? 'failed' : 'done';
      return await this.reporter.write(
        task,
        artifacts,
        criticReview,
        this.memoryStore.memoryPath(memory.taskId),
      );
    } finally {
      await this.clients.premiere.dispose();
    }
  }

  private async runStep(
    task: AgentTask,
    step: AgentStep,
    input: AgentExecutionInput,
    artifacts: AgentArtifacts,
    memory: AgentMemory,
  ): Promise<Record<string, unknown>> {
    switch (step.action) {
      case 'use_existing_blueprint': {
        const editingBlueprintPath = path.resolve(String(step.input.editingBlueprintPath));
        artifacts.editingBlueprintPath = editingBlueprintPath;
        artifacts.blueprint = await readBlueprint(editingBlueprintPath);
        await this.memoryStore.logDecision(memory, step.id, '复用现成 editing blueprint。', ['重新研究风格', '从 prompt 推导蓝图']);
        return {
          editingBlueprintPath,
        };
      }
      case 'use_existing_research_task': {
        artifacts.researchTaskDir = path.resolve(String(step.input.researchTaskDir));
        await this.memoryStore.logDecision(memory, step.id, '复用现成 research task，跳过重新采样。', ['重新搜索参考视频']);
        return {
          researchTaskDir: artifacts.researchTaskDir,
        };
      }
      case 'build_reference_blueprint': {
        const result = await this.clients.research.buildReferenceBlueprint({
          goal: input.goal,
          researchQuery: input.researchQuery,
          referenceCandidates: (input.referenceCandidates ?? []),
          referenceAssets: (input.referenceAssets ?? []),
          targetDurationSec: input.targetDurationSec,
          targetPlatform: input.targetPlatform,
          taskDir: task.taskDir,
        });
        artifacts.researchTaskDir = result.taskPath;
        artifacts.editingBlueprintPath = result.blueprintPath;
        artifacts.blueprint = result.blueprint;
        await this.memoryStore.logDecision(memory, step.id, '使用 video-research 产出真实蓝图。', ['prompt 推导蓝图']);
        return {
          blueprintPath: result.blueprintPath,
          researchTaskDir: result.taskPath,
          referenceTaskId: result.taskId,
        };
      }
      case 'derive_prompt_blueprint': {
        const blueprint = derivePromptBlueprint(input);
        const blueprintPath = path.join(task.taskDir, 'prompt-blueprint.json');
        await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`, 'utf8');
        artifacts.blueprint = blueprint;
        artifacts.editingBlueprintPath = blueprintPath;
        await this.memoryStore.logDecision(
          memory,
          step.id,
          '缺少可执行研究输入，回退为 prompt-derived blueprint。',
          ['要求用户补参考视频素材', '直接跳进 Premiere 手工试错'],
        );
        return {
          blueprintPath,
        };
      }
      case 'analyze_music_plan': {
        const result = await this.clients.audio.analyzeAndPlan({
          bgmPath: String(input.bgmPath),
        });
        artifacts.audioAnalysis = result.analysis;
        artifacts.audioPlan = result.plan;
        await this.memoryStore.logDecision(memory, step.id, '启用 audio-beat 分析，为后续闭环装配补节拍信号。', ['跳过节拍规划']);
        return {
          bpm: result.analysis.bpm,
          beatCount: result.analysis.beatCount,
          cutPointCount: result.plan.cutPoints.length,
          style: result.plan.style,
        };
      }
      case 'compose_editing_blueprint': {
        let blueprint = artifacts.blueprint;
        if (!blueprint && artifacts.editingBlueprintPath) {
          blueprint = await readBlueprint(artifacts.editingBlueprintPath);
        }
        if (!blueprint) {
          throw new Error('No blueprint source available for compose_editing_blueprint.');
        }
        const merged = mergeBlueprintWithAudio(blueprint, artifacts.audioPlan);
        const editingBlueprintPath = path.join(task.taskDir, 'editing-blueprint.json');
        await writeFile(editingBlueprintPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
        artifacts.blueprint = merged;
        artifacts.editingBlueprintPath = editingBlueprintPath;
        return {
          editingBlueprintPath,
          musicBeatStrategy: merged.musicBeatStrategy,
        };
      }
      case 'assemble_product_spot_closed_loop': {
        const assembleArgs: Record<string, unknown> = {
          goal: input.goal,
          sequenceName: step.input.sequenceName,
          assetPaths: input.assetPaths,
          docxPath: input.docxPath,
          mediaManifestPath: input.mediaManifestPath,
          autoPlanFromManifest: !input.assetPaths?.length && Boolean(input.docxPath && input.mediaManifestPath),
          applyGuideEffects: true,
          reviewBeforeAssemble: true,
          allowReviewWarnings: false,
          subtitleSourcePath: input.subtitleSourcePath,
          subtitleLanguage: input.subtitleLanguage,
          bgmPath: input.bgmPath,
        };
        if (artifacts.editingBlueprintPath) {
          assembleArgs.editingBlueprintPath = artifacts.editingBlueprintPath;
        }
        if (artifacts.researchTaskDir && !artifacts.editingBlueprintPath) {
          assembleArgs.researchTaskDir = artifacts.researchTaskDir;
        }

        const result = await this.clients.premiere.assembleClosedLoop(assembleArgs);
        const record = asRecord(result);
        const success = record.success !== false && record.ok !== false;
        if (!success) {
          const errorMessage = typeof record.error === 'string'
            ? record.error
            : 'Premiere closed-loop assembly failed.';
          throw new Error(errorMessage);
        }
        artifacts.assemblyResult = record;
        const sequenceId = typeof record.sequenceId === 'string'
          ? record.sequenceId
          : typeof asRecord(record.assemblyResult).sequenceId === 'string'
            ? String(asRecord(record.assemblyResult).sequenceId)
            : undefined;
        artifacts.sequenceId = sequenceId;
        return record;
      }
      case 'critic_edit_result': {
        const result = await this.clients.premiere.criticEditResult({
          goal: input.goal,
          scenario: task.premiereScenario,
          sequenceId: artifacts.sequenceId,
          editingBlueprintPath: artifacts.editingBlueprintPath,
          successCriteria: task.successCriteria,
          timelineData:
            asRecord(artifacts.assemblyResult).timelineData
            ?? asRecord(artifacts.assemblyResult).augmentedTimelineData
            ?? asRecord(asRecord(artifacts.assemblyResult).assemblyReview).timelineData,
        });
        artifacts.criticResult = result;
        const critic = asRecord(asRecord(result).critic);
        if (critic.passed === false) {
          throw new Error(
            Array.isArray(critic.findings) && critic.findings.length > 0
              ? String(critic.findings[0])
              : 'critic_edit_result failed.',
          );
        }
        return asRecord(result);
      }
      default:
        throw new Error(`Unsupported step action: ${step.action}`);
    }
  }

  private snapshot(task: AgentTask, artifacts: AgentArtifacts): Record<string, unknown> {
    return {
      status: task.status,
      completedSteps: task.plan.filter((step) => step.status === 'done').map((step) => step.id),
      editingBlueprintPath: artifacts.editingBlueprintPath,
      researchTaskDir: artifacts.researchTaskDir,
      sequenceId: artifacts.sequenceId,
    };
  }

  private async tryRecover(
    step: AgentStep,
    memory: AgentMemory,
    error: Error,
  ): Promise<boolean> {
    step.retryCount += 1;
    step.status = 'failed';
    if (step.retryCount > step.maxRetries) {
      return false;
    }
    const restored = await this.memoryStore.restoreLatest(memory);
    await this.memoryStore.logDecision(
      memory,
      step.id,
      `步骤失败后准备重试: ${error.message}`,
      restored ? [`恢复到 ${restored.stepId}`] : ['无可用 checkpoint'],
    );
    step.status = 'pending';
    return true;
  }

  private finalCritic(artifacts: AgentArtifacts): AgentCriticReview {
    if (!artifacts.criticResult) {
      return this.critic.review({
        critic: {
          passed: false,
          findings: ['未生成 critic 结果。'],
          actionableFixes: ['检查 assemble 步骤是否真正完成'],
        },
      });
    }
    return this.critic.review(artifacts.criticResult);
  }
}
