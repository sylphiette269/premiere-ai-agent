import { PremiereBridge } from '../bridge/index.js';
import { Logger } from '../utils/logger.js';

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface ResourceDefinition extends MCPResource {
  script?: () => string;
  read?: () => unknown | Promise<unknown>;
}

function script(lines: string[]): string {
  return lines.join('\n');
}

function projectInfoScript(): string {
  return script([
    'var project = app.project;',
    'var payload = {',
    '  id: project.documentID,',
    '  name: project.name,',
    '  path: project.path,',
    '  isModified: project.dirty,',
    '  settings: {',
    '    scratchDiskPath: project.scratchDiskPath,',
    '    captureFormat: project.captureFormat,',
    '    previewFormat: project.previewFormat',
    '  },',
    '  statistics: {',
    '    sequenceCount: project.sequences.numSequences,',
    '    projectItemCount: project.rootItem.children.numItems',
    '  }',
    '};',
    'JSON.stringify(payload);',
  ]);
}

function projectSequencesScript(): string {
  return script([
    'var project = app.project;',
    'var items = [];',
    'for (var index = 0; index < project.sequences.numSequences; index++) {',
    '  var sequence = project.sequences[index];',
    '  items.push({',
    '    id: sequence.sequenceID,',
    '    name: sequence.name,',
    '    frameRate: sequence.framerate,',
    '    duration: sequence.end - sequence.zeroPoint,',
    '    videoTracks: sequence.videoTracks.numTracks,',
    '    audioTracks: sequence.audioTracks.numTracks,',
    '    settings: {',
    '      frameSize: {',
    '        width: sequence.frameSizeHorizontal,',
    '        height: sequence.frameSizeVertical',
    '      },',
    '      pixelAspectRatio: sequence.pixelAspectRatio,',
    '      fieldType: sequence.fieldType',
    '    }',
    '  });',
    '}',
    'JSON.stringify({ sequences: items, totalCount: items.length });',
  ]);
}

function projectMediaScript(): string {
  return script([
    'var project = app.project;',
    'var mediaItems = [];',
    'function collectMedia(container) {',
    '  for (var index = 0; index < container.children.numItems; index++) {',
    '    var child = container.children[index];',
    '    if (child.type === ProjectItemType.CLIP) {',
    '      mediaItems.push({',
    '        id: child.nodeId,',
    '        name: child.name,',
    '        type: child.type,',
    '        mediaPath: child.getMediaPath(),',
    '        duration: child.getOutPoint() - child.getInPoint(),',
    '        frameRate: child.getVideoFrameRate(),',
    '        hasVideo: child.hasVideo(),',
    '        hasAudio: child.hasAudio(),',
    '        metadata: {',
    '          creationTime: child.getCreationTime(),',
    '          modificationTime: child.getModificationTime(),',
    '          fileSize: child.getFileSize()',
    '        }',
    '      });',
    '      continue;',
    '    }',
    '    if (child.type === ProjectItemType.BIN) {',
    '      collectMedia(child);',
    '    }',
    '  }',
    '}',
    'collectMedia(project.rootItem);',
    'JSON.stringify({ mediaItems: mediaItems, totalCount: mediaItems.length });',
  ]);
}

function projectBinsScript(): string {
  return script([
    'var project = app.project;',
    'var bins = [];',
    'function collectBins(container, depth) {',
    '  for (var index = 0; index < container.children.numItems; index++) {',
    '    var child = container.children[index];',
    '    if (child.type !== ProjectItemType.BIN) continue;',
    '    bins.push({',
    '      id: child.nodeId,',
    '      name: child.name,',
    '      depth: depth,',
    '      itemCount: child.children.numItems,',
    '      path: child.treePath',
    '    });',
    '    collectBins(child, depth + 1);',
    '  }',
    '}',
    'collectBins(project.rootItem, 0);',
    'JSON.stringify({ bins: bins, totalCount: bins.length });',
  ]);
}

