import { basename } from 'node:path';

import { Logger } from '../utils/logger.js';

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export interface GeneratedPrompt {
  description: string;
  messages: PromptMessage[];
}

type PromptArgs = Record<string, unknown>;

interface PromptDefinition extends MCPPrompt {
  build: (args: PromptArgs) => GeneratedPrompt;
}

const PROMPT_ARGUMENTS = {
  createVideoProject: [
    { name: 'project_type', description: 'Type of video project (e.g., "social media", "documentary", "commercial")', required: true },
    { name: 'duration', description: 'Expected duration of the final video', required: false },
  ],
  editMusicVideo: [
    { name: 'music_file', description: 'Path to the music file', required: true },
    { name: 'video_clips', description: 'List of video clip paths', required: true },
  ],
  colorGrade: [
    { name: 'footage_type', description: 'Type of footage (e.g., "log", "standard", "raw")', required: true },
    { name: 'target_mood', description: 'Desired mood or look (e.g., "cinematic", "vibrant", "moody")', required: false },
  ],
  multicam: [
    { name: 'camera_count', description: 'Number of camera angles', required: true },
    { name: 'sync_method', description: 'Method for syncing cameras (timecode, audio, markers)', required: true },
  ],
  podcast: [
    { name: 'participant_count', description: 'Number of participants in the podcast', required: true },
    { name: 'episode_length', description: 'Target length of the episode', required: false },
  ],
  socialMedia: [
    { name: 'platform', description: 'Target platform (Instagram, TikTok, YouTube, etc.)', required: true },
    { name: 'content_type', description: 'Type of content (story, post, reel, etc.)', required: true },
  ],
  documentary: [
    { name: 'interview_count', description: 'Number of interview subjects', required: true },
    { name: 'narrative_structure', description: 'Narrative structure (chronological, thematic, etc.)', required: false },
  ],
  commercial: [
    { name: 'commercial_length', description: 'Length of the commercial (15s, 30s, 60s, etc.)', required: true },
    { name: 'product_type', description: 'Type of product being advertised', required: false },
  ],
  optimize: [
    { name: 'project_size', description: 'Size of the project (small, medium, large)', required: true },
    { name: 'hardware_specs', description: 'Hardware specifications', required: false },
  ],
  audioCleanup: [
    { name: 'audio_issues', description: 'Specific audio issues to address', required: true },
    { name: 'audio_source', description: 'Source of the audio (microphone, phone, etc.)', required: false },
  ],
  operatePremiereMcp: [
    { name: 'objective', description: 'Editing objective the agent is trying to complete', required: true },
    { name: 'sequence_name', description: 'Optional target sequence name or identifier', required: false },
    { name: 'delivery_target', description: 'Optional delivery target such as horizontal ad, vertical reel, or timeline prep', required: false },
  ],
} satisfies Record<string, MCPPrompt['arguments']>;

function text(role: PromptMessage['role'], value: string): PromptMessage {
  return {
    role,
    content: {
      type: 'text',
      text: value.trim(),
    },
  };
}

function pickText(args: PromptArgs, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry && typeof entry === 'object') {
          const pathValue = (entry as { path?: unknown }).path;
          if (typeof pathValue === 'string') {
            return pathValue.trim();
          }
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function summarizePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/');
  const fileName = basename(normalized);
  return fileName || normalized;
}

function summarizePathList(value: unknown, fallback: string): { count: number; labels: string[]; sentence: string } {
  const items = toList(value);
  if (items.length === 0) {
    return { count: 0, labels: [], sentence: fallback };
  }

  const labels = items.map(summarizePath);
  const preview = labels.slice(0, 3).join(', ');
  const overflow = labels.length > 3 ? `, +${labels.length - 3} more` : '';

  return {
    count: labels.length,
    labels,
    sentence: `${labels.length} selected clips (${preview}${overflow})`,
  };
}

function buildAssistantMessage(intro: string, sections: Array<{ heading: string; items: string[] }>, close: string): string {
  const lines: string[] = [intro, ''];

  for (const section of sections) {
    lines.push(`**${section.heading}**`);
    section.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
    lines.push('');
  }

  lines.push(close);
  return lines.join('\n').trim();
}

