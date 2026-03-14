import { createVideoAgentGateway } from '../agent/gateway.js';

async function main(): Promise<void> {
  const goal = process.argv.slice(2).join(' ').trim()
    || '做一个 beat-driven 的音乐卡点短视频，切点跟鼓点走。';

  const gateway = createVideoAgentGateway();
  const report = await gateway.run({
    goal,
    scenarioHint: 'music_video_edit',
    targetDurationSec: 20,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