function timelineClipsScript(): string {
  return script([
    'var project = app.project;',
    'var clips = [];',
    'var activeSequence = project.activeSequence;',
    'if (activeSequence) {',
    '  for (var videoTrackIndex = 0; videoTrackIndex < activeSequence.videoTracks.numTracks; videoTrackIndex++) {',
    '    var videoTrack = activeSequence.videoTracks[videoTrackIndex];',
    '    for (var videoClipIndex = 0; videoClipIndex < videoTrack.clips.numItems; videoClipIndex++) {',
    '      var videoClip = videoTrack.clips[videoClipIndex];',
    '      clips.push({',
    '        id: videoClip.nodeId,',
    '        name: videoClip.name,',
    '        trackType: "video",',
    '        trackIndex: videoTrackIndex,',
    '        startTime: videoClip.start.seconds,',
    '        endTime: videoClip.end.seconds,',
    '        duration: videoClip.duration.seconds',
    '      });',
    '    }',
    '  }',
    '  for (var audioTrackIndex = 0; audioTrackIndex < activeSequence.audioTracks.numTracks; audioTrackIndex++) {',
    '    var audioTrack = activeSequence.audioTracks[audioTrackIndex];',
    '    for (var audioClipIndex = 0; audioClipIndex < audioTrack.clips.numItems; audioClipIndex++) {',
    '      var audioClip = audioTrack.clips[audioClipIndex];',
    '      clips.push({',
    '        id: audioClip.nodeId,',
    '        name: audioClip.name,',
    '        trackType: "audio",',
    '        trackIndex: audioTrackIndex,',
    '        startTime: audioClip.start.seconds,',
    '        endTime: audioClip.end.seconds,',
    '        duration: audioClip.duration.seconds',
    '      });',
    '    }',
    '  }',
    '}',
    'JSON.stringify({ clips: clips, totalCount: clips.length, activeSequence: activeSequence ? activeSequence.name : null });',
  ]);
}

function timelineTracksScript(): string {
  return script([
    'var project = app.project;',
    'var activeSequence = project.activeSequence;',
    'var tracks = [];',
    'if (activeSequence) {',
    '  for (var videoTrackIndex = 0; videoTrackIndex < activeSequence.videoTracks.numTracks; videoTrackIndex++) {',
    '    var videoTrack = activeSequence.videoTracks[videoTrackIndex];',
    '    tracks.push({',
    '      id: "video-" + videoTrackIndex,',
    '      name: videoTrack.name || ("Video " + (videoTrackIndex + 1)),',
    '      type: "video",',
    '      index: videoTrackIndex,',
    '      enabled: !videoTrack.isMuted(),',
    '      locked: videoTrack.isLocked(),',
    '      muted: videoTrack.isMuted(),',
    '      clipCount: videoTrack.clips.numItems',
    '    });',
    '  }',
    '  for (var audioTrackIndex = 0; audioTrackIndex < activeSequence.audioTracks.numTracks; audioTrackIndex++) {',
    '    var audioTrack = activeSequence.audioTracks[audioTrackIndex];',
    '    tracks.push({',
    '      id: "audio-" + audioTrackIndex,',
    '      name: audioTrack.name || ("Audio " + (audioTrackIndex + 1)),',
    '      type: "audio",',
    '      index: audioTrackIndex,',
    '      enabled: !audioTrack.isMuted(),',
    '      locked: audioTrack.isLocked(),',
    '      muted: audioTrack.isMuted(),',
    '      clipCount: audioTrack.clips.numItems',
    '    });',
    '  }',
    '}',
    'JSON.stringify({ tracks: tracks, totalCount: tracks.length, activeSequence: activeSequence ? activeSequence.name : null });',
  ]);
}

function timelineMarkersScript(): string {
  return script([
    'var project = app.project;',
    'var activeSequence = project.activeSequence;',
    'var markers = [];',
    'if (activeSequence) {',
    '  var marker = activeSequence.markers.getFirstMarker();',
    '  while (marker) {',
    '    markers.push({',
    '      id: marker.guid,',
    '      name: marker.name,',
    '      comment: marker.comment,',
    '      startTime: marker.start,',
    '      endTime: marker.end,',
    '      duration: marker.duration,',
    '      type: marker.type,',
    '      color: marker.color',
    '    });',
    '    marker = activeSequence.markers.getNextMarker(marker);',
    '  }',
    '}',
    'JSON.stringify({ markers: markers, totalCount: markers.length, activeSequence: activeSequence ? activeSequence.name : null });',
  ]);
}