function moodRecipe(targetMood: string): string[] {
  const recipes: Record<string, string[]> = {
    cinematic: [
      'Use balanced contrast with controlled highlight roll-off.',
      'Push warm skin tones against cooler shadows only where the shot supports it.',
      'Keep saturation restrained so the grade looks intentional rather than loud.',
    ],
    vibrant: [
      'Increase color separation before adding saturation.',
      'Protect skin tones while letting wardrobe and props carry the extra energy.',
      'Use clean whites and stronger mid-tone contrast to keep the image crisp.',
    ],
    moody: [
      'Lower the floor of the shadows without crushing detail you may need later.',
      'Let practical lights or specular highlights become the emotional anchors.',
      'Use selective desaturation so the frame feels deliberate, not muddy.',
    ],
    natural: [
      'Correct exposure and white balance before trying any look decisions.',
      'Keep skin, sky, and neutral surfaces believable.',
      'Prefer subtle contrast moves over dramatic stylization.',
    ],
  };

  return recipes[targetMood] ?? recipes.natural!;
}

function socialSpecs(platform: string, contentType: string): string[] {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedType = contentType.toLowerCase();

  if (normalizedPlatform === 'instagram' && normalizedType === 'reel') {
    return [
      'Deliver in 9:16 with a strong opening frame in the first second.',
      'Design captions for vertical viewing and partial mute playback.',
      'Keep pacing aggressive enough that each beat earns the next swipe-stopping moment.',
    ];
  }

  if (normalizedPlatform === 'tiktok') {
    return [
      'Optimize for 9:16 and assume most viewers will encounter the video mid-scroll.',
      'Front-load the concept, not the logo.',
      'Use on-screen text as a pacing device, not as a transcript dump.',
    ];
  }

  if (normalizedPlatform === 'youtube' && normalizedType === 'short') {
    return [
      'Keep the story self-contained inside the vertical frame.',
      'Use title-safe text even when the frame is visually busy.',
      'Design the ending to loop cleanly when possible.',
    ];
  }

  return [
    'Match aspect ratio, duration, and safe-text placement to the target platform.',
    'Assume the viewer will decide within the first two seconds whether to keep watching.',
    'Make captions and graphical emphasis readable on a phone without zooming.',
  ];
}

function audioFixes(issue: string): string[] {
  const normalized = issue.toLowerCase();

  if (normalized.includes('echo')) {
    return [
      'Start with de-reverb before aggressive EQ so you do not brighten the room problem.',
      'Repair the worst phrases manually if the algorithm leaves swirls or metallic tails.',
      'Compare every pass to the untreated line so intelligibility improves instead of just sounding different.',
    ];
  }

  if (normalized.includes('distortion')) {
    return [
      'Check whether clipping is occasional or baked into the whole take before spending time on repair.',
      'Use declip or harmonic repair conservatively and re-balance tone afterwards.',
      'If the lead vocal remains unusable, mark that section for replacement or alternate sourcing early.',
    ];
  }

  return [
    'Capture a clean noise print or room tone segment before broad reduction.',
    'Use a light gate or expander only after obvious broadband noise is reduced.',
    'Finish with level matching and intelligibility checks on small speakers or headphones.',
  ];
}

