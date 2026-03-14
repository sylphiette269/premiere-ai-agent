import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentArtifacts,
  AgentCriticReview,
  AgentReport,
  AgentTask,
} from './types.js';

export class AgentReporter {
  async write(
    task: AgentTask,
    artifacts: AgentArtifacts,
    critic: AgentCriticReview,
    memoryPath: string,
  ): Promise<AgentReport> {
    const reportPath = path.join(task.taskDir, 'report.json');
    const report: AgentReport = {
      taskId: task.id,
      goal: task.userGoal,
      scenario: task.scenario,
      status: critic.needsRevision || task.status === 'failed' ? 'failed' : 'done',
      summary: critic.needsRevision
        ? 'Agent 已跑完整条链路，但 critic 要求修订。'
        : 'Agent 已完成规划、执行、审查和报告输出。',
      warnings: task.warnings,
      steps: task.plan,
      artifacts: {
        taskDir: task.taskDir,
        memoryPath,
        reportPath,
        editingBlueprintPath: artifacts.editingBlueprintPath,
        researchTaskDir: artifacts.researchTaskDir,
        sequenceId: artifacts.sequenceId,
      },
      critic,
    };

    await mkdir(task.taskDir, { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  }
}
