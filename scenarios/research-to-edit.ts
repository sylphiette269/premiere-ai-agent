import { createVideoAgentGateway } from '../agent/gateway.js';

async function main(): Promise<void> {
  const goal = process.argv.slice(2).join(' ').trim()
    || '基于已有 research task 或蓝图继续装配一个参考风格视频。';

  const gateway = createVideoAgentGateway();
  const report = await gateway.run({
    goal,
    scenarioHint: 'research_to_edit',
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