function buildAgentWorkflow(objective: string, sequenceName: string, deliveryTarget: string): string {
  return buildAssistantMessage(
    `Objective: ${objective}. Sequence target: ${sequenceName}. Delivery target: ${deliveryTarget}.`,
    [
      {
        heading: 'Startup order',
        items: [
          'Read the resource `premiere://mcp/agent-guide` before issuing write operations.',
          'Inspect the current state with `list_sequences`, `list_project_items`, and `list_sequence_tracks` before assuming where clips or sequences live.',
          'Prefer exact low-level tools when the request already specifies clip IDs, times, transition names, or keyframe values.',
        ],
      },
      {
        heading: 'Sequence and timeline operations',
        items: [
          'Use `create_sequence` only after checking whether the target sequence already exists.',
          'After inserting clips, read back the track layout before bulk trimming, moving, or transition work.',
          'Treat bridge or activation failures as hard stops; do not continue writing more timeline edits on top of an uncertain state.',
        ],
      },
      {
        heading: 'Transitions and keyframes',
        items: [
          'Before `add_transition`, call `inspect_transition_boundary`; before `batch_add_transitions`, call `inspect_track_transition_boundaries`.',
          'Prefer `safe_batch_add_transitions` when you want the server to inspect first and automatically skip gap or overlap boundaries.',
          'Use `add_keyframe` for value writes and `set_keyframe_interpolation` for interpolation-only updates. `add_keyframe.time` is clip-relative seconds (0 = clip start), not absolute sequence time.',
          'For slide or Motion.Position work, prefer `apply_keyframe_animation` or `apply_animation_preset` with a real `clipId`; the server can resolve the target clip sequence frame size before converting pixel coordinates.',
          'For still image motion on Motion.Position, Motion.Scale, Motion.Rotation, or Motion.Anchor Point, expect high-level animation tools like `apply_keyframe_animation` and `apply_animation_preset` to prefer a Transform effect fallback. Low-level `add_keyframe` stays on the component you requested, so verify which component actually received the keys.',
          'If a still image move remains unstable or must match a tutorial UI exactly, Nest the clip first and animate the Transform effect inside the nested shot instead of forcing intrinsic Motion.',
          'If the project contains many still images, consider Render and Replace or pre-rendering those stills to short mezzanine video clips before bulk automation.',
          'If the request says `Continuous Bezier`, state explicitly that the current host path falls back to host `bezier` mode and does not expose separate handle editing.',
        ],
      },
      {
        heading: 'Verification and stop conditions',
        items: [
          'After write operations, verify with read-back tools such as `get_keyframes`, `list_sequence_tracks`, or review metadata instead of trusting a message string alone.',
          'For high-level assembly flows, run `plan_edit_assembly` or `review_edit_reasonability` first and treat blocked findings as hard stops.',
          'When a host limitation is known, report the limitation plainly instead of claiming full support.',
        ],
      },
    ],
    'Use this playbook for both Claude Code and Codex sessions so the MCP is driven through explicit, verifiable steps.',
  );
}