function availableEffectsScript(): string {
  return script([
    'var effects = [];',
    'var videoEffects = app.getAvailableVideoEffects();',
    'for (var videoIndex = 0; videoIndex < videoEffects.length; videoIndex++) {',
    '  effects.push({',
    '    name: videoEffects[videoIndex].name,',
    '    matchName: videoEffects[videoIndex].matchName,',
    '    category: videoEffects[videoIndex].category,',
    '    type: "video"',
    '  });',
    '}',
    'var audioEffects = app.getAvailableAudioEffects();',
    'for (var audioIndex = 0; audioIndex < audioEffects.length; audioIndex++) {',
    '  effects.push({',
    '    name: audioEffects[audioIndex].name,',
    '    matchName: audioEffects[audioIndex].matchName,',
    '    category: audioEffects[audioIndex].category,',
    '    type: "audio"',
    '  });',
    '}',
    'JSON.stringify({ effects: effects, totalCount: effects.length });',
  ]);
}

function appliedEffectsScript(): string {
  return script([
    'var project = app.project;',
    'var activeSequence = project.activeSequence;',
    'var appliedEffects = [];',
    'if (activeSequence) {',
    '  for (var videoTrackIndex = 0; videoTrackIndex < activeSequence.videoTracks.numTracks; videoTrackIndex++) {',
    '    var videoTrack = activeSequence.videoTracks[videoTrackIndex];',
    '    for (var videoClipIndex = 0; videoClipIndex < videoTrack.clips.numItems; videoClipIndex++) {',
    '      var videoClip = videoTrack.clips[videoClipIndex];',
    '      for (var videoEffectIndex = 0; videoEffectIndex < videoClip.components.numItems; videoEffectIndex++) {',
    '        var videoEffect = videoClip.components[videoEffectIndex];',
    '        appliedEffects.push({',
    '          clipId: videoClip.nodeId,',
    '          clipName: videoClip.name,',
    '          effectName: videoEffect.displayName,',
    '          effectMatchName: videoEffect.matchName,',
    '          trackType: "video",',
    '          trackIndex: videoTrackIndex,',
    '          enabled: videoEffect.enabled',
    '        });',
    '      }',
    '    }',
    '  }',
    '  for (var audioTrackIndex = 0; audioTrackIndex < activeSequence.audioTracks.numTracks; audioTrackIndex++) {',
    '    var audioTrack = activeSequence.audioTracks[audioTrackIndex];',
    '    for (var audioClipIndex = 0; audioClipIndex < audioTrack.clips.numItems; audioClipIndex++) {',
    '      var audioClip = audioTrack.clips[audioClipIndex];',
    '      for (var audioEffectIndex = 0; audioEffectIndex < audioClip.components.numItems; audioEffectIndex++) {',
    '        var audioEffect = audioClip.components[audioEffectIndex];',
    '        appliedEffects.push({',
    '          clipId: audioClip.nodeId,',
    '          clipName: audioClip.name,',
    '          effectName: audioEffect.displayName,',
    '          effectMatchName: audioEffect.matchName,',
    '          trackType: "audio",',
    '          trackIndex: audioTrackIndex,',
    '          enabled: audioEffect.enabled',
    '        });',
    '      }',
    '    }',
    '  }',
    '}',
    'JSON.stringify({ appliedEffects: appliedEffects, totalCount: appliedEffects.length });',
  ]);
}

function availableTransitionsScript(): string {
  return script([
    'var transitions = [];',
    'var videoTransitions = app.getAvailableVideoTransitions();',
    'for (var videoIndex = 0; videoIndex < videoTransitions.length; videoIndex++) {',
    '  transitions.push({',
    '    name: videoTransitions[videoIndex].name,',
    '    matchName: videoTransitions[videoIndex].matchName,',
    '    category: videoTransitions[videoIndex].category,',
    '    type: "video"',
    '  });',
    '}',
    'var audioTransitions = app.getAvailableAudioTransitions();',
    'for (var audioIndex = 0; audioIndex < audioTransitions.length; audioIndex++) {',
    '  transitions.push({',
    '    name: audioTransitions[audioIndex].name,',
    '    matchName: audioTransitions[audioIndex].matchName,',
    '    category: audioTransitions[audioIndex].category,',
    '    type: "audio"',
    '  });',
    '}',
    'JSON.stringify({ transitions: transitions, totalCount: transitions.length });',
  ]);
}

