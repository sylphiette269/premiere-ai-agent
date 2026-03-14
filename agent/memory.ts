import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentMemory,
  AgentScenarioId,
  Checkpoint,
  DecisionRecord,
  ToolCallRecord,
} from './types.js';

function slugifyGoal(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'video-agent-task';
}

function nowId(goal: string): string {
  return `${slugifyGoal(goal)}-${Date.now().toString(36)}`;
}

export class AgentMemoryStore {
  constructor(private readonly baseDir: string = path.resolve(process.cwd(), '.video-agent', 'tasks')) {}

  taskDir(taskId: string): string {
    return path.join(this.baseDir, taskId);
  }

  memoryPath(taskId: string): string {
    return path.join(this.taskDir(taskId), 'memory.json');
  }

  async createTask(goal: string, scenario: AgentScenarioId): Promise<AgentMemory> {
    const taskId = nowId(goal);
    const memory: AgentMemory = {
      taskId,
      goal,
      scenario,
      checkpoints: [],
      decisions: [],
      toolCallHistory: [],
      userPreferences: {},
    };
    await mkdir(this.taskDir(taskId), { recursive: true });
    await this.save(memory);
    return memory;
  }

  async load(taskId: string): Promise<AgentMemory> {
    const raw = await readFile(this.memoryPath(taskId), 'utf8');
    return JSON.parse(raw) as AgentMemory;
  }

  async save(memory: AgentMemory): Promise<void> {
    await mkdir(this.taskDir(memory.taskId), { recursive: true });
    await writeFile(this.memoryPath(memory.taskId), `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
  }

  async checkpoint(
    memory: AgentMemory,
    stepId: string,
    snapshot: Record<string, unknown>,
    state: Checkpoint['state'] = 'saved',
  ): Promise<void> {
    memory.checkpoints.push({
      stepId,
      timestamp: Date.now(),
      state,
      snapshot,
    });
    await this.save(memory);
  }

  async restoreLatest(memory: AgentMemory): Promise<Checkpoint | null> {
    const latest = [...memory.checkpoints].reverse().find((checkpoint) => checkpoint.state === 'saved') ?? null;
    if (!latest) {
      return null;
    }
    await this.checkpoint(memory, latest.stepId, latest.snapshot, 'restored');
    return latest;
  }

  async logDecision(
    memory: AgentMemory,
    stepId: string,
    reason: string,
    alternatives: string[] = [],
  ): Promise<void> {
    const decision: DecisionRecord = {
      stepId,
      timestamp: Date.now(),
      reason,
      alternatives,
    };
    memory.decisions.push(decision);
    await this.save(memory);
  }

  async logToolCall(
    memory: AgentMemory,
    stepId: string,
    tool: string,
    input: Record<string, unknown>,
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<void> {
    const toolCall: ToolCallRecord = {
      stepId,
      timestamp: Date.now(),
      tool,
      input,
      output,
      error,
    };
    memory.toolCallHistory.push(toolCall);
    await this.save(memory);
  }
}
