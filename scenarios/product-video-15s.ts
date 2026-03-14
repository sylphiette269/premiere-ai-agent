import { createVideoAgentGateway } from '../agent/gateway.js';

async function main(): Promise<void> {
  const goal = process.argv.slice(2).join(' ').trim()
    || '做一个 15 秒抖音风格产品视频，前 3 秒要有 hook，结尾给 CTA。';

  const gateway = createVideoAgentGateway();
  const report = await gateway.run({
    goal,
    scenarioHint: 'product_video_15s',
    targetDurationSec: 15,
    targetPlatform: 'douyin',
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