function exportPresetsScript(): string {
  return script([
    'var encoder = app.encoder;',
    'var presets = [];',
    'var exportPresets = encoder.getExportPresets();',
    'for (var presetIndex = 0; presetIndex < exportPresets.length; presetIndex++) {',
    '  presets.push({',
    '    name: exportPresets[presetIndex].name,',
    '    matchName: exportPresets[presetIndex].matchName,',
    '    category: exportPresets[presetIndex].category,',
    '    description: exportPresets[presetIndex].description,',
    '    fileExtension: exportPresets[presetIndex].fileExtension',
    '  });',
    '}',
    'JSON.stringify({ presets: presets, totalCount: presets.length });',
  ]);
}

function projectMetadataScript(): string {
  return script([
    'var project = app.project;',
    'var activeSequence = project.activeSequence;',
    'var payload = {};',
    'if (activeSequence) {',
    '  payload = {',
    '    project: {',
    '      name: project.name,',
    '      path: project.path,',
    '      creationTime: project.creationTime,',
    '      modificationTime: project.modificationTime',
    '    },',
    '    sequence: {',
    '      name: activeSequence.name,',
    '      duration: activeSequence.end - activeSequence.zeroPoint,',
    '      frameRate: activeSequence.framerate,',
    '      settings: {',
    '        frameSize: {',
    '          width: activeSequence.frameSizeHorizontal,',
    '          height: activeSequence.frameSizeVertical',
    '        },',
    '        pixelAspectRatio: activeSequence.pixelAspectRatio,',
    '        fieldType: activeSequence.fieldType',
    '      }',
    '    },',
    '    statistics: {',
    '      totalClips: 0,',
    '      totalEffects: 0,',
    '      totalTransitions: 0',
    '    }',
    '  };',
    '  for (var videoTrackIndex = 0; videoTrackIndex < activeSequence.videoTracks.numTracks; videoTrackIndex++) {',
    '    var videoTrack = activeSequence.videoTracks[videoTrackIndex];',
    '    payload.statistics.totalClips += videoTrack.clips.numItems;',
    '    payload.statistics.totalTransitions += videoTrack.transitions.numItems;',
    '    for (var videoClipIndex = 0; videoClipIndex < videoTrack.clips.numItems; videoClipIndex++) {',
    '      payload.statistics.totalEffects += videoTrack.clips[videoClipIndex].components.numItems;',
    '    }',
    '  }',
    '  for (var audioTrackIndex = 0; audioTrackIndex < activeSequence.audioTracks.numTracks; audioTrackIndex++) {',
    '    var audioTrack = activeSequence.audioTracks[audioTrackIndex];',
    '    payload.statistics.totalClips += audioTrack.clips.numItems;',
    '    payload.statistics.totalTransitions += audioTrack.transitions.numItems;',
    '    for (var audioClipIndex = 0; audioClipIndex < audioTrack.clips.numItems; audioClipIndex++) {',
    '      payload.statistics.totalEffects += audioTrack.clips[audioClipIndex].components.numItems;',
    '    }',
    '  }',
    '}',
    'JSON.stringify(payload);',
  ]);
}

const TASK_DECOMPOSITION_TEMPLATE = `
## 任务拆解流程（强制）

每次收到编辑任务时，必须按以下顺序执行：

1. **识别任务类型**
   - natural_language: 普通自然语言描述的剪辑需求
   - docx_guided: 有 DOCX 脚本 + 素材清单的规范化任务
   - reference_video: 提供了参考视频要求复刻的任务
   - viral_style: 涉及"爆款/抖音/TikTok/快节奏/模仿热门/平台风格"的任务

2. **读取项目状态**
   - list_project_items
   - list_sequences
   - premiere://project/info

3. **判断是否需要研究阶段**
   - 若任务类型为 viral_style 或 reference_video → 必须先执行研究阶段
   - 未完成研究阶段前，禁止调用任何 assemble 类工具

4. **生成结构化计划**
   - 必须包含: steps / prerequisites / successCriteria / onFailure
   - 不得跳过 prerequisites 检查

5. **逐步执行，每步确认状态**

6. **关键写操作后执行 verification**

7. **全流程结束后必须经过 critic 审稿**

8. **critic 通过后方可向用户报告完成**
`.trim();