function createPromptCatalog(): PromptDefinition[] {
  return [
    {
      name: 'operate_premiere_mcp',
      description: 'Guide an agent through safe, verifiable use of this Premiere MCP server for sequence, transition, and keyframe work.',
      arguments: PROMPT_ARGUMENTS.operatePremiereMcp,
      build: (args) => {
        const objective = pickText(args, ['objective'], 'complete a Premiere edit task');
        const sequenceName = pickText(args, ['sequence_name'], 'active sequence or resolved target sequence');
        const deliveryTarget = pickText(args, ['delivery_target'], 'current project delivery target');

        return {
          description: `Agent operating playbook for ${objective}`,
          messages: [
            text('system', 'You are operating a Premiere MCP server from an agent client. Be conservative, inspect state before writing, and report host limitations explicitly instead of guessing.'),
            text('user', `I need to ${objective}. The target sequence is ${sequenceName}. The delivery target is ${deliveryTarget}. Give me the safest tool workflow.`),
            text('assistant', buildAgentWorkflow(objective, sequenceName, deliveryTarget)),
            text(
              'user',
              [
                '=== 强制执行规则（每次任务开始前必读）===',
                '',
                '1. 首先读取 premiere://mcp/agent-guide 获取完整操作规范',
                '2. 读取 premiere://project/info 了解当前项目状态',
                '3. 识别任务场景类型 (natural_language / docx_guided / reference_video / viral_style)',
                '',
                '4. 如果任务涉及“爆款/抖音/TikTok/快节奏/模仿热门/平台风格”：',
                '   → 必须先执行研究阶段（搜集参考 → 分析模式 → 生成蓝图）',
                '   → 未生成 EditingBlueprint 前，禁止调用 assemble 类工具',
                '',
                '5. build_timeline_from_xml 当前为 DISABLED 状态，禁止使用',
                '   → 如需构建时间线，使用 plan_edit_from_request 或 assemble_product_spot',
                '',
                '6. 每次关键写操作后：',
                '   → 检查 verification.confirmed 字段',
                '   → 如果 confirmed:false，检查 mismatch 原因',
                '   → 如果影响后续步骤，立即停止',
                '',
                '7. 所有任务完成前必须经过 critic_edit_result 审稿',
                '   → critic 不通过 → 不得向用户报告“完成”',
                '   → 报告 critic 的 findings 和 actionableFixes',
                '',
                '8. 遇到以下情况必须停止：',
                '   → blocked / VERIFICATION_FAILED / CRITIC_FAILED / TOOL_DISABLED',
                '   → 同一步骤连续失败 2 次',
                '   → 不得仅凭工具调用成功判断任务完成',
                '',
                '9. 完成标准：successCriteria 全部满足 + critic 通过',
              ].join('\n'),
            ),
            text(
              'assistant',
              [
                '=== External Viral-Style Routing ===',
                '',
                'If the client exposes video-research-mcp, prefer its structured research tools over generic web search for viral_style tasks.',
                'Once researchTaskDir or editingBlueprintPath exists, prefer assemble_product_spot_closed_loop over manually stitching load/review/assemble/compare/critic.',
                'When subtitleSourcePath is available and the blueprint implies text overlays or captions, pass it into assemble_product_spot_closed_loop so the workflow generates subtitles instead of leaving caption stitching manual.',
                'When bgmPath is available and the blueprint implies beat-driven cutting, pass it into assemble_product_spot_closed_loop so the workflow creates beat markers and returns manual keyframe guidance for the beat accents.',
                'Do not treat web search, browser snapshots, or ad-hoc browsing as a substitute for EditingBlueprint generation.',
              ].join('\n'),
            ),
          ],
        };
      },
    },
    {
      name: 'create_video_project',
      description: 'Plan the setup and first editorial pass for a new Premiere video project.',
      arguments: PROMPT_ARGUMENTS.createVideoProject,
      build: (args) => {
        const projectType = pickText(args, ['project_type'], 'general');
        const duration = pickText(args, ['duration'], 'unspecified length');

        return {
          description: `Blueprint for a ${projectType} project`,
          messages: [
            text('system', `You are a post-production lead building a ${projectType} workflow in Adobe Premiere Pro. Give the user an ordered plan, note what should be decided before editing, and keep every recommendation practical.`),
            text('user', `I want to set up a ${projectType} video project in Premiere Pro. The target duration is ${duration}. Show me the setup order and the first editing pass.`),
            text('assistant', buildAssistantMessage(
              `Use this as the opening pass for a ${projectType} project with a target duration of ${duration}.`,
              [
                {
                  heading: 'Project framing',
                  items: [
                    `Lock the delivery target first: audience, aspect ratio, and whether the ${projectType} cut needs multiple exports.`,
                    'Name the project, scratch locations, and source media structure before importing anything.',
                    'Create one working sequence for assembly and separate review or experiment sequences if the concept is still moving.',
                  ],
                },
                {
                  heading: 'Ingest and organization',
                  items: [
                    'Build bins for selects, graphics, music, VO, and exports instead of one flat media dump.',
                    'Label or tag the strongest shots immediately so the rough cut starts from ranked material.',
                    'Check frame rate, sample rate, and clip orientation mismatches before the timeline fills up.',
                  ],
                },
                {
                  heading: 'First editorial pass',
                  items: [
                    'Assemble story beats in order and ignore polish until the structure reads clearly.',
                    'Evaluate pacing against the target duration at the rough-cut stage, not at the end.',
                    'Only after the cut works should you branch into sound design, color, titles, and export presets.',
                  ],
                },
              ],
              'If you want, I can turn that outline into a Premiere-specific shot list, bin plan, or first-pass timeline checklist.',
            )),
          ],
        };
      },
    },
    {
      name: 'edit_music_video',
      description: 'Build a beat-aware edit plan for a music video assembly.',
      arguments: PROMPT_ARGUMENTS.editMusicVideo,
      build: (args) => {
        const musicFile = summarizePath(pickText(args, ['music_file'], 'music-track.wav'));
        const clipSummary = summarizePathList(args.video_clips, 'No selected clips listed yet');

        return {
          description: 'Beat-aware workflow for cutting a music video',
          messages: [
            text('system', 'You are a music-video editor. Give the user a rhythm-first editing plan, protect the emotional arc of the song, and anchor the advice in actual supplied media.'),
            text('user', `I am cutting a music video around ${musicFile}. The available footage is ${clipSummary.sentence}. Show me how to assemble it.`),
            text('assistant', buildAssistantMessage(
              `Working set: ${musicFile} with ${clipSummary.sentence}.`,
              [
                {
                  heading: 'Prep the timeline',
                  items: [
                    `Place ${musicFile} on the timeline first and map the structural beats: intro, verse, chorus, break, outro.`,
                    'Mark lyric hits, drum accents, and moments where the visual energy should either spike or deliberately hold.',
                    `Review the ${clipSummary.count || 'available'} clips and decide which ones feel performance-led, texture-led, or story-led.`,
                  ],
                },
                {
                  heading: 'Assemble the first pass',
                  items: [
                    `Start with the strongest anchor images: ${clipSummary.labels.slice(0, 3).join(', ') || 'your best hero shots'}.`,
                    'Cut by musical intent, not just waveform repetition. Chorus edits can accelerate while verse edits can breathe.',
                    'Leave some transitions hard and dry; if every cut chases the beat the sequence loses shape.',
                  ],
                },
                {
                  heading: 'Refine and finish',
                  items: [
                    'Use speed changes, repeats, or effect shots only where the song earns a visual lift.',
                    'Check continuity of eyelines, motion direction, and wardrobe before applying stylized treatments.',
                    'Do one silent playback to judge visual rhythm without being distracted by the track you already know.',
                  ],
                },
              ],
              'If needed, I can convert that into a shot-by-shot cut map or a marker plan for Premiere.',
            )),
          ],
        };
      },
    },
    {
      name: 'color_grade_footage',
      description: 'Shape a grading pass for a specific footage type and target mood.',
      arguments: PROMPT_ARGUMENTS.colorGrade,
      build: (args) => {
        const footageType = pickText(args, ['footage_type'], 'standard');
        const targetMood = pickText(args, ['target_mood'], 'natural').toLowerCase();

        return {
          description: `Color pass for ${footageType} footage`,
          messages: [
            text('system', 'You are a finishing colorist. Build a grading workflow that starts with correction, then moves into look creation, and call out risks that commonly break images.'),
            text('user', `I need to grade ${footageType} footage toward a ${targetMood} look. Walk me through the order of operations.`),
            text('assistant', buildAssistantMessage(
              `Treat the ${footageType} footage as a correction-first job before committing to the ${targetMood} look.`,
              [
                {
                  heading: 'Normalize the image',
                  items: [
                    'Balance exposure, white balance, and contrast shot by shot before comparing clips as a sequence.',
                    'Set a neutral reference frame from the strongest shot and pull the rest toward it.',
                    `Watch for ${footageType} footage failure modes such as clipped highlights, muddy mids, or color shifts in mixed light.`,
                  ],
                },
                {
                  heading: 'Build the look',
                  items: moodRecipe(targetMood),
                },
                {
                  heading: 'Sequence-level review',
                  items: [
                    'Check consecutive edits for jumps in black level, white level, and skin consistency.',
                    'Review the grade on both a hero monitor and a weaker display so the look survives outside the suite.',
                    'Save the technical correction and creative look as separate preset steps so revisions stay reversible.',
                  ],
                },
              ],
              'If you want, I can turn that into Lumetri panel moves or a shot-matching checklist.',
            )),
          ],
        };
      },
    },
    {
      name: 'multicam_editing',
      description: 'Plan a multi-camera sync and live-switch workflow.',
      arguments: PROMPT_ARGUMENTS.multicam,
      build: (args) => {
        const cameraCount = pickText(args, ['camera_count'], '2');
        const syncMethod = pickText(args, ['sync_method'], 'audio');

        return {
          description: 'Multicam preparation and edit plan',
          messages: [
            text('system', 'You are supervising a multicam edit. Prioritize sync reliability, camera naming discipline, and a switch pass that remains easy to revise.'),
            text('user', `I have ${cameraCount} camera angles and I want to sync them using ${syncMethod}. Show me the safest Premiere workflow.`),
            text('assistant', buildAssistantMessage(
              `For a ${cameraCount}-camera edit, treat ${syncMethod} as the primary sync path and keep one fallback verification path ready.`,
              [
                {
                  heading: 'Prep before syncing',
                  items: [
                    'Rename clips by camera position before creating the multicam source sequence.',
                    'Check frame rate and audio drift first; sync tools do not rescue mismatched capture settings.',
                    'Make one inspection sequence where you can visually confirm clap, waveforms, or timecode alignment.',
                  ],
                },
                {
                  heading: 'Build the edit pass',
                  items: [
                    'Create the multicam source, then cut from a dedicated review sequence rather than your archival source sequence.',
                    'Do a live switch pass for instinct, then refine with trims and reaction timing.',
                    'Mark any angle coverage problems as sequence markers so they are easy to revisit during cleanup.',
                  ],
                },
                {
                  heading: 'Protect revisionability',
                  items: [
                    'Keep camera labels visible in the monitor while switching.',
                    'Avoid destructive nest-on-nest complexity unless there is a clear delivery reason.',
                    'After the switch pass, verify that every angle change still lands on action or spoken intent.',
                  ],
                },
              ],
              'I can also turn this into a sync checklist for timecode, audio, or manual marker workflows.',
            )),
          ],
        };
      },
    },
    {
      name: 'podcast_editing',
      description: 'Organize a dialogue-first edit for a podcast or talk format.',
      arguments: PROMPT_ARGUMENTS.podcast,
      build: (args) => {
        const participantCount = pickText(args, ['participant_count'], '2');
        const episodeLength = pickText(args, ['episode_length'], 'full-length episode');

        return {
          description: 'Podcast editing workflow',
          messages: [
            text('system', 'You are an editor handling a dialogue-driven podcast. Keep clarity, consistency, and pacing ahead of flashy technique.'),
            text('user', `I need to edit a podcast with ${participantCount} participants and a target length of ${episodeLength}. What workflow should I use?`),
            text('assistant', buildAssistantMessage(
              `Treat this as a dialogue-led edit for ${participantCount} speakers with a target of ${episodeLength}.`,
              [
                {
                  heading: 'Dialogue cleanup',
                  items: [
                    'Sync and organize every voice source before touching timing.',
                    'Match perceived loudness early so content decisions are not biased by one loud mic.',
                    'Strip obvious distractions first: false starts, repeated words, long dead air, and technical interruptions.',
                  ],
                },
                {
                  heading: 'Structural pacing',
                  items: [
                    'Define the conversation beats: open, setup, major topic turns, closing takeaway.',
                    'Keep pauses that support meaning; remove pauses that only signal hesitation or search time.',
                    'If the runtime drifts, cut redundant thoughts before you cut the useful nuance.',
                  ],
                },
                {
                  heading: 'Polish',
                  items: [
                    'Use music and graphics sparingly so they frame the conversation instead of competing with it.',
                    'Check speaker identity, lower-thirds, and chapter markers if the format needs them.',
                    'Do a final listen without looking at the screen to catch pacing and tonal inconsistencies.',
                  ],
                },
              ],
              'If needed, I can break that into an audio cleanup pass, a story pass, and an export checklist.',
            )),
          ],
        };
      },
    },
    {
      name: 'social_media_content',
      description: 'Adapt a cut for social media delivery constraints and viewing habits.',
      arguments: PROMPT_ARGUMENTS.socialMedia,
      build: (args) => {
        const platform = pickText(args, ['platform'], 'social');
        const contentType = pickText(args, ['content_type'], 'video');

        return {
          description: `Social delivery plan for ${platform}`,
          messages: [
            text('system', 'You are editing short-form platform content. Optimize for platform behavior, safe text placement, and immediate clarity.'),
            text('user', `I am making a ${contentType} for ${platform}. What should the Premiere workflow optimize for?`),
            text('assistant', buildAssistantMessage(
              `Edit the ${contentType} for ${platform} as a platform-native piece rather than a cropped afterthought.`,
              [
                {
                  heading: 'Format decisions',
                  items: socialSpecs(platform, contentType),
                },
                {
                  heading: 'Editorial priorities',
                  items: [
                    'Front-load the premise so the viewer understands the hook before the second beat arrives.',
                    'Treat on-screen text, graphic emphasis, and punch-ins as editorial timing devices.',
                    'Design every cut assuming the audio may be low or muted on first view.',
                  ],
                },
                {
                  heading: 'Review before export',
                  items: [
                    'Check text crop, UI overlap zones, and thumbnail readability.',
                    'Run one watch at phone size or zoomed-out scale so weak frames show up immediately.',
                    'Export a test render and confirm it survives platform compression better than the timeline preview suggests.',
                  ],
                },
              ],
              'If you want, I can convert that into a shot pacing recipe for Reels, TikTok, Shorts, or a square feed post.',
            )),
          ],
        };
      },
    },
    {
      name: 'documentary_editing',
      description: 'Lay out a documentary edit around interviews, evidence, and narrative structure.',
      arguments: PROMPT_ARGUMENTS.documentary,
      build: (args) => {
        const interviewCount = pickText(args, ['interview_count'], '1');
        const narrativeStructure = pickText(args, ['narrative_structure'], 'thematic');

        return {
          description: 'Documentary editorial workflow',
          messages: [
            text('system', 'You are shaping documentary material. Protect factual clarity, source hierarchy, and narrative control.'),
            text('user', `I am editing a documentary with ${interviewCount} interview subjects using a ${narrativeStructure} structure. How should I build the cut?`),
            text('assistant', buildAssistantMessage(
              `For a ${narrativeStructure} documentary with ${interviewCount} interviews, build the spine before you chase coverage beauty.`,
              [
                {
                  heading: 'Paper edit first',
                  items: [
                    'Transcribe or index the interviews and tag every clip by argument, emotion, and evidence value.',
                    'Build the narrative spine from the strongest spoken beats before layering B-roll.',
                    'Identify where exposition, proof, and emotional release each belong so the cut does not drift into repetition.',
                  ],
                },
                {
                  heading: 'Coverage strategy',
                  items: [
                    'Use B-roll to add evidence, scale, or contrast, not just to hide cuts.',
                    'Keep archival, interview, and observational material visually distinct enough that the viewer always knows what they are seeing.',
                    'Track continuity of factual claims so that picture choices never imply the wrong timeline or subject relationship.',
                  ],
                },
                {
                  heading: 'Final shaping',
                  items: [
                    'Review the cut for over-explaining; documentary pacing often improves when one clear line replaces three similar lines.',
                    'Check lower-thirds, source labels, and rights-sensitive material before finishing.',
                    'Do at least one review focused only on factual clarity and one focused only on emotional pacing.',
                  ],
                },
              ],
              'I can also turn this into an interview-selects workflow or a documentary paper-edit template.',
            )),
          ],
        };
      },
    },
    {
      name: 'commercial_editing',
      description: 'Shape a commercial cut around runtime, message density, and CTA timing.',
      arguments: PROMPT_ARGUMENTS.commercial,
      build: (args) => {
        const commercialLength = pickText(args, ['commercial_length', 'duration'], '30 seconds');
        const productType = pickText(args, ['product_type', 'commercial_type'], 'product');

        return {
          description: `Commercial workflow for a ${commercialLength} spot`,
          messages: [
            text('system', 'You are cutting a commercial. Keep the message hierarchy clear, protect brand legibility, and do not waste frames.'),
            text('user', `I need to edit a ${commercialLength} commercial for a ${productType}. How should I structure the cut?`),
            text('assistant', buildAssistantMessage(
              `Approach the ${commercialLength} ${productType} commercial as a message-priority edit: hook, proof, payoff, CTA.`,
              [
                {
                  heading: 'Structure',
                  items: [
                    'Open on the strongest promise or visual curiosity point immediately.',
                    'Introduce the product or offer before the viewer has to infer what is being sold.',
                    'Reserve the closing seconds for the CTA, legal text, or offer clarity rather than cramming them into the middle.',
                  ],
                },
                {
                  heading: 'Pacing',
                  items: [
                    `Use the runtime of ${commercialLength} as an editorial budget; every shot must either persuade or clarify.`,
                    'Prefer one memorable proof point over several weak ones.',
                    'Keep logos, supers, and claims on screen long enough to read at first glance.',
                  ],
                },
                {
                  heading: 'Finishing checks',
                  items: [
                    'Verify audio, supers, and branding all align on the same message hierarchy.',
                    'Check that the commercial still reads with sound low or absent if the delivery context demands it.',
                    'Export a review render and judge whether the spot lands before the final frame, not only because of it.',
                  ],
                },
              ],
              'If helpful, I can translate this into a 15-second, 30-second, or 60-second shot allocation plan.',
            )),
          ],
        };
      },
    },
    {
      name: 'optimize_workflow',
      description: 'Improve editorial throughput and system stability for a Premiere workflow.',
      arguments: PROMPT_ARGUMENTS.optimize,
      build: (args) => {
        const projectSize = pickText(args, ['project_size', 'workflow_type'], 'medium');
        const hardwareSpecs = pickText(args, ['hardware_specs'], 'current workstation');

        return {
          description: 'Premiere workflow optimization checklist',
          messages: [
            text('system', 'You are optimizing an editor workstation and sequence workflow. Focus on bottlenecks that materially change responsiveness and revision speed.'),
            text('user', `I want to optimize a ${projectSize} Premiere workflow on ${hardwareSpecs}. What should I tune first?`),
            text('assistant', buildAssistantMessage(
              `Treat this as a ${projectSize} workflow running on ${hardwareSpecs}. Fix the bottlenecks in the order they hurt the edit most.`,
              [
                {
                  heading: 'Playback and responsiveness',
                  items: [
                    'Match preview settings, playback resolution, and proxy strategy to the heaviest footage in the project.',
                    'Keep cache and source media on storage that can sustain the project rather than just benchmark well once.',
                    'Remove stale sequence clutter so the active timeline is not carrying avoidable overhead.',
                  ],
                },
                {
                  heading: 'Revision speed',
                  items: [
                    'Template bins, labels, export presets, and adjustment layers so the next cut starts organized.',
                    'Reduce repeated manual setup by saving effect presets and reusable sequence scaffolds.',
                    'Separate assembly, review, and delivery sequences so each pass has a clear purpose.',
                  ],
                },
                {
                  heading: 'Stability and maintenance',
                  items: [
                    'Audit plugins, auto-save cadence, scratch paths, and version compatibility before blaming the timeline.',
                    'Clean media cache on purpose, not reactively in the middle of a deadline.',
                    'Document the working machine settings so a second editor can reproduce the environment.',
                  ],
                },
              ],
              'If you want, I can narrow this down to storage, proxy, playback, or collaboration-specific optimizations.',
            )),
          ],
        };
      },
    },
    {
      name: 'audio_cleanup',
      description: 'Repair, level, and polish problematic dialogue or production audio.',
      arguments: PROMPT_ARGUMENTS.audioCleanup,
      build: (args) => {
        const audioIssues = pickText(args, ['audio_issues'], 'background noise');
        const audioSource = pickText(args, ['audio_source'], 'microphone');

        return {
          description: 'Audio repair workflow',
          messages: [
            text('system', 'You are a dialogue and audio cleanup specialist. Favor intelligibility, consistency, and artifact control over heavy-handed processing.'),
            text('user', `I have ${audioSource} audio with ${audioIssues}. What cleanup order should I use to make it sound professional?`),
            text('assistant', buildAssistantMessage(
              `Treat the ${audioSource} recording as a repair-first job with the main issue flagged as ${audioIssues}.`,
              [
                {
                  heading: 'Inspection',
                  items: [
                    'Listen through once and log where the problem is constant versus only appearing on isolated phrases.',
                    'Establish a clean reference section so you know what “fixed” should still sound like.',
                    'Decide whether the repair can stay in Premiere or should move to Audition or another dedicated tool.',
                  ],
                },
                {
                  heading: 'Cleanup order',
                  items: audioFixes(audioIssues),
                },
                {
                  heading: 'Final polish',
                  items: [
                    'Apply broad EQ and compression only after the obvious repair issues are under control.',
                    'Level-match across clips so the edit feels continuous before adding music or ambience.',
                    'Check for artifacts on headphones and small speakers before signing off on the result.',
                  ],
                },
              ],
              'If needed, I can turn that into a Premiere Essential Sound pass or a more surgical Audition cleanup chain.',
            )),
          ],
        };
      },
    },
  ];
}

const PROMPT_CATALOG = createPromptCatalog();
const PROMPT_LOOKUP = new Map(PROMPT_CATALOG.map((definition) => [definition.name, definition]));

export class PremiereProPrompts {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('PremiereProPrompts');
  }

  getAvailablePrompts(): MCPPrompt[] {
    return PROMPT_CATALOG.map(({ build, ...definition }) => ({
      ...definition,
      arguments: definition.arguments?.map((argument) => ({ ...argument })),
    }));
  }

  async getPrompt(name: string, args: Record<string, unknown>): Promise<GeneratedPrompt> {
    this.logger.info(`Generating prompt: ${name}`);
    const definition = PROMPT_LOOKUP.get(name);

    if (!definition) {
      throw new Error(`Prompt '${name}' not found`);
    }

    return definition.build(args ?? {});
  }
}
