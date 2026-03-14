import { createVideoAgentGateway } from '../agent/gateway.js';
import type { AgentExecutionInput, AgentScenarioId } from '../agent/types.js';

function printHelp(): void {
  console.log(`Usage:
  npm run agent:dev -- "<goal>" [options]
  npm run agent -- "<goal>" [options]

Options:
  --sequence-name <name>       Premiere sequence name
  --asset <path>               Repeatable media asset path
  --docx <path>                DOCX guide path
  --manifest <path>            Media manifest path
  --subtitle <path>            Subtitle source path
  --subtitle-language <lang>   Subtitle language
  --bgm <path>                 Background music path
  --editing-blueprint <path>   Existing editing blueprint path
  --research-task-dir <path>   Existing research task directory
  --research-query <text>      Search query for reference research
  --target-platform <name>     douyin / bilibili / custom
  --duration <seconds>         Target duration
  --scenario <name>            product_video_15s | music_video_edit | research_to_edit | custom
  --help                       Show this help
`);
}

function parseArgs(argv: string[]): AgentExecutionInput | null {
  const input: AgentExecutionInput = {
    goal: '',
    assetPaths: [],
  };

  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === '--help' || token === '-h') {
      return null;
    }

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const nextValue = argv[index + 1];
    if (typeof nextValue !== 'string') {
      throw new Error(`Missing value for ${token}`);
    }

    switch (token) {
      case '--sequence-name':
        input.sequenceName = nextValue;
        break;
      case '--asset':
        input.assetPaths!.push(nextValue);
        break;
      case '--docx':
        input.docxPath = nextValue;
        break;
      case '--manifest':
        input.mediaManifestPath = nextValue;
        break;
      case '--subtitle':
        input.subtitleSourcePath = nextValue;
        break;
      case '--subtitle-language':
        input.subtitleLanguage = nextValue;
        break;
      case '--bgm':
        input.bgmPath = nextValue;
        break;
      case '--editing-blueprint':
        input.editingBlueprintPath = nextValue;
        break;
      case '--research-task-dir':
        input.researchTaskDir = nextValue;
        break;
      case '--research-query':
        input.researchQuery = nextValue;
        break;
      case '--target-platform':
        input.targetPlatform = nextValue;
        break;
      case '--duration':
        input.targetDurationSec = Number(nextValue);
        break;
      case '--scenario':
        input.scenarioHint = nextValue as AgentScenarioId;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }

    index += 1;
  }

  input.goal = positional.join(' ').trim();
  if (!input.goal) {
    throw new Error('Goal is required.');
  }
  if (input.assetPaths?.length === 0) {
    delete input.assetPaths;
  }
  return input;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    printHelp();
    return;
  }

  const gateway = createVideoAgentGateway();
  const report = await gateway.run(parsed);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'done') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