const HARD_STOP_RULES = `
## 硬停止规则（Hard Stop Rules）

以下情况必须立即停止执行，不得跳过或绕过：

1. review_edit_reasonability 返回 blocked:true → 立即停止，报告原因
2. 关键输入文件不存在 → 立即停止，不得猜测文件路径
3. verification.confirmed=false 且影响后续步骤的关键状态 → 立即停止
4. 同一步骤连续 2 次 retryable 错误 → 立即停止，报告给用户
5. critic 审稿不通过 → 不得向用户报告"完成"，必须报告需修正项
6. TOOL_DISABLED 错误 → 不得重试该工具，必须使用 fallback
7. ASSEMBLY_BLOCKED 错误 → 不得绕过，必须解决 blocking 条件

违反硬停止规则 = 系统级错误，优先级高于任务完成。
`.trim();

const IDEMPOTENCY_RULES = `
## 幂等性规则（Idempotency Rules）

防止重复写入导致的不一致状态：

1. 执行写操作前，优先确认目标是否已存在
   - 添加 clip 前先 list_sequence_tracks 检查是否已在时间线上
   - 添加 effect 前先读取当前 clip 的 effect 列表检查是否已应用
   - 添加 keyframe 前先读取已有 keyframe 列表

2. 同一 clip/effect/keyframe 不得盲目重复写入
   - 若目标已存在且参数匹配 → 跳过，标记 skipped
   - 若目标已存在但参数不匹配 → 先删除/修改，再写入

3. 若无法确认幂等性（即无对应的读取工具）
   → 在 plan 中标记该步骤为 "non_idempotent"
   → 执行前向用户确认
`.trim();

const STYLE_SAFETY_RULES = `
## 风格安全规则（Style Safety Rules）

防止所有任务都退化成 "cross dissolve slideshow"：

1. 快节奏 / 爆款 / 抖音 / TikTok 任务：
   - 禁止将 cross dissolve 作为主转场
   - cross dissolve 占总转场数比例不得超过 30%
   - 优先使用: hard_cut、beat_cut、zoom_cut、speed_ramp

2. 镜头时长检查：
   - 快节奏任务: 前 5 秒镜头平均时长 ≤ 1.5 秒
   - 标准任务: 镜头平均时长 ≤ 5 秒
   - 如果所有镜头时长几乎一致(方差 < 0.3) → 节奏过于平均，critic 判定不通过

3. 平台风格映射:
   - douyin/tiktok: 硬切为主、快节奏、前3秒必有hook、字幕大号居中
   - youtube: 可稍慢、允许 cross dissolve、需要片头片尾
   - instagram_reels: 垂直构图、动感转场、音乐驱动剪辑

4. 如果用户未指定风格，默认为"标准"，不得默认为快节奏

5. 没有 blueprint 时，不得对风格型任务使用默认模板
`.trim();

const STILL_IMAGE_KEYFRAME_WORKAROUNDS = `
## Still Image Motion Workarounds
Use these when the target clip is a still image and the request involves Motion or Transform animation.

1. For high-level still image animation flows such as apply_keyframe_animation or apply_animation_preset, default to the built-in Transform fallback before trusting intrinsic Motion.Position or Motion.Scale writes.
2. Low-level add_keyframe does not automatically rewrite componentName, so verify which component actually received the keys instead of assuming Motion stayed authoritative.
3. If the move is still unstable or must match a tutorial UI exactly, manually Nest the clip and animate the Transform effect inside the nested sequence.
4. For repeated hero shots, save the finished Transform move as a preset instead of rebuilding the same still image animation from scratch.
5. If a project contains many still images, prefer Render and Replace or pre-render those stills to short video clips before bulk automation.
`.trim();

const TOOL_AVAILABILITY = `
## 工具可用性表（Tool Availability）

以下工具当前被标记为不可用，agent 不得主动调用：

### 禁用工具

| 工具名 | 状态 | 原因 | 替代方案 |
|--------|------|------|----------|
| build_timeline_from_xml | DISABLED | XML 导入路径不稳定；motionStyle 不支持；已知导致 script_error | plan_edit_from_request / plan_edit_assembly / assemble_product_spot |

### 使用规则

- 遇到 DISABLED 工具 → 返回 TOOL_DISABLED 错误，不重试
- 即使用户明确要求使用 XML 路径 → 先返回风险说明，建议替代方案
- 只有当 DISABLED 工具被重新标记为 ENABLED 后才可使用
`.trim();

const SCENARIO_PLAYBOOKS = `
## 场景执行手册（Scenario Playbooks）

### 场景 A: natural_language（普通自然语言剪辑）
1. parse_edit_request → 理解用户需求
2. plan_edit_from_request → 生成剪辑计划
3. review_edit_reasonability → 检查计划合理性
4. assemble_product_spot(reviewBeforeAssemble:true)
5. critic_edit_result → 审稿
6. 交付

### 场景 B: docx_guided（DOCX 脚本指引）
1. plan_edit_assembly(docxPath, mediaManifestPath)
2. review_edit_reasonability
3. assemble_product_spot(autoPlanFromManifest:true, reviewBeforeAssemble:true)
4. critic_edit_result
5. 交付

### 场景 C: reference_video（参考视频复刻）
1. analyze_reference_video → 分析参考视频
2. plan_replication_from_video → 提取复刻计划
3. review_edit_reasonability
4. assemble_product_spot(referenceBlueprintPath)
5. compare_to_reference_video → 对比结果
6. critic_edit_result
7. 交付

### 场景 D: viral_style（爆款/平台风格）
1. collect_reference_videos → 搜集参考样本
2. analyze_reference_patterns → 分析共性模式
3. extract_editing_blueprint → 输出结构化蓝图
4. review_blueprint_reasonability → 审核蓝图
5. assemble_product_spot → 执行剪辑
6. compare_result_to_blueprint → 对比蓝图
7. critic_edit_result → 审稿
8. 交付

### 关键约束
- 场景 C/D 中，步骤 1-3/1-4 为 Research Gate，未完成前不得执行 assemble
- 所有场景最后一步前必须经过 critic
- critic 不通过 → 不得交付
`.trim();

const EXTERNAL_RESEARCH_HANDOFF = `
## External Research Handoff
- For viral_style tasks, prefer a structured external research MCP such as video-research-mcp over generic web search when that MCP is available in the client.
- Preferred external chain: search_reference_candidates -> rank_reference_candidates -> confirm_reference_set -> ingest_reference_assets -> extract_reference_signals -> aggregate_style_blueprint.
- Once researchTaskDir or editingBlueprintPath exists, prefer assemble_product_spot_closed_loop instead of manually stitching load/review/assemble/compare/critic steps.
- Do not treat generic web search, browser snapshots, or ad-hoc browsing as a substitute for EditingBlueprint generation.
`.trim();

export function getAgentGuideContent(): string {
  return [
    TASK_DECOMPOSITION_TEMPLATE,
    HARD_STOP_RULES,
    IDEMPOTENCY_RULES,
    STYLE_SAFETY_RULES,
    STILL_IMAGE_KEYFRAME_WORKAROUNDS,
    TOOL_AVAILABILITY,
    SCENARIO_PLAYBOOKS,
    EXTERNAL_RESEARCH_HANDOFF,
  ].join('\n\n');
}

function agentGuideResource(): Record<string, unknown> {
  return {
    server: {
      product: 'premiere-mcp',
      runtime: 'Premiere Pro + CEP',
    },
    recommendedStartup: [
      'Read this resource before issuing write operations.',
      'List or inspect the current project state before creating new sequences or clips.',
      'Prefer low-level tools when the requested edit is exact and already fully specified.',
    ],
    safeWorkflows: {
      sequence: [
        'Use list_sequences to inspect existing sequences before calling create_sequence.',
        'After create_sequence, confirm placement targets with list_sequence_tracks or get_sequence_settings before bulk edits.',
      ],
      transitions: [
        'Before add_transition, call inspect_transition_boundary for the exact clip pair.',
        'Before batch_add_transitions, call inspect_track_transition_boundaries and skip unsafe boundaries with gap or overlap issues.',
        'Prefer safe_batch_add_transitions when you want the server to inspect first, skip unsafe boundaries automatically, and return a structured applied/skipped/failures report.',
        'Treat sequence activation failures, QE sequence failures, and invalid clip pairs as hard stops rather than partial success.',
      ],
      keyframes: [
        'Use add_keyframe for exact key times and values.',
        'Use set_keyframe_interpolation to change interpolation without rewriting the value.',
        'Read back with get_keyframes after writing important motion or opacity automation.',
        'For still image motion, prefer the built-in Transform fallback path in high-level animation tools over assuming intrinsic Motion will stay stable.',
        'If a still image move remains unstable or must match the Premiere UI exactly, Nest the clip first and animate the Transform effect inside the nested shot.',
        'If a project contains many still images, prefer Render and Replace or pre-rendered short video clips before bulk keyframe automation.',
      ],
      highLevelAssembly: [
        'Prefer plan_edit_assembly or review_edit_reasonability before high-level assembly tools.',
        'Treat blocked assemblyReview findings as hard stops.',
        'For viral-style work with researchTaskDir or editingBlueprintPath, prefer assemble_product_spot_closed_loop.',
        'When the client also exposes video-research-mcp, prefer its structured research tools over generic web search before Premiere assembly.',
        'If subtitleSourcePath is available and the blueprint expects text overlays, pass it into assemble_product_spot_closed_loop so the workflow generates subtitles and caption tracks automatically.',
        'If bgmPath is available and the blueprint expects beat-driven cutting, pass it into assemble_product_spot_closed_loop so the workflow creates sequence beat markers and returns manual keyframe guidance for the accent moments.',
      ],
    },
    keyframeSupport: {
      supportedInterpolationModes: [
        'linear',
        'hold',
        'bezier',
        'time',
        'continuous_bezier',
      ],
      limitations: [
        'continuous_bezier currently falls back to host bezier mode because Premiere ExtendScript does not expose separate Bezier handle control.',
        'No publicly verified ExtendScript API is available for temporal ease influence, tangent handles, or graph-editor-only curve handles.',
        'still-image intrinsic Motion automation can remain less stable than video clips; high-level animation tools should prefer Transform fallback first, while low-level add_keyframe remains a literal component write.',
      ],
      recommendedTools: [
        'add_keyframe',
        'set_keyframe_interpolation',
        'get_keyframes',
        'apply_keyframe_animation',
      ],
    },
    transitionSupport: {
      recommendedTools: [
        'inspect_transition_boundary',
        'inspect_track_transition_boundaries',
        'safe_batch_add_transitions',
        'add_transition',
        'add_transition_to_clip',
        'batch_add_transitions',
      ],
      limitations: [
        'Transition insertion still depends on QE DOM behavior in the host Premiere build.',
        'Unsafe boundaries with gaps or overlaps should be inspected and skipped, not forced.',
      ],
    },
    agentCompatibility: {
      claudeCode: [
        'Use resources and prompts first, then call structured tools with exact JSON arguments.',
        'After each write, prefer an explicit read-back tool instead of assuming success from a message string.',
        'For `add_keyframe`, pass time in seconds relative to the clip start, not absolute sequence time.',
        'For slide or Motion.Position plans, prefer passing a real `clipId` to `apply_keyframe_animation` or `apply_animation_preset` so the server can resolve the clip sequence frame size before converting pixels.',
        'For still image motion work, verify whether a high-level animation write landed on Transform fallback instead of intrinsic Motion; low-level add_keyframe will keep the requested component unless you target Transform explicitly.',
      ],
      codex: [
        'Prefer the same structured low-level tools and keep write calls narrow and verifiable.',
        'When the request mentions Continuous Bezier, explicitly note the current bezier-mode fallback instead of claiming full curve-handle support.',
        'When a still image animation is stubborn, surface the manual Nest or Render and Replace fallback instead of repeating the same intrinsic Motion write.',
      ],
    },
    commonEntryPoints: {
      discovery: [
        'list_project_items',
        'list_sequences',
        'list_sequence_tracks',
      ],
      editing: [
        'create_sequence',
        'add_to_timeline',
        'trim_clip',
        'move_clip',
      ],
      keyframes: [
        'add_keyframe',
        'set_keyframe_interpolation',
        'get_keyframes',
      ],
      prompts: [
        'operate_premiere_mcp',
      ],
    },
    agentWorkflowV2: {
      guideText: getAgentGuideContent(),
      taskDecompositionTemplate: TASK_DECOMPOSITION_TEMPLATE,
      hardStopRules: HARD_STOP_RULES,
      idempotencyRules: IDEMPOTENCY_RULES,
      styleSafetyRules: STYLE_SAFETY_RULES,
      toolAvailability: TOOL_AVAILABILITY,
      scenarioPlaybooks: SCENARIO_PLAYBOOKS,
    },
  };
}

function createResourceCatalog(): ResourceDefinition[] {
  return [
    { uri: 'premiere://project/info', name: 'Current Project Information', description: 'Information about the currently open Premiere Pro project', mimeType: 'application/json', script: projectInfoScript },
    { uri: 'premiere://project/sequences', name: 'Project Sequences', description: 'List of all sequences in the current project', mimeType: 'application/json', script: projectSequencesScript },
    { uri: 'premiere://project/media', name: 'Project Media', description: 'List of all media items in the current project', mimeType: 'application/json', script: projectMediaScript },
    { uri: 'premiere://project/bins', name: 'Project Bins', description: 'Organizational structure of bins in the current project', mimeType: 'application/json', script: projectBinsScript },
    { uri: 'premiere://timeline/clips', name: 'Timeline Clips', description: 'All clips currently on the timeline', mimeType: 'application/json', script: timelineClipsScript },
    { uri: 'premiere://timeline/tracks', name: 'Timeline Tracks', description: 'Information about video and audio tracks', mimeType: 'application/json', script: timelineTracksScript },
    { uri: 'premiere://timeline/markers', name: 'Timeline Markers', description: 'Markers and their positions on the timeline', mimeType: 'application/json', script: timelineMarkersScript },
    { uri: 'premiere://effects/available', name: 'Available Effects', description: 'List of all available effects in Premiere Pro', mimeType: 'application/json', script: availableEffectsScript },
    { uri: 'premiere://effects/applied', name: 'Applied Effects', description: 'Effects currently applied to clips', mimeType: 'application/json', script: appliedEffectsScript },
    { uri: 'premiere://transitions/available', name: 'Available Transitions', description: 'List of all available transitions in Premiere Pro', mimeType: 'application/json', script: availableTransitionsScript },
    { uri: 'premiere://export/presets', name: 'Export Presets', description: 'Available export presets and their settings', mimeType: 'application/json', script: exportPresetsScript },
    { uri: 'premiere://project/metadata', name: 'Project Metadata', description: 'Metadata information for the current project', mimeType: 'application/json', script: projectMetadataScript },
    { uri: 'premiere://mcp/agent-guide', name: 'Premiere MCP Agent Guide', description: 'Static operating guide for agents using this Premiere MCP server safely and predictably', mimeType: 'application/json', read: agentGuideResource },
  ];
}

const RESOURCE_CATALOG = createResourceCatalog();
const RESOURCE_LOOKUP = new Map(RESOURCE_CATALOG.map((definition) => [definition.uri, definition]));

export class PremiereProResources {
  private readonly bridge: PremiereBridge;
  private readonly logger: Logger;

  constructor(bridge: PremiereBridge) {
    this.bridge = bridge;
    this.logger = new Logger('PremiereProResources');
  }

  getAvailableResources(): MCPResource[] {
    return RESOURCE_CATALOG.map(({ script: _script, ...resource }) => ({ ...resource }));
  }

  async readResource(uri: string): Promise<unknown> {
    this.logger.info(`Reading resource: ${uri}`);
    const definition = RESOURCE_LOOKUP.get(uri);
    if (!definition) {
      const available = RESOURCE_CATALOG.map((resource) => resource.uri).join(', ');
      throw new Error(`Resource '${uri}' not found. Available resources: ${available}`);
    }

    if (definition.read) {
      return await definition.read();
    }

    if (!definition.script) {
      throw new Error(`Resource '${uri}' is misconfigured`);
    }

    return this.bridge.executeScript(definition.script());
  }
}
