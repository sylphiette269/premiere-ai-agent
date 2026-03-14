/**
 * MCP Tools for Adobe Premiere Pro
 * 
 * This module provides tools that can be called by AI agents to perform
 * various video editing operations in Adobe Premiere Pro.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';
import {
  PremiereBridge,
  type PremiereSequenceCreateOptions,
  type PremiereSequenceSettings,
} from '../bridge/index.js';
import { Logger } from '../utils/logger.js';
import { createMotionDemoAssets } from '../utils/demoAssets.js';
import {
  planEditAssemblyFromFiles,
} from '../edit-assembly-plan.js';
import {
  reviewAssemblyExecution,
  reviewEditReasonabilityFromFiles,
} from '../edit-reasonability-review.js';
import type { MediaFolderManifest } from '../media-folder-manifest.js';
import {
  buildNLAssemblyPlan,
  parseNaturalLanguageRequest,
  type NLAssemblyPlan,
} from '../natural-language-planner.js';
import { analyzeAudioTrack } from '../audio-analysis.js';
import {
  buildBeatSyncPlan,
  type BeatSyncStrategy,
} from '../beat-sync-engine.js';
import {
  buildKeyframeAnimationPlan,
  parseKeyframeAnimationRequest,
  type KeyframeAnimationPlan,
  type KeyframeEasing,
  type KeyframeValue,
  type ParsedKeyframeAnimationIntent,
  type AnimationPresetName,
  COMPONENT_ALIASES,
  PARAM_ALIASES,
  ANIMATION_PRESET_NAMES,
  buildPresetPlan,
} from '../keyframe-animation-planner.js';
import {
  analyzeVideoReference,
  type VideoBlueprint,
} from '../video-reference-analyzer.js';
import { matchAssetsToBlueprint } from '../video-reference-matcher.js';
import { compareToBlueprint } from '../video-reference-qa.js';
import { getGeneratedVerificationArtifactImportError } from '../utils/generated-media-guards.js';
import { generateSubtitles } from '../subtitle-generator.js';
import { escapeForExtendScript } from '../utils/escape-for-extendscript.js';
import {
  PluginRegistry,
  pluginManifestSchema,
  resolvePluginRegistryDir,
  validatePluginEntryPath,
} from '../plugin-manager.js';
import { createHighLevelToolCatalogSnapshot } from './catalog/high-level.js';
import { createEffectsToolCatalogSnapshot } from './catalog/effects.js';
import { createProjectMediaToolCatalogSnapshot } from './catalog/project-media.js';
import { createSequenceToolCatalogSnapshot } from './catalog/sequence.js';
import { createTimelineToolCatalogSnapshot } from './catalog/timeline.js';
import { createPostProductionToolCatalogSnapshot } from './catalog/post-production.js';
import { createTimelineManagementToolCatalogSnapshot } from './catalog/timeline-management.js';
import { createBatchAssemblyToolCatalogSnapshot } from './catalog/batch-assembly.js';
import { createMediaAdminToolCatalogSnapshot } from './catalog/media-admin.js';
import {
  agentTaskInputSchema,
  analyzeReferencePatterns,
  analyzeReferencePatternsInputSchema,
  collectReferenceVideos,
  collectReferenceVideosInputSchema,
  createAgentOrchestrationCatalogSnapshot,
  executeAgentTask,
  executeBlueprintReview,
  extractEditingBlueprint,
  extractEditingBlueprintInputSchema,
  loadEditingBlueprint,
  loadEditingBlueprintInputSchema,
  reviewBlueprintReasonabilityInputSchema,
} from './catalog/agent-orchestration.js';
import type { EditingBlueprint } from './catalog/agent-orchestration.types.js';
import {
  compareResultToBlueprintInputSchema,
  compareResultToBlueprint,
  createCriticToolCatalogSnapshot,
  criticEditResultInputSchema,
  criticEditResult,
} from './catalog/critic-tools.js';
import type {
  CriticInput,
  TimelineSnapshot,
} from './catalog/critic-tools.types.js';
import { buildFcpXml, type FcpXmlClip } from './fcp-xml-builder.js';
import { generateExecutionReport } from '../agent/execution-report.js';
import { generateFailureReport } from '../agent/failure-report.js';
import {
  createExecutionState,
  getNextStep,
  handleStepResult,
} from '../agent/runtime.js';
import {
  createEditingExecutionGroup,
  createMediaAdminExecutionGroup,
  createPlanningExecutionGroup,
  type ToolExecutionFactoryContext,
  type ToolExecutionHandler,
} from './execution-groups.js';

const REFERENCE_ONLY_MEDIA_POLICY = 'reference-only' as const;
type SupportedMotionStyle = 'push_in' | 'pull_out' | 'alternate' | 'none';
const keyframeValueSchema = z.union([
  z.number(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number(), z.number()]),
]);

function serializeForExtendScriptValue(value: unknown): string {
  return escapeForExtendScript(JSON.stringify(value) ?? 'null');
}

const COMPONENT_ALIASES_LITERAL = serializeForExtendScriptValue(COMPONENT_ALIASES ?? {});
const PARAM_ALIASES_LITERAL = serializeForExtendScriptValue(PARAM_ALIASES ?? {});

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
}

type TimelineXmlClipArgs = {
  projectItemId: string;
  durationSec?: number;
  zoomFrom?: number;
  zoomTo?: number;
  centerFrom?: [number, number];
  centerTo?: [number, number];
  rotationFrom?: number;
  rotationTo?: number;
};

type ProjectItemMetadata = {
  resolution?: string;
  projectMetadata?: string;
};

type ProjectItemLookup = {
  id: string;
  name: string;
  type: string;
  mediaPath?: string;
  metadata?: ProjectItemMetadata;
};

type FrameSize = {
  width: number;
  height: number;
};

type PremiereKeyframeInterpolation =
  | 'linear'
  | 'bezier'
  | 'hold'
  | 'time'
  | 'continuous_bezier';

type PlannedKeyframeApplicationEntry = {
  componentName: string;
  paramName: string;
  time: number;
  value: KeyframeValue;
  easing?: KeyframeEasing;
  interpolation: PremiereKeyframeInterpolation | null;
};

type StaticImageTransformFallback = {
  attempted: boolean;
  active: boolean;
  componentName?: string;
  componentMatchName?: string;
  mediaPath?: string;
  warning?: string;
  alreadyPresent?: boolean;
};

type ClosedLoopAssemblyArgs = {
  goal: string;
  sequenceName: string;
  researchTaskDir?: string;
  editingBlueprintPath?: string;
  assetPaths?: string[];
  docxPath?: string;
  mediaManifestPath?: string;
  autoPlanFromManifest?: boolean;
  maxPlannedAssets?: number;
  applyGuideEffects?: boolean;
  reviewBeforeAssemble?: boolean;
  allowReviewWarnings?: boolean;
  mediaPolicy?: typeof REFERENCE_ONLY_MEDIA_POLICY;
  clipDuration?: number;
  videoTrackIndex?: number;
  transitionName?: string;
  transitionPolicy?: string;
  transitionDuration?: number;
  motionStyle?: SupportedMotionStyle;
  subtitleSourcePath?: string;
  subtitleLanguage?: string;
  subtitleBackend?: 'auto' | 'openai' | 'faster-whisper';
  captionFormat?: string;
  bgmPath?: string;
  beatMarkerPrefix?: string;
  beatsPerBar?: number;
  minimumBlueprintAdherenceScore?: number;
  maxAllowedBlueprintDeviations?: number;
};

type ClosedLoopSubtitleAutomation = {
  required: boolean;
  attempted: boolean;
  success: boolean;
  sourcePath?: string;
  reason?: string;
  result?: Record<string, any> | null;
};

type ClosedLoopBeatMarkerAutomation = {
  required: boolean;
  attempted: boolean;
  success: boolean;
  sourcePath?: string;
  strategy?: BeatSyncStrategy;
  markerCount: number;
  cutPoints: number[];
  warnings: string[];
  analysis?: {
    tempo?: number;
    beatCount: number;
  };
  failures?: Array<{ time: number; error: string }>;
};

type ClosedLoopManualKeyframeStep = {
  phase: 'hook' | 'transition' | 'beat' | 'cta';
  targetClipIndex: number;
  targetClipId?: string;
  targetProperty: string;
  recommendedEffect?: string;
  relativeWindow: string;
  keyframes: Array<{
    timeOffsetSec: number;
    value: number | [number, number] | [number, number, number, number];
    interpolation?: string;
  }>;
  instruction: string;
};

type ClosedLoopManualEffectItem = {
  phase: 'hook' | 'subtitle' | 'transition' | 'cta';
  targetClipIndex?: number;
  targetClipId?: string;
  effectName: string;
  instruction: string;
};

const STILL_IMAGE_EXTENSIONS: Record<string, true> = {
  ai: true,
  bmp: true,
  gif: true,
  heic: true,
  heif: true,
  jpeg: true,
  jpg: true,
  png: true,
  psd: true,
  tif: true,
  tiff: true,
  webp: true,
};

const TRANSFORM_EFFECT_NAME_CANDIDATES = ['Transform', '变换'] as const;
const MOTION_TRANSFORM_FALLBACK_PARAM_NAMES = new Set([
  'Anchor Point',
  'Position',
  'Rotation',
  'Scale',
]);

export class PremiereProTools {
  private bridge: PremiereBridge;
  private logger: Logger;

  constructor(bridge: PremiereBridge) {
    this.bridge = bridge;
    this.logger = new Logger('PremiereProTools');
  }

  private toExtendScriptString(value: string): string {
    return serializeForExtendScriptValue(value);
  }

  private static readonly TOOLS_ES_HELPERS = `
function __findSequence(id) {
  for (var i = 0; i < app.project.sequences.numSequences; i++) {
    if (app.project.sequences[i].sequenceID === id) return app.project.sequences[i];
  }
  return null;
}
function __openSequenceById(id) {
  if (!id) return app.project.activeSequence;
  var current = app.project.activeSequence;
  if (current && current.sequenceID === id) return current;
  if (typeof app.project.openSequence === "function") {
    try {
      app.project.openSequence(id);
    } catch (openSequenceError) {}
  }
  var sequence = __findSequence(id);
  if (
    sequence &&
    (!app.project.activeSequence || app.project.activeSequence.sequenceID !== id) &&
    typeof sequence.openInTimeline === "function"
  ) {
    try {
      sequence.openInTimeline();
    } catch (openInTimelineError) {}
  }
  if (app.project.activeSequence && app.project.activeSequence.sequenceID === id) {
    return app.project.activeSequence;
  }
  return sequence;
}
function __appendResultContext(target, context) {
  if (!context) return target;
  for (var key in context) {
    if (!context.hasOwnProperty(key)) continue;
    target[key] = context[key];
  }
  return target;
}
function __buildTransitionFailure(stage, error, context) {
  return JSON.stringify(__appendResultContext({
    success: false,
    stage: stage,
    error: error
  }, context));
}
function __ticksToSeconds(ticks) { return parseInt(String(ticks), 10) / 254016000000; }
function __secondsToTicks(seconds) { return String(Math.round(seconds * 254016000000)); }
function __getSequenceFramesPerSecond(sequence) {
  if (!sequence || !sequence.timebase) return null;
  var parsedTimebase = parseInt(sequence.timebase, 10);
  if (!isFinite(parsedTimebase) || parsedTimebase <= 0) return null;
  return 254016000000 / parsedTimebase;
}
function __getDurationFramesForSequence(sequence, durationSeconds) {
  var fps = __getSequenceFramesPerSecond(sequence);
  if (fps === null) return null;
  return Math.max(1, Math.round(Number(durationSeconds) * fps));
}
function __findClip(nodeId) {
  function searchSequence(sequence) {
    if (!sequence) return null;
    for (var vti = 0; vti < sequence.videoTracks.numTracks; vti++) {
      var vt = sequence.videoTracks[vti];
      for (var vci = 0; vci < vt.clips.numItems; vci++) {
        if (vt.clips[vci].nodeId === nodeId)
          return {
            clip: vt.clips[vci],
            track: vt,
            trackIndex: vti,
            clipIndex: vci,
            trackType: 'video',
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
          };
      }
    }
    for (var ati = 0; ati < sequence.audioTracks.numTracks; ati++) {
      var at = sequence.audioTracks[ati];
      for (var aci = 0; aci < at.clips.numItems; aci++) {
        if (at.clips[aci].nodeId === nodeId)
          return {
            clip: at.clips[aci],
            track: at,
            trackIndex: ati,
            clipIndex: aci,
            trackType: 'audio',
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
          };
      }
    }
    return null;
  }
  var activeSequence = app.project.activeSequence;
  var activeMatch = searchSequence(activeSequence);
  if (activeMatch) return activeMatch;
  for (var sequenceIndex = 0; sequenceIndex < app.project.sequences.numSequences; sequenceIndex++) {
    var sequence = app.project.sequences[sequenceIndex];
    if (!sequence || sequence === activeSequence) continue;
    var match = searchSequence(sequence);
    if (match) return match;
  }
  return null;
}
function __findProjectItem(nodeId) {
  function walk(item) {
    if (item.nodeId === nodeId) return item;
    if (item.children) {
      for (var i = 0; i < item.children.numItems; i++) {
        var hit = walk(item.children[i]);
        if (hit) return hit;
      }
    }
    return null;
  }
  return walk(app.project.rootItem);
}
function __findChildByName(parent, name) {
  if (!parent || !parent.children) return null;
  for (var i = 0; i < parent.children.numItems; i++) {
    var ch = parent.children[i];
    if (ch && ch.name === name) return ch;
  }
  return null;
}
function __findComponentParam(clip, componentName, paramName) {
  if (!clip) return null;
  var componentAliases = ${COMPONENT_ALIASES_LITERAL};
  var paramAliases = ${PARAM_ALIASES_LITERAL};
  var componentNames = componentAliases[componentName] || [componentName];
  var parameterNames = paramAliases[paramName] || [paramName];

  for (var componentIndex = 0; componentIndex < clip.components.numItems; componentIndex++) {
    var component = clip.components[componentIndex];
    var componentMatch = false;

    for (var aliasIndex = 0; aliasIndex < componentNames.length; aliasIndex++) {
      if (component.displayName === componentNames[aliasIndex]) {
        componentMatch = true;
        break;
      }
    }

    if (!componentMatch) continue;

    for (var propertyIndex = 0; propertyIndex < component.properties.numItems; propertyIndex++) {
      var property = component.properties[propertyIndex];
      for (var propertyAliasIndex = 0; propertyAliasIndex < parameterNames.length; propertyAliasIndex++) {
        if (property.displayName === parameterNames[propertyAliasIndex]) {
          return property;
        }
      }
    }
  }

  return null;
}
function __describeRequestedKeyframeInterpolation(name) {
  if (!name) return null;
  var normalized = String(name).toLowerCase();
  if (normalized === 'linear') return 'linear';
  if (normalized === 'hold') return 'hold';
  if (normalized === 'bezier') return 'bezier';
  if (normalized === 'time') return 'time';
  if (normalized === 'continuous_bezier') return 'continuous_bezier';
  return null;
}
function __resolveKeyframeInterpolationMode(name) {
  if (!name) return null;
  var normalized = String(name).toLowerCase();
  if (normalized === 'linear') return 0;
  if (normalized === 'hold') return 4;
  if (normalized === 'bezier') return 5;
  if (normalized === 'continuous_bezier') return 5;
  if (normalized === 'time') return 6;
  return null;
}
function __resolveHostKeyframeInterpolationName(name) {
  var normalized = __describeRequestedKeyframeInterpolation(name);
  if (!normalized) return null;
  if (normalized === 'continuous_bezier') return 'bezier';
  return normalized;
}
function __buildKeyframeInterpolationWarning(name) {
  var normalized = __describeRequestedKeyframeInterpolation(name);
  if (normalized === 'continuous_bezier') {
    return 'Premiere ExtendScript does not expose a separate Continuous Bezier handle API; requested continuous_bezier was applied as host bezier mode only.';
  }
  return null;
}
function __mergeWarnings(primary, secondary) {
  if (primary && secondary) return primary + ' ' + secondary;
  return primary || secondary || null;
}
function __keyExistsAtTicks(param, keyTimeTicks) {
  if (!param) return false;
  var targetTicks = String(keyTimeTicks);
  if (typeof param.getKeys === 'function') {
    try {
      var keys = param.getKeys();
      if (keys && keys.length !== undefined) {
        for (var keyIndex = 0; keyIndex < keys.length; keyIndex++) {
          var keyTicks = __readKeyTicksValue(keys[keyIndex]);
          if (String(keyTicks) === targetTicks) return true;
        }
      }
    } catch (getKeysError) {}
  }
  if (typeof param.findNearestKey === 'function') {
    try {
      var nearestKey = param.findNearestKey(keyTimeTicks, 0);
      var nearestKeyTicks = __readKeyTicksValue(nearestKey);
      if (nearestKeyTicks !== null && nearestKeyTicks !== undefined && String(nearestKeyTicks) === targetTicks) return true;
    } catch (findNearestKeyError) {}
  }
  return false;
}
function __readKeyTicksValue(keyRef) {
  if (keyRef && typeof keyRef === 'object' && keyRef.ticks !== undefined) {
    return keyRef.ticks;
  }
  return keyRef;
}
function __readKeySecondsValue(keyRef) {
  if (keyRef && typeof keyRef === 'object' && keyRef.seconds !== undefined) {
    return Number(keyRef.seconds);
  }
  return __ticksToSeconds(__readKeyTicksValue(keyRef));
}
function __readTimeTicksValue(timeValue) {
  if (timeValue === null || timeValue === undefined) return null;
  if (typeof timeValue === 'object') {
    if (timeValue.ticks !== undefined) {
      var objectTicks = parseInt(String(timeValue.ticks), 10);
      return isNaN(objectTicks) ? null : objectTicks;
    }
    if (timeValue.seconds !== undefined) {
      return parseInt(__secondsToTicks(Number(timeValue.seconds)), 10);
    }
  }
  var directTicks = parseInt(String(timeValue), 10);
  return isNaN(directTicks) ? null : directTicks;
}
function __resolveClipDurationTicks(clip) {
  if (!clip) return null;
  var startTicks = __readTimeTicksValue(clip.start);
  var endTicks = __readTimeTicksValue(clip.end);
  if (startTicks === null || endTicks === null) return null;
  return Math.max(0, endTicks - startTicks);
}
function __valuesRoughlyMatch(expected, actual) {
  if (expected instanceof Array || actual instanceof Array) {
    if (!(expected instanceof Array) || !(actual instanceof Array) || expected.length !== actual.length) {
      return false;
    }
    for (var valueIndex = 0; valueIndex < expected.length; valueIndex++) {
      var expectedNumber = Number(expected[valueIndex]);
      var actualNumber = Number(actual[valueIndex]);
      if (isFinite(expectedNumber) && isFinite(actualNumber)) {
        if (Math.abs(actualNumber - expectedNumber) > 0.01) return false;
      } else if (String(actual[valueIndex]) !== String(expected[valueIndex])) {
        return false;
      }
    }
    return true;
  }
  var expectedScalar = Number(expected);
  var actualScalar = Number(actual);
  if (isFinite(expectedScalar) && isFinite(actualScalar)) {
    return Math.abs(actualScalar - expectedScalar) <= 0.01;
  }
  return String(actual) === String(expected);
}
function __describeKeyframeInterpolationMode(mode) {
  if (mode === 0) return 'linear';
  if (mode === 4) return 'hold';
  if (mode === 5) return 'bezier';
  if (mode === 6) return 'time';
  if (mode === 7) return 'time_transition_start';
  if (mode === 8) return 'time_transition_end';
  return null;
}
function __isFiniteVector2(value) {
  return value instanceof Array
    && value.length === 2
    && isFinite(Number(value[0]))
    && isFinite(Number(value[1]));
}
function __roundHostNumericValue(value) {
  var numericValue = Number(value);
  if (!isFinite(numericValue)) return value;
  return Math.round(numericValue * 1000000) / 1000000;
}
function __resolveSequenceFrameSize(sequence) {
  var resolvedSequence = sequence;
  if (!resolvedSequence && app && app.project && app.project.activeSequence) {
    resolvedSequence = app.project.activeSequence;
  }
  if (!resolvedSequence) return null;
  var width = Number(resolvedSequence.frameSizeHorizontal);
  var height = Number(resolvedSequence.frameSizeVertical);
  if (!isFinite(width) || width <= 0 || !isFinite(height) || height <= 0) {
    return null;
  }
  return {
    width: width,
    height: height
  };
}
function __isIntrinsicMotionSpatialProperty(componentName, paramName) {
  var compAliases = ${COMPONENT_ALIASES_LITERAL};
  var paramAliases = ${PARAM_ALIASES_LITERAL};
  var componentNames = compAliases.Motion || ['Motion'];
  var paramNames = (paramAliases.Position || ['Position']).concat(paramAliases['Anchor Point'] || ['Anchor Point']);
  var componentMatch = false;
  var paramMatch = false;
  for (var componentIndex = 0; componentIndex < componentNames.length; componentIndex++) {
    if (componentName === componentNames[componentIndex]) {
      componentMatch = true;
      break;
    }
  }
  if (!componentMatch) return false;
  for (var paramIndex = 0; paramIndex < paramNames.length; paramIndex++) {
    if (paramName === paramNames[paramIndex]) {
      paramMatch = true;
      break;
    }
  }
  return paramMatch;
}
function __vectorLooksNormalized(value) {
  return __isFiniteVector2(value)
    && Math.abs(Number(value[0])) <= 4
    && Math.abs(Number(value[1])) <= 4;
}
function __prepareKeyframeValueForHost(sequence, componentName, paramName, value) {
  var result = {
    requestedValue: value,
    hostValue: value,
    inputValueSpace: value instanceof Array ? 'vector' : 'scalar',
    valueTransformApplied: false,
    warning: null
  };
  if (!__isIntrinsicMotionSpatialProperty(componentName, paramName) || !__isFiniteVector2(value)) {
    return result;
  }
  var frameSize = __resolveSequenceFrameSize(sequence);
  if (!frameSize) {
    result.warning = 'Unable to resolve the active sequence frame size for Motion spatial value conversion.';
    return result;
  }
  if (__vectorLooksNormalized(value)) {
    result.inputValueSpace = 'normalized';
    return result;
  }
  result.hostValue = [
    __roundHostNumericValue(Number(value[0]) / frameSize.width),
    __roundHostNumericValue(Number(value[1]) / frameSize.height)
  ];
  result.inputValueSpace = 'pixels';
  result.valueTransformApplied = true;
  result.warning = 'Motion.Position and Motion.Anchor Point use normalized host coordinates; pixel input was converted using the active sequence frame size.';
  return result;
}
function __convertKeyframeValueForUserOutput(sequence, componentName, paramName, value) {
  var result = {
    hostValue: value,
    displayValue: value,
    valueSpace: value instanceof Array ? 'vector' : 'scalar',
    valueTransformApplied: false,
    warning: null
  };
  if (!__isIntrinsicMotionSpatialProperty(componentName, paramName) || !__isFiniteVector2(value)) {
    return result;
  }
  var frameSize = __resolveSequenceFrameSize(sequence);
  if (!frameSize) {
    result.warning = 'Unable to resolve the active sequence frame size for Motion spatial display conversion.';
    return result;
  }
  if (__vectorLooksNormalized(value)) {
    result.displayValue = [
      __roundHostNumericValue(Number(value[0]) * frameSize.width),
      __roundHostNumericValue(Number(value[1]) * frameSize.height)
    ];
    result.valueSpace = 'pixels';
    result.valueTransformApplied = true;
    return result;
  }
  result.valueSpace = 'pixels';
  return result;
}
`;

  private async runScript(script: string): Promise<unknown> {
    return this.bridge.executeScript(PremiereProTools.TOOLS_ES_HELPERS + script);
  }

  private sanitizeArgs(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeArgs(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
          key,
          /(?:api[-_]?key|token|secret|password|authorization)/i.test(key)
            ? '[REDACTED]'
            : this.sanitizeArgs(entryValue),
        ]),
      );
    }

    return value;
  }

  private coerceBooleanFlag(value: unknown, defaultValue: boolean): 0 | 1 {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'number') {
      return value === 0 ? 0 : 1;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
        return 1;
      }
      if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off' || normalized === '') {
        return 0;
      }
    }
    return defaultValue ? 1 : 0;
  }

  private async resolveProjectItemsById(projectItemIds: string[]): Promise<Map<string, ProjectItemLookup>> {
    const uniqueIds = [...new Set(projectItemIds.filter(Boolean))];
    const listResult = await this.listProjectItems(false, true) as {
      success?: boolean;
      error?: string;
      items?: ProjectItemLookup[];
    };

    if (!listResult?.success) {
      throw new Error(
        `Failed to resolve project items: ${listResult?.error ?? 'list_project_items_failed'}`,
      );
    }

    const lookup = new Map<string, ProjectItemLookup>();
    for (const item of listResult.items ?? []) {
      if (item?.id && uniqueIds.includes(item.id)) {
        lookup.set(item.id, item);
      }
    }

    const missingIds = uniqueIds.filter((id) => !lookup.has(id));
    if (missingIds.length > 0) {
      throw new Error(`Project items not found: ${missingIds.join(', ')}`);
    }

    return lookup;
  }

  private roundScalePercent(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private resolveInterpolationForEasing(
    easing: KeyframeEasing | undefined,
  ): PremiereKeyframeInterpolation | undefined {
    if (!easing) {
      return undefined;
    }

    if (easing === 'linear') {
      return 'linear';
    }

    return 'bezier';
  }

  private buildPlannedKeyframeApplicationEntry(
    componentName: string,
    paramName: string,
    keyframe: {
      time: number;
      value: KeyframeValue;
      easing?: KeyframeEasing;
    },
    interpolation: PremiereKeyframeInterpolation | undefined,
  ): PlannedKeyframeApplicationEntry {
    return {
      componentName,
      paramName,
      time: keyframe.time,
      value: keyframe.value,
      easing: keyframe.easing,
      interpolation: interpolation ?? null,
    };
  }

  private buildAppliedKeyframeApplicationEntry(
    entry: PlannedKeyframeApplicationEntry,
    result: Record<string, any> | null | undefined,
  ): Record<string, any> {
    return {
      ...entry,
      valueTransformWarning: result?.valueTransformWarning ?? null,
      toolResult: result ?? null,
    };
  }

  private buildFailedKeyframeApplicationEntry(
    entry: PlannedKeyframeApplicationEntry,
    result: Record<string, any> | null | undefined,
  ): Record<string, any> {
    return {
      ...entry,
      error: typeof result?.error === 'string' ? result.error : undefined,
      message: typeof result?.message === 'string' ? result.message : undefined,
      valueTransformWarning: result?.valueTransformWarning ?? null,
      toolResult: result ?? null,
    };
  }

  private finalizeKeyframeApplicationBatch(
    baseResult: Record<string, any>,
    appliedKeyframes: Array<Record<string, any>>,
    failedKeyframes: Array<Record<string, any>>,
  ): Record<string, any> {
    const expectedKeyframeCount = appliedKeyframes.length + failedKeyframes.length;
    const appliedKeyframeCount = appliedKeyframes.length;
    const missingKeyframes = failedKeyframes.map((entry) => {
      const {
        error: _error,
        message: _message,
        valueTransformWarning: _valueTransformWarning,
        toolResult: _toolResult,
        ...missing
      } = entry;
      return missing;
    });

    if (failedKeyframes.length === 0) {
      return {
        ...baseResult,
        success: true,
        expectedKeyframeCount,
        appliedKeyframeCount,
        appliedKeyframes,
        failedKeyframes: [],
        missingKeyframes: [],
      };
    }

    const firstFailure = failedKeyframes[0];
    const failureReason = firstFailure.error ?? firstFailure.message;
    const failureLabel = `${firstFailure.componentName}.${firstFailure.paramName} @ ${firstFailure.time}s`;

    return {
      ...baseResult,
      success: false,
      blocked: true,
      error: failureReason
        ? `${failureLabel}: ${failureReason}`
        : `Failed to apply ${failedKeyframes.length} of ${expectedKeyframeCount} planned keyframes.`,
      expectedKeyframeCount,
      appliedKeyframeCount,
      appliedKeyframes,
      failedKeyframes,
      missingKeyframes,
    };
  }

  private propertyPlanNeedsStaticImageTransformFallback(
    componentName: string,
    paramName: string,
  ): boolean {
    return componentName === 'Motion' && MOTION_TRANSFORM_FALLBACK_PARAM_NAMES.has(paramName);
  }

  private resolveFallbackComponentName(
    componentName: string,
    paramName: string,
    fallback: StaticImageTransformFallback,
  ): string {
    if (
      fallback.active
      && fallback.componentName
      && this.propertyPlanNeedsStaticImageTransformFallback(componentName, paramName)
    ) {
      return fallback.componentName;
    }

    return componentName;
  }

  private async inspectClipMediaProfile(clipId: string): Promise<{
    success: boolean;
    isStillImage?: boolean;
    mediaPath?: string;
    extension?: string;
    trackType?: string;
    sequenceId?: string;
    detectedBy?: string | null;
    error?: string;
  }> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const stillImageExtensionsLiteral = JSON.stringify(STILL_IMAGE_EXTENSIONS);
    return await this.runScript(`
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) {
          return JSON.stringify({
            success: false,
            error: "Clip not found"
          });
        }
        var clip = info.clip;
        var projectItem = clip.projectItem || null;
        var mediaPath = "";
        if (projectItem && typeof projectItem.getMediaPath === "function") {
          try {
            mediaPath = String(projectItem.getMediaPath() || "");
          } catch (_mediaPathError) {}
        }
        var sourceName = mediaPath
          || (projectItem && projectItem.name ? String(projectItem.name) : "")
          || (clip && clip.name ? String(clip.name) : "");
        var extension = "";
        var match = /\\.([^.\\\\/]+)$/.exec(sourceName);
        if (match && match[1]) {
          extension = String(match[1]).toLowerCase();
        }
        var isStillImage = false;
        var detectedBy = null;
        if (projectItem && typeof projectItem.isStill === "function") {
          try {
            isStillImage = !!projectItem.isStill();
            if (isStillImage) {
              detectedBy = "projectItem.isStill";
            }
          } catch (_isStillError) {}
        }
        if (!isStillImage && extension) {
          var stillImageExtensions = ${stillImageExtensionsLiteral};
          if (stillImageExtensions[extension]) {
            isStillImage = true;
            detectedBy = "extension";
          }
        }
        return JSON.stringify({
          success: true,
          clipId: ${clipIdLiteral},
          sequenceId: info.sequenceId || null,
          trackType: info.trackType || null,
          mediaPath: mediaPath || null,
          extension: extension || null,
          isStillImage: isStillImage,
          detectedBy: detectedBy
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `) as any;
  }

  private async ensureTransformEffectComponent(clipId: string): Promise<{
    success: boolean;
    componentDisplayName?: string;
    componentMatchName?: string;
    alreadyPresent?: boolean;
    error?: string;
  }> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const effectNameCandidatesLiteral = JSON.stringify([...TRANSFORM_EFFECT_NAME_CANDIDATES]);
    return await this.runScript(`
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) {
          return JSON.stringify({
            success: false,
            error: "Clip not found"
          });
        }
        if (info.trackType !== "video") {
          return JSON.stringify({
            success: false,
            error: "Transform effect fallback only applies to video clips"
          });
        }
        var clip = info.clip;
        function normalizeName(value) {
          return String(value || "")
            .toLowerCase()
            .replace(/[\\s_\\-]+/g, " ")
            .trim();
        }
        function componentLooksLikeTransform(component) {
          if (!component) return false;
          var displayName = normalizeName(component.displayName);
          var matchName = normalizeName(component.matchName);
          if (matchName.indexOf("transform") !== -1) return true;
          var candidates = ${effectNameCandidatesLiteral};
          for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
            var candidate = normalizeName(candidates[candidateIndex]);
            if (!candidate) continue;
            if (
              displayName === candidate
              || displayName.indexOf(candidate) !== -1
              || candidate.indexOf(displayName) !== -1
            ) {
              return true;
            }
          }
          return false;
        }
        function findTransformComponent(componentCollection) {
          if (!componentCollection) return null;
          for (var componentIndex = componentCollection.numItems - 1; componentIndex >= 0; componentIndex--) {
            var component = componentCollection[componentIndex];
            if (componentLooksLikeTransform(component)) {
              return component;
            }
          }
          return null;
        }
        var existingComponent = findTransformComponent(clip.components);
        if (existingComponent) {
          return JSON.stringify({
            success: true,
            componentDisplayName: existingComponent.displayName || "Transform",
            componentMatchName: existingComponent.matchName || null,
            alreadyPresent: true
          });
        }

        var targetSequence = __openSequenceById(info.sequenceId);
        if (!targetSequence || !app.project.activeSequence || app.project.activeSequence.sequenceID !== info.sequenceId) {
          return JSON.stringify({
            success: false,
            error: "Target sequence could not be activated for Transform effect fallback"
          });
        }
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
          return JSON.stringify({
            success: false,
            error: "QE active sequence unavailable for Transform effect fallback"
          });
        }
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        if (!qeTrack) {
          return JSON.stringify({
            success: false,
            error: "QE track unavailable for Transform effect fallback"
          });
        }
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        if (!qeClip) {
          return JSON.stringify({
            success: false,
            error: "QE clip unavailable for Transform effect fallback"
          });
        }

        var effect = null;
        var candidates = ${effectNameCandidatesLiteral};
        for (var effectIndex = 0; effectIndex < candidates.length; effectIndex++) {
          try {
            effect = qe.project.getVideoEffectByName(candidates[effectIndex]);
          } catch (_effectLookupError) {
            effect = null;
          }
          if (effect) break;
        }
        if (!effect) {
          return JSON.stringify({
            success: false,
            error: "Transform effect not found in this Premiere host"
          });
        }

        qeClip.addVideoEffect(effect);
        var appliedComponent = findTransformComponent(clip.components);
        if (!appliedComponent) {
          return JSON.stringify({
            success: false,
            error: "Transform effect component not found after insertion"
          });
        }

        return JSON.stringify({
          success: true,
          componentDisplayName: appliedComponent.displayName || "Transform",
          componentMatchName: appliedComponent.matchName || null,
          alreadyPresent: false
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `) as any;
  }

  private async resolveStaticImageTransformFallback(
    clipId: string,
    propertyPlans: Array<{
      componentName: string;
      paramName: string;
    }>,
  ): Promise<StaticImageTransformFallback> {
    const needsFallback = propertyPlans.some((plan) =>
      this.propertyPlanNeedsStaticImageTransformFallback(plan.componentName, plan.paramName),
    );
    if (!needsFallback) {
      return {
        attempted: false,
        active: false,
      };
    }

    const mediaProfile = await this.inspectClipMediaProfile(clipId);
    if (!mediaProfile?.success) {
      return {
        attempted: true,
        active: false,
        warning: typeof mediaProfile?.error === 'string'
          ? mediaProfile.error
          : 'Failed to inspect clip media profile for Transform fallback.',
      };
    }

    if (mediaProfile.trackType !== 'video') {
      return {
        attempted: true,
        active: false,
        mediaPath: mediaProfile.mediaPath,
      };
    }

    if (!mediaProfile.isStillImage) {
      return {
        attempted: true,
        active: false,
        mediaPath: mediaProfile.mediaPath,
      };
    }

    const ensured = await this.ensureTransformEffectComponent(clipId);
    if (!ensured?.success || !ensured.componentDisplayName) {
      return {
        attempted: true,
        active: false,
        mediaPath: mediaProfile.mediaPath,
        warning: typeof ensured?.error === 'string'
          ? ensured.error
          : 'Failed to ensure Transform effect for still-image motion fallback.',
      };
    }

    return {
      attempted: true,
      active: true,
      componentName: ensured.componentDisplayName,
      componentMatchName: ensured.componentMatchName,
      mediaPath: mediaProfile.mediaPath,
      alreadyPresent: ensured.alreadyPresent === true,
    };
  }

  private parseFrameSizeText(value: string | undefined): FrameSize | null {
    if (!value) {
      return null;
    }

    const match = /(\d{2,5})\s*[x×]\s*(\d{2,5})/i.exec(value.replaceAll(',', ''));
    if (!match) {
      return null;
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
    }

    return { width, height };
  }

  private resolveProjectItemFrameSize(projectItem: ProjectItemLookup): FrameSize | null {
    return this.parseFrameSizeText(projectItem.metadata?.resolution)
      ?? this.parseFrameSizeText(projectItem.metadata?.projectMetadata);
  }

  private async resolveTimelineXmlFrameSize(
    frameWidth?: number,
    frameHeight?: number,
  ): Promise<FrameSize> {
    if (frameWidth !== undefined || frameHeight !== undefined) {
      if (frameWidth === undefined || frameHeight === undefined) {
        throw new Error('frameWidth and frameHeight must be provided together');
      }

      return {
        width: Math.max(1, Math.round(frameWidth)),
        height: Math.max(1, Math.round(frameHeight)),
      };
    }

    const settingsResult = await this.getSequenceSettings('') as {
      success?: boolean;
      settings?: { width?: number; height?: number };
    };
    const width = Number(settingsResult?.settings?.width);
    const height = Number(settingsResult?.settings?.height);
    if (
      settingsResult?.success &&
      Number.isFinite(width) &&
      width > 0 &&
      Number.isFinite(height) &&
      height > 0
    ) {
      return {
        width: Math.round(width),
        height: Math.round(height),
      };
    }

    return {
      width: 1920,
      height: 1080,
    };
  }

  private computeFitScalePercent(source: FrameSize, target: FrameSize): number {
    return this.roundScalePercent(
      Math.min(target.width / source.width, target.height / source.height) * 100,
    );
  }

  private normalizeTimelineXmlClipMotion(
    clip: TimelineXmlClipArgs,
    baseScalePercent?: number,
  ): Pick<
    FcpXmlClip,
    | 'scalePercent'
    | 'zoomFrom'
    | 'zoomTo'
    | 'centerFrom'
    | 'centerTo'
    | 'rotationFrom'
    | 'rotationTo'
  > {
    const normalizedBaseScale = this.roundScalePercent(baseScalePercent ?? 100);
    const passthroughMotion = {
      centerFrom: clip.centerFrom,
      centerTo: clip.centerTo,
      rotationFrom: clip.rotationFrom,
      rotationTo: clip.rotationTo,
    };
    if (clip.zoomFrom === undefined && clip.zoomTo === undefined) {
      return normalizedBaseScale === 100
        ? passthroughMotion
        : {
            scalePercent: normalizedBaseScale,
            ...passthroughMotion,
          };
    }
    const relativeStart = clip.zoomFrom ?? 100;
    const relativeEnd = clip.zoomTo ?? (relativeStart > 100 ? 100 : 115);

    if (clip.zoomFrom === undefined) {
      return {
        zoomFrom: normalizedBaseScale,
        zoomTo: this.roundScalePercent(normalizedBaseScale * (relativeEnd / 100)),
        ...passthroughMotion,
      };
    }
    if (clip.zoomTo === undefined) {
      return {
        zoomFrom: this.roundScalePercent(normalizedBaseScale * (relativeStart / 100)),
        zoomTo: this.roundScalePercent(normalizedBaseScale * (relativeEnd / 100)),
        ...passthroughMotion,
      };
    }
    return {
      zoomFrom: this.roundScalePercent(normalizedBaseScale * (clip.zoomFrom / 100)),
      zoomTo: this.roundScalePercent(normalizedBaseScale * (clip.zoomTo / 100)),
      ...passthroughMotion,
    };
  }

  private resolveAssemblyXmlMotion(
    motionStyle: SupportedMotionStyle,
    clipIndex: number,
  ): Pick<TimelineXmlClipArgs, 'zoomFrom' | 'zoomTo'> {
    if (motionStyle === 'push_in') {
      return { zoomFrom: 100, zoomTo: 108 };
    }
    if (motionStyle === 'pull_out') {
      return { zoomFrom: 108, zoomTo: 100 };
    }
    if (motionStyle === 'alternate') {
      const invert = clipIndex % 2 === 1;
      return {
        zoomFrom: invert ? 110 : 100,
        zoomTo: invert ? 100 : 108,
      };
    }
    return {};
  }

  private shouldAssembleProductSpotViaXml(options: {
    transitionName: string | null;
    motionStyle: SupportedMotionStyle;
    videoTrackIndex: number;
  }): boolean {
    if (options.videoTrackIndex !== 0) {
      return false;
    }
    if (options.transitionName !== null && options.transitionName !== 'Cross Dissolve') {
      return false;
    }

    return options.transitionName === 'Cross Dissolve' || options.motionStyle !== 'none';
  }

  private extractTrackPlacements(
    tracks:
      | {
          success?: boolean;
          videoTracks?: Array<{
            index?: number;
            clips?: Array<Record<string, unknown>>;
          }>;
        }
      | null
      | undefined,
    videoTrackIndex: number,
  ): Array<Record<string, unknown>> {
    if (!tracks || tracks.success === false) {
      return [];
    }

    const videoTracks = Array.isArray(tracks.videoTracks) ? tracks.videoTracks : [];
    const targetTrack =
      videoTracks.find((track) => track.index === videoTrackIndex) ??
      videoTracks[videoTrackIndex] ??
      null;

    return Array.isArray(targetTrack?.clips) ? targetTrack.clips : [];
  }

  private async captureTimelineSnapshot(sequenceId: string): Promise<TimelineSnapshot> {
    const tracks = await this.listSequenceTracks(sequenceId) as {
      success?: boolean;
      videoTracks?: Array<{
        clips?: Array<{
          id: string;
          duration: number;
          trackIndex: number;
          startTime: number;
          endTime: number;
        }>;
      }>;
      audioTracks?: Array<{
        clips?: Array<{
          id: string;
          duration: number;
          trackIndex: number;
          startTime: number;
          endTime: number;
        }>;
      }>;
    };

    if (!tracks?.success) {
      throw new Error(`Failed to capture timeline snapshot for sequence ${sequenceId}`);
    }

    const videoClips = (tracks.videoTracks ?? []).flatMap((track) => track.clips ?? []);
    const audioClips = (tracks.audioTracks ?? []).flatMap((track) => track.clips ?? []);
    const totalDuration = [...videoClips, ...audioClips].reduce((max, clip) => {
      return Math.max(max, Number(clip.endTime) || 0);
    }, 0);

    return {
      totalDuration,
      videoClips,
      audioClips,
      transitions: [],
      effects: [],
      textLayers: [],
    };
  }

  private blueprintNeedsSubtitles(blueprint: EditingBlueprint): boolean {
    const style = blueprint.textOverlayStyle.trim().toLowerCase();
    if (!style || style === 'unknown' || style === 'none' || style === 'minimal') {
      return false;
    }
    return /(caption|subtitle|text|kinetic|bold|lower-third|lower third|字|字幕|标题)/.test(style);
  }

  private blueprintNeedsBeatMarkers(blueprint: EditingBlueprint): boolean {
    const strategy = blueprint.musicBeatStrategy.trim().toLowerCase();
    if (!strategy) {
      return false;
    }
    return /(beat|sync|rhythm|accent|卡点|节拍)/.test(strategy);
  }

  private mapBlueprintBeatStrategy(strategy: string): BeatSyncStrategy {
    const normalized = strategy.trim().toLowerCase();
    if (/(accent|section|support|gentle|soft|strong)/.test(normalized)) {
      return 'strong_beat';
    }
    if (/(progress|build|crescendo)/.test(normalized)) {
      return 'progressive';
    }
    return 'every_beat';
  }

  private inferPlacementWindow(
    placement: Record<string, any> | undefined,
    index: number,
    defaultDuration: number,
  ): {
    clipId?: string;
    startTime: number;
    endTime: number;
  } {
    const clipId =
      typeof placement?.id === 'string'
        ? placement.id
        : typeof placement?.clipId === 'string'
          ? placement.clipId
          : undefined;
    const inferredStart =
      typeof placement?.startTime === 'number' && Number.isFinite(placement.startTime)
        ? placement.startTime
        : typeof placement?.time === 'number' && Number.isFinite(placement.time)
          ? placement.time
          : index * defaultDuration;
    const inferredEnd =
      typeof placement?.endTime === 'number' && Number.isFinite(placement.endTime)
        ? placement.endTime
        : typeof placement?.outPoint === 'number' &&
            Number.isFinite(placement.outPoint) &&
            placement.outPoint > inferredStart
          ? placement.outPoint
          : inferredStart + defaultDuration;
    return {
      clipId,
      startTime: inferredStart,
      endTime: inferredEnd,
    };
  }

  private mergeClosedLoopTimelineSnapshot(args: {
    base: TimelineSnapshot;
    assemblyResult?: any;
    subtitleAutomation?: ClosedLoopSubtitleAutomation;
  }): TimelineSnapshot {
    const transitions = Array.isArray(args.assemblyResult?.transitions)
      ? args.assemblyResult.transitions.map((transition: Record<string, any>, index: number) => {
          const placements = Array.isArray(args.assemblyResult?.placements)
            ? args.assemblyResult.placements
            : [];
          const nextPlacement = placements[index + 1];
          const nextWindow = this.inferPlacementWindow(
            nextPlacement,
            index + 1,
            typeof args.assemblyResult?.clipDuration === 'number'
              ? args.assemblyResult.clipDuration
              : 4,
          );
          return {
            type:
              typeof transition?.transitionName === 'string'
                ? transition.transitionName
                : typeof args.assemblyResult?.transitionName === 'string'
                  ? args.assemblyResult.transitionName
                  : 'cut',
            duration:
              typeof transition?.duration === 'number' && Number.isFinite(transition.duration)
                ? transition.duration
                : typeof args.assemblyResult?.transitionDuration === 'number' &&
                    Number.isFinite(args.assemblyResult.transitionDuration)
                  ? args.assemblyResult.transitionDuration
                  : 0,
            position: nextWindow.startTime,
          };
        })
      : [];

    const effects = Array.isArray(args.assemblyResult?.effects)
      ? args.assemblyResult.effects
          .filter((effect: Record<string, any>) => effect && typeof effect === 'object')
          .map((effect: Record<string, any>) => ({
            name:
              typeof effect.effectName === 'string'
                ? effect.effectName
                : typeof effect.name === 'string'
                  ? effect.name
                  : 'Unknown Effect',
            clipId:
              typeof effect.clipId === 'string'
                ? effect.clipId
                : typeof effect.id === 'string'
                  ? effect.id
                  : '',
          }))
      : [];

    const textLayers =
      args.subtitleAutomation?.success && args.subtitleAutomation.result?.entryCount > 0
        ? [
            {
              text: 'AUTO_SUBTITLES',
              startTime: 0,
              duration: args.base.totalDuration,
            },
          ]
        : [];

    return {
      ...args.base,
      transitions,
      effects,
      textLayers,
    };
  }

  private buildManualKeyframePlan(args: {
    blueprint: EditingBlueprint;
    assemblyResult?: any;
    beatMarkers?: ClosedLoopBeatMarkerAutomation;
    clipDuration: number;
  }): ClosedLoopManualKeyframeStep[] {
    const placements = Array.isArray(args.assemblyResult?.placements)
      ? args.assemblyResult.placements
      : [];
    const plan: ClosedLoopManualKeyframeStep[] = [];
    const firstWindow = this.inferPlacementWindow(placements[0], 0, args.clipDuration);
    if (placements.length > 0) {
      plan.push({
        phase: 'hook',
        targetClipIndex: 1,
        targetClipId: firstWindow.clipId,
        targetProperty: 'Motion.Scale',
        recommendedEffect: 'Transform',
        relativeWindow: '片头前 0.45 秒',
        keyframes: [
          { timeOffsetSec: 0, value: 100, interpolation: 'linear' },
          { timeOffsetSec: 0.18, value: 108, interpolation: 'bezier' },
          { timeOffsetSec: 0.45, value: 100, interpolation: 'bezier' },
        ],
        instruction:
          '第 1 个片段开头做一个 hook 放大回弹，优先在 Transform 或 Motion.Scale 上写 3 个关键帧。',
      });
    }

    if (Array.isArray(args.blueprint.transitionPattern)) {
      const needsZoomCut = args.blueprint.transitionPattern.some((transition) =>
        /zoom|beat/.test(transition.toLowerCase()),
      );
      if (needsZoomCut) {
        const boundaryCount = Math.min(Math.max(placements.length - 1, 0), 3);
        for (let index = 0; index < boundaryCount; index += 1) {
          const window = this.inferPlacementWindow(placements[index], index, args.clipDuration);
          const duration = Math.max(0.12, window.endTime - window.startTime);
          plan.push({
            phase: 'transition',
            targetClipIndex: index + 1,
            targetClipId: window.clipId,
            targetProperty: 'Transform.Scale',
            recommendedEffect: 'Transform',
            relativeWindow: '片段尾部最后 0.12 秒',
            keyframes: [
              {
                timeOffsetSec: Math.max(0, duration - 0.12),
                value: 100,
                interpolation: 'linear',
              },
              {
                timeOffsetSec: Math.max(0, duration - 0.04),
                value: 112,
                interpolation: 'bezier',
              },
            ],
            instruction:
              `第 ${index + 1} 个片段尾部补一个 zoom cut 预冲，剪点前瞬间把 Scale 推到 112。`,
          });
        }
      }
    }

    if (args.beatMarkers?.success && args.beatMarkers.cutPoints.length > 0) {
      const emphasizedBeats = args.beatMarkers.cutPoints.slice(0, 4);
      for (const beatTime of emphasizedBeats) {
        const placementIndex = placements.findIndex((placement: Record<string, any>, index: number) => {
          const window = this.inferPlacementWindow(placement, index, args.clipDuration);
          return beatTime >= window.startTime && beatTime <= window.endTime;
        });
        if (placementIndex < 0) {
          continue;
        }
        const window = this.inferPlacementWindow(
          placements[placementIndex],
          placementIndex,
          args.clipDuration,
        );
        const localBeatTime = Math.max(0, Number((beatTime - window.startTime).toFixed(3)));
        plan.push({
          phase: 'beat',
          targetClipIndex: placementIndex + 1,
          targetClipId: window.clipId,
          targetProperty: 'Motion.Scale',
          recommendedEffect: 'Transform',
          relativeWindow: `对应 BEAT 标记 ${beatTime.toFixed(2)}s 附近`,
          keyframes: [
            { timeOffsetSec: Math.max(0, localBeatTime - 0.06), value: 100, interpolation: 'linear' },
            { timeOffsetSec: localBeatTime, value: 106, interpolation: 'bezier' },
            { timeOffsetSec: localBeatTime + 0.06, value: 100, interpolation: 'bezier' },
          ],
          instruction:
            `在第 ${placementIndex + 1} 个片段的 beat 点附近做一次 scale pulse，和 BGM 标记对齐。`,
        });
      }
    }

    if (placements.length > 0 && args.blueprint.ctaPattern.trim().toLowerCase() !== 'none') {
      const lastIndex = placements.length - 1;
      const lastWindow = this.inferPlacementWindow(
        placements[lastIndex],
        lastIndex,
        args.clipDuration,
      );
      const duration = Math.max(0.4, lastWindow.endTime - lastWindow.startTime);
      plan.push({
        phase: 'cta',
        targetClipIndex: lastIndex + 1,
        targetClipId: lastWindow.clipId,
        targetProperty: 'Opacity',
        relativeWindow: '尾板最后 0.4 秒',
        keyframes: [
          { timeOffsetSec: Math.max(0, duration - 0.4), value: 0, interpolation: 'linear' },
          { timeOffsetSec: Math.max(0, duration - 0.15), value: 100, interpolation: 'bezier' },
        ],
        instruction:
          `最后一个片段或尾板补 CTA 淡入，确保 ${args.blueprint.ctaPattern} 在结尾被明确打出来。`,
      });
    }

    return plan;
  }

  private buildManualEffectChecklist(args: {
    blueprint: EditingBlueprint;
    assemblyResult?: any;
  }): ClosedLoopManualEffectItem[] {
    const placements = Array.isArray(args.assemblyResult?.placements)
      ? args.assemblyResult.placements
      : [];
    const firstWindow = this.inferPlacementWindow(placements[0], 0, args.assemblyResult?.clipDuration ?? 4);
    const items: ClosedLoopManualEffectItem[] = [];

    if (this.blueprintNeedsSubtitles(args.blueprint)) {
      items.push({
        phase: 'subtitle',
        effectName: 'Caption Style',
        instruction: `统一字幕样式为 ${args.blueprint.textOverlayStyle}，避免默认字幕样式直接交付。`,
      });
    }

    if (args.blueprint.transitionPattern.some((transition) => /zoom|beat/.test(transition.toLowerCase()))) {
      items.push({
        phase: 'transition',
        targetClipIndex: 1,
        targetClipId: firstWindow.clipId,
        effectName: 'Transform',
        instruction: '给关键剪点相关片段先挂 Transform，后续手动做 zoom cut 或 beat cut 时更稳。',
      });
    }

    if (args.blueprint.hookStyle.trim().length > 0) {
      items.push({
        phase: 'hook',
        targetClipIndex: 1,
        targetClipId: firstWindow.clipId,
        effectName: 'Hook Title / Flash Layer',
        instruction: `前 3 秒需要明确 hook，按 ${args.blueprint.hookStyle} 补冲击字、闪白层或开场标题。`,
      });
    }

    if (args.blueprint.ctaPattern.trim().toLowerCase() !== 'none') {
      const lastIndex = Math.max(0, placements.length - 1);
      const lastWindow = this.inferPlacementWindow(
        placements[lastIndex],
        lastIndex,
        args.assemblyResult?.clipDuration ?? 4,
      );
      items.push({
        phase: 'cta',
        targetClipIndex: lastIndex + 1,
        targetClipId: lastWindow.clipId,
        effectName: 'CTA Title / Logo Layer',
        instruction: `尾板补 ${args.blueprint.ctaPattern} 对应的标题、Logo 或按钮层，不要只停在最后一个素材镜头。`,
      });
    }

    return items;
  }

  private async maybeGenerateClosedLoopSubtitles(args: {
    blueprint: EditingBlueprint;
    sequenceId: string;
    subtitleSourcePath?: string;
    subtitleLanguage?: string;
    subtitleBackend?: 'auto' | 'openai' | 'faster-whisper';
    captionFormat?: string;
  }): Promise<ClosedLoopSubtitleAutomation> {
    const required = this.blueprintNeedsSubtitles(args.blueprint);
    if (!required) {
      return {
        required: false,
        attempted: false,
        success: true,
        reason: 'Blueprint does not require auto subtitles.',
        result: null,
      };
    }

    if (!args.subtitleSourcePath) {
      return {
        required: true,
        attempted: false,
        success: false,
        reason: 'Blueprint expects subtitle/text overlay work, but subtitleSourcePath is missing.',
        result: null,
      };
    }

    const result = await this.generateSubtitlesTool({
      audioPath: args.subtitleSourcePath,
      sequenceId: args.sequenceId,
      language: args.subtitleLanguage,
      backend: args.subtitleBackend,
      captionFormat: args.captionFormat,
    });
    return {
      required: true,
      attempted: true,
      success: Boolean(result?.success),
      sourcePath: args.subtitleSourcePath,
      reason: result?.success ? undefined : result?.error ?? 'Subtitle generation failed.',
      result,
    };
  }

  private async maybeCreateClosedLoopBeatMarkers(args: {
    blueprint: EditingBlueprint;
    sequenceId: string;
    bgmPath?: string;
    beatMarkerPrefix?: string;
    beatsPerBar?: number;
    placements?: Array<Record<string, any>>;
    clipDuration: number;
  }): Promise<ClosedLoopBeatMarkerAutomation> {
    const required = this.blueprintNeedsBeatMarkers(args.blueprint);
    if (!required) {
      return {
        required: false,
        attempted: false,
        success: true,
        markerCount: 0,
        cutPoints: [],
        warnings: [],
      };
    }

    if (!args.bgmPath) {
      return {
        required: true,
        attempted: false,
        success: false,
        sourcePath: undefined,
        strategy: this.mapBlueprintBeatStrategy(args.blueprint.musicBeatStrategy),
        markerCount: 0,
        cutPoints: [],
        warnings: ['Blueprint expects beat-driven editing, but bgmPath is missing.'],
      };
    }
    try {
      const analysis = await analyzeAudioTrack({
        inputPath: args.bgmPath,
        projectRoot: process.cwd(),
      });
      const strategy = this.mapBlueprintBeatStrategy(args.blueprint.musicBeatStrategy);
      const clips = (args.placements?.length ? args.placements : [{ id: 'placeholder' }]).map(
        (placement: Record<string, any>, index: number) => {
          const window = this.inferPlacementWindow(placement, index, args.clipDuration);
          return {
            clipId: window.clipId ?? `clip-${index + 1}`,
            durationSec: Number((window.endTime - window.startTime).toFixed(3)),
          };
        },
      );
      const plan = buildBeatSyncPlan({
        clips,
        beats: Array.isArray(analysis.beats) ? analysis.beats : [],
        strategy,
        mode: 'sequential',
        beatsPerBar: args.beatsPerBar ?? 4,
        fallbackSegmentSec: args.clipDuration,
        tempo: typeof analysis.tempo === 'number' ? analysis.tempo : undefined,
      });

      const prefix = args.beatMarkerPrefix?.trim() || 'BEAT';
      const failures: Array<{ time: number; error: string }> = [];
      let markerCount = 0;
      for (let index = 0; index < plan.cutPoints.length; index += 1) {
        const time = plan.cutPoints[index]!;
        const markerResult = await this.addMarker(
          args.sequenceId,
          time,
          `${prefix} ${String(index + 1).padStart(2, '0')}`,
          `${strategy} | ${time.toFixed(2)}s`,
        );
        if (markerResult?.success) {
          markerCount += 1;
        } else {
          failures.push({
            time,
            error: markerResult?.error ?? 'Failed to add beat marker.',
          });
        }
      }

      return {
        required: true,
        attempted: true,
        success: failures.length === 0,
        sourcePath: args.bgmPath,
        strategy,
        markerCount,
        cutPoints: plan.cutPoints,
        warnings: plan.warnings,
        analysis: {
          tempo: typeof analysis.tempo === 'number' ? analysis.tempo : undefined,
          beatCount: Array.isArray(analysis.beats) ? analysis.beats.length : 0,
        },
        failures,
      };
    } catch (error) {
      return {
        required: true,
        attempted: true,
        success: false,
        sourcePath: args.bgmPath,
        strategy: this.mapBlueprintBeatStrategy(args.blueprint.musicBeatStrategy),
        markerCount: 0,
        cutPoints: [],
        warnings: [
          error instanceof Error ? error.message : String(error),
        ],
        failures: [],
      };
    }
  }

  getAvailableTools(): MCPTool[] {
    return [
      ...createHighLevelToolCatalogSnapshot({
        referenceOnlyMediaPolicy: REFERENCE_ONLY_MEDIA_POLICY,
        animationPresetNames: ANIMATION_PRESET_NAMES as [AnimationPresetName, ...AnimationPresetName[]],
      }),
      ...createProjectMediaToolCatalogSnapshot({
        referenceOnlyMediaPolicy: REFERENCE_ONLY_MEDIA_POLICY,
      }),
      ...createSequenceToolCatalogSnapshot(),
      ...createTimelineToolCatalogSnapshot(),
      ...createEffectsToolCatalogSnapshot(),
      ...createPostProductionToolCatalogSnapshot(),
      ...createTimelineManagementToolCatalogSnapshot({
        keyframeValueSchema,
      }),
      ...createBatchAssemblyToolCatalogSnapshot(),
      ...createAgentOrchestrationCatalogSnapshot(),
      ...createCriticToolCatalogSnapshot(),
      ...createMediaAdminToolCatalogSnapshot({
        pluginManifestSchema,
      }),
    ];
  }

  private getToolExecutors(): Record<string, ToolExecutionHandler> {
    const ctx = this as unknown as ToolExecutionFactoryContext;

    return {
      ...createPlanningExecutionGroup(ctx),
      ...createEditingExecutionGroup(ctx),
      agent_task: async (args) => executeAgentTask(agentTaskInputSchema.parse(args)),
      collect_reference_videos: async (args) =>
        collectReferenceVideos(collectReferenceVideosInputSchema.parse(args)),
      load_editing_blueprint: async (args) =>
        loadEditingBlueprint(loadEditingBlueprintInputSchema.parse(args)),
      analyze_reference_patterns: async (args) =>
        analyzeReferencePatterns(analyzeReferencePatternsInputSchema.parse(args)),
      extract_editing_blueprint: async (args) =>
        extractEditingBlueprint(extractEditingBlueprintInputSchema.parse(args)),
      review_blueprint_reasonability: async (args) =>
        executeBlueprintReview(reviewBlueprintReasonabilityInputSchema.parse(args)),
      critic_edit_result: async (args) => {
        const input = criticEditResultInputSchema.parse(args) as CriticInput;
        const resolvedBlueprint =
          input.blueprint ?? (input.editingBlueprintPath
            ? loadEditingBlueprint({
                editingBlueprintPath: input.editingBlueprintPath,
              }).blueprint
            : undefined);
        const timelineData =
          input.timelineData ?? (input.sequenceId
            ? await this.captureTimelineSnapshot(input.sequenceId)
            : undefined);
        return criticEditResult({
          ...input,
          blueprint: resolvedBlueprint,
          timelineData,
        });
      },
      compare_result_to_blueprint: async (args) => {
        const input = compareResultToBlueprintInputSchema.parse(args);
        const resolvedBlueprint =
          input.blueprint ?? (input.editingBlueprintPath
            ? loadEditingBlueprint({
                editingBlueprintPath: input.editingBlueprintPath,
              }).blueprint
            : undefined);
        const timelineData =
          input.timelineData ?? (input.sequenceId
            ? await this.captureTimelineSnapshot(input.sequenceId)
            : undefined);
        if (!timelineData) {
          return {
            ok: false,
            error: 'timelineData or sequenceId is required',
          };
        }
        if (!resolvedBlueprint) {
          return {
            ok: false,
            error: 'blueprint or editingBlueprintPath is required',
          };
        }
        return compareResultToBlueprint(
          timelineData as TimelineSnapshot,
          resolvedBlueprint as EditingBlueprint,
        );
      },
      ...createMediaAdminExecutionGroup(ctx),
    };
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.getAvailableTools().find(t => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`,
        availableTools: this.getAvailableTools().map(t => t.name)
      };
    }

    // Validate input arguments
    try {
      tool.inputSchema.parse(args);
    } catch (error) {
      return {
        success: false,
        error: `Invalid arguments for tool '${name}': ${error}`,
        expectedSchema: tool.inputSchema.description
      };
    }

    const sanitizedArgs = this.sanitizeArgs(args);
    this.logger.info(`Executing tool: ${name} with args:`, sanitizedArgs);
    
    try {
      const handler = this.getToolExecutors()[name];
      if (!handler) {
        return {
          success: false,
          error: `Tool '${name}' not implemented`,
          availableTools: this.getAvailableTools().map(t => t.name)
        };
      }

      return await handler(args);
    } catch (error) {
      this.logger.error(`Error executing tool ${name}:`, error);
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        tool: name,
        args: sanitizedArgs
      };
    }
  }

  // Discovery Tools Implementation
  private async listProjectItems(includeBins = true, includeMetadata = false): Promise<any> {
    const includeBinsFlag = this.coerceBooleanFlag(includeBins, true);
    const includeMetadataFlag = this.coerceBooleanFlag(includeMetadata, false);
    const script = `
      try {
        function copyTimeInfo(target, prefix, timeValue) {
          if (!timeValue) return;
          try {
            if (timeValue.seconds !== undefined) {
              target[prefix + 'Seconds'] = timeValue.seconds;
            }
            if (timeValue.ticks !== undefined) {
              target[prefix + 'Ticks'] = timeValue.ticks;
            }
          } catch (e) {}
        }

        function readMetadata(item) {
          var metadata = {};

          try {
            var inPoint = item.getInPoint ? item.getInPoint() : null;
            var outPoint = item.getOutPoint ? item.getOutPoint() : null;
            copyTimeInfo(metadata, 'inPoint', inPoint);
            copyTimeInfo(metadata, 'outPoint', outPoint);
            if (inPoint && outPoint && inPoint.seconds !== undefined && outPoint.seconds !== undefined) {
              metadata.durationSeconds = outPoint.seconds - inPoint.seconds;
            }
          } catch (e) {}

          try {
            var interpretation = item.getFootageInterpretation ? item.getFootageInterpretation() : null;
            if (interpretation) {
              if (interpretation.frameRate !== undefined) metadata.frameRate = interpretation.frameRate;
              if (interpretation.pixelAspectRatio !== undefined) metadata.pixelAspectRatio = interpretation.pixelAspectRatio;
              if (interpretation.fieldType !== undefined) metadata.fieldType = interpretation.fieldType;
            }
          } catch (e) {}

          try {
            var rawColumns = item.getProjectColumnsMetadata ? item.getProjectColumnsMetadata() : null;
            if (rawColumns) {
              var parsedColumns = JSON.parse(rawColumns);
              if (parsedColumns && parsedColumns.length) {
                metadata.projectColumns = parsedColumns;
                for (var i = 0; i < parsedColumns.length; i++) {
                  var column = parsedColumns[i];
                  if (!column || !column.ColumnName) continue;
                  if (column.ColumnName === "Frame Size" || column.ColumnName === "Video Info") {
                    metadata.resolution = column.ColumnValue;
                  }
                  if (column.ColumnName === "Media Duration" && metadata.durationSeconds === undefined) {
                    metadata.duration = column.ColumnValue;
                  }
                }
              }
            }
          } catch (e) {}

          try {
            if (item.getProjectMetadata) {
              metadata.projectMetadata = item.getProjectMetadata();
            }
          } catch (e) {}

          for (var key in metadata) {
            if (metadata.hasOwnProperty(key)) return metadata;
          }
          return null;
        }

        function walkItems(parent, results, bins) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            var info = {
              id: item.nodeId,
              name: item.name,
              type: item.type === 2 ? 'bin' : (item.isSequence() ? 'sequence' : 'footage'),
              treePath: item.treePath
            };
            try { info.mediaPath = item.getMediaPath(); } catch(e) {}
            if (${includeMetadataFlag} === 1) {
              var metadata = readMetadata(item);
              if (metadata) {
                info.metadata = metadata;
              }
            }
            if (item.type === 2) {
              bins.push(info);
              walkItems(item, results, bins);
            } else {
              results.push(info);
            }
          }
        }
        var items = []; var bins = [];
        walkItems(app.project.rootItem, items, bins);
        return JSON.stringify({
          success: true,
          items: items,
          bins: ${includeBinsFlag} === 1 ? bins : [],
          totalItems: items.length,
          totalBins: bins.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async listSequences(): Promise<any> {
    const script = `
      try {
        var sequences = [];
        
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
          var seq = app.project.sequences[i];
          sequences.push({
            id: seq.sequenceID,
            name: seq.name,
            duration: __ticksToSeconds(seq.end),
            width: seq.frameSizeHorizontal,
            height: seq.frameSizeVertical,
            timebase: seq.timebase,
            videoTrackCount: seq.videoTracks.numTracks,
            audioTrackCount: seq.audioTracks.numTracks
          });
        }

        return JSON.stringify({
          success: true,
          sequences: sequences,
          count: sequences.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.runScript(script);
  }

  private async listSequenceTracks(sequenceId: string): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        var usedActiveSequenceFallback = false;
        if (!sequence) {
          sequence = app.project.activeSequence;
          usedActiveSequenceFallback = sequence ? true : false;
        }
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
        }

        var videoTracks = [];
        var audioTracks = [];

        for (var videoTrackIndex = 0; videoTrackIndex < sequence.videoTracks.numTracks; videoTrackIndex++) {
          var track = sequence.videoTracks[videoTrackIndex];
          var clips = [];

          for (var videoClipIndex = 0; videoClipIndex < track.clips.numItems; videoClipIndex++) {
            var clip = track.clips[videoClipIndex];
            var nextClip = videoClipIndex + 1 < track.clips.numItems ? track.clips[videoClipIndex + 1] : null;
            var gapAfterSec = null;
            var overlapAfterSec = null;
            if (nextClip) {
              var deltaToNext = nextClip.start.seconds - clip.end.seconds;
              if (deltaToNext >= 0) {
                gapAfterSec = deltaToNext;
              } else {
                overlapAfterSec = Math.abs(deltaToNext);
              }
            }
            clips.push({
              id: clip.nodeId,
              name: clip.name,
              sequenceName: sequence.name,
              trackType: 'video',
              trackIndex: videoTrackIndex,
              clipIndex: videoClipIndex,
              startTime: clip.start.seconds,
              endTime: clip.end.seconds,
              duration: clip.duration.seconds,
              gapAfterSec: gapAfterSec,
              overlapAfterSec: overlapAfterSec
            });
          }

          videoTracks.push({
            index: videoTrackIndex,
            name: track.name || "Video " + (videoTrackIndex + 1),
            clips: clips,
            clipCount: clips.length
          });
        }

        for (var audioTrackIndex = 0; audioTrackIndex < sequence.audioTracks.numTracks; audioTrackIndex++) {
          var track = sequence.audioTracks[audioTrackIndex];
          var clips = [];

          for (var audioClipIndex = 0; audioClipIndex < track.clips.numItems; audioClipIndex++) {
            var clip = track.clips[audioClipIndex];
            var nextClip = audioClipIndex + 1 < track.clips.numItems ? track.clips[audioClipIndex + 1] : null;
            var gapAfterSec = null;
            var overlapAfterSec = null;
            if (nextClip) {
              var deltaToNext = nextClip.start.seconds - clip.end.seconds;
              if (deltaToNext >= 0) {
                gapAfterSec = deltaToNext;
              } else {
                overlapAfterSec = Math.abs(deltaToNext);
              }
            }
            clips.push({
              id: clip.nodeId,
              name: clip.name,
              sequenceName: sequence.name,
              trackType: 'audio',
              trackIndex: audioTrackIndex,
              clipIndex: audioClipIndex,
              startTime: clip.start.seconds,
              endTime: clip.end.seconds,
              duration: clip.duration.seconds,
              gapAfterSec: gapAfterSec,
              overlapAfterSec: overlapAfterSec
            });
          }

          audioTracks.push({
            index: audioTrackIndex,
            name: track.name || "Audio " + (audioTrackIndex + 1),
            clips: clips,
            clipCount: clips.length
          });
        }

        return JSON.stringify({
          success: true,
          sequenceId: ${sequenceIdLiteral},
          resolvedSequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          usedActiveSequenceFallback: usedActiveSequenceFallback,
          videoTracks: videoTracks,
          audioTracks: audioTracks,
          totalVideoTracks: videoTracks.length,
          totalAudioTracks: audioTracks.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async getProjectInfo(): Promise<any> {
    const script = `
      try {
        var project = app.project;
        var hasActive = project.activeSequence ? true : false;
        return JSON.stringify({
          success: true,
          name: project.name,
          path: project.path,
          activeSequence: hasActive ? {
            id: project.activeSequence.sequenceID,
            name: project.activeSequence.name
          } : null,
          itemCount: project.rootItem.children.numItems,
          sequenceCount: project.sequences.numSequences,
          hasActiveSequence: hasActive
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async buildMotionGraphicsDemo(
    sequenceName = 'Apple Like Motion Demo',
    transitionName?: string,
    transitionDuration?: number,
    naturalLanguagePrompt?: string,
    referenceBlueprintPath?: string,
  ): Promise<any> {
    const derivedDefaults = await this.deriveAssemblyDefaults({
      referenceBlueprintPath,
      naturalLanguagePrompt,
    });
    const assetBase = process.env.PREMIERE_TEMP_DIR || '/tmp';
    const assetDir = `${assetBase.replace(/\/$/, '')}/motion-demo-${Date.now()}`;
    const assets = await createMotionDemoAssets(assetDir);

    const createdSequence = await this.createSequence(sequenceName);
    if (!createdSequence.success || !createdSequence.id) {
      return {
        success: false,
        error: createdSequence.error || 'Failed to create demo sequence',
        assetDir,
        assets
      };
    }

    const imported = [];
    for (const asset of assets) {
      const result = await this.importMedia(asset.path);
      imported.push(result);
      if (!result.success || !result.id) {
        return {
          success: false,
          error: result.error || `Failed to import asset ${asset.name}`,
          assetDir,
          assets,
          createdSequence,
          imported
        };
      }
    }

    const placements = [];
    for (let index = 0; index < imported.length; index++) {
      const placement = await this.addToTimeline(createdSequence.id, imported[index].id, 0, index * 5);
      placements.push(placement);
      if (!placement.success) {
        return {
          success: false,
          error: placement.error || `Failed to place ${imported[index].name} on the timeline`,
          assetDir,
          assets,
          createdSequence,
          imported,
          placements
        };
      }
    }

    const clips = placements.map((placement: any) => placement.id).filter(Boolean);
    const transitions = [];
    const resolvedTransitionName =
      typeof transitionName === 'string' && transitionName.trim().length > 0
        ? transitionName.trim()
        : derivedDefaults.transitionName;
    const resolvedTransitionDuration =
      resolvedTransitionName !== null
        ? transitionDuration ?? derivedDefaults.transitionDuration ?? 0.75
        : null;
    if (resolvedTransitionName && resolvedTransitionDuration !== null) {
      for (let index = 0; index < Math.max(clips.length - 1, 0); index++) {
        const clipId = clips[index];
        if (!clipId) {
          continue;
        }
        transitions.push(
          await this.addTransitionToClip(
            clipId,
            resolvedTransitionName,
            'end',
            resolvedTransitionDuration,
          ),
        );
      }
    }

    const animations = [];
    const scaleFrames = [
      { start: 0, end: 4.8, from: 100, to: 108 },
      { start: 0.005, end: 4.8, from: 112, to: 100 },
      { start: 0.01, end: 4.69, from: 100, to: 106 },
    ];
    for (let index = 0; index < clips.length && index < scaleFrames.length; index++) {
      const frame = scaleFrames[index];
      if (!frame) {
        continue;
      }
      animations.push(await this.addKeyframe(clips[index], 'Motion', 'Scale', frame.start, frame.from));
      animations.push(await this.addKeyframe(clips[index], 'Motion', 'Scale', frame.end, frame.to));
    }

    const tracks = await this.listSequenceTracks(createdSequence.id);

    return {
      success: true,
      message: 'Motion graphics demo sequence created',
      assetDir,
      assets,
      sequence: createdSequence,
      imported,
      placements,
      transitionName: resolvedTransitionName,
      transitionDuration: resolvedTransitionDuration,
      naturalLanguagePlan: derivedDefaults.naturalLanguagePlan,
      referenceBlueprintPath,
      transitions,
      animations,
      tracks
    };
  }

  private async reviewEditReasonabilityTool(args: {
    docxPath: string;
    mediaManifestPath: string;
    assetPaths?: string[];
    transitionName?: string;
    transitionPolicy?: string;
    clipDuration?: number;
    motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
    mediaPolicy?: string;
  }): Promise<any> {
    const result = await reviewEditReasonabilityFromFiles({
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      assetPaths: args.assetPaths,
      transitionName: args.transitionName,
      transitionPolicy: args.transitionPolicy,
      clipDuration: args.clipDuration,
      motionStyle: args.motionStyle,
      mediaPolicy: args.mediaPolicy,
    });

    return {
      success: true,
      blocked: result.review.status === 'blocked',
      review: result.review,
      markdownReport: result.markdownReport,
    };
  }

  private async analyzeReferenceVideoTool(args: {
    videoPath: string;
  }): Promise<any> {
    const blueprint = await analyzeVideoReference(args.videoPath);

    return {
      success: true,
      blueprint,
    };
  }

  private async planReplicationFromVideoTool(args: {
    videoPath: string;
    mediaManifestPath: string;
    sequenceName?: string;
  }): Promise<any> {
    const blueprint = await analyzeVideoReference(args.videoPath);
    const manifest = JSON.parse(
      await readFile(args.mediaManifestPath, 'utf8'),
    ) as MediaFolderManifest;
    const plan = await matchAssetsToBlueprint(blueprint, manifest);

    return {
      success: true,
      sequenceName: args.sequenceName ?? 'Reference Video Replication',
      blueprint,
      plan,
    };
  }

  private async compareToReferenceVideoTool(args: {
    videoPath: string;
    assemblyReviewJson: string;
  }): Promise<any> {
    let assemblyReview: Record<string, any>;
    try {
      assemblyReview = JSON.parse(args.assemblyReviewJson) as Record<string, any>;
    } catch (error) {
      return {
        success: false,
        error: `Invalid assemblyReviewJson: ${error}`,
      };
    }

    const blueprint = await analyzeVideoReference(args.videoPath);
    const report = compareToBlueprint(blueprint, assemblyReview);

    return {
      success: true,
      blueprint,
      report,
    };
  }

  private normalizeDerivedTransitionName(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.toLowerCase() === 'cut' ? null : trimmed;
  }

  private mapReferenceMotionStyle(
    value: string | null | undefined,
  ): SupportedMotionStyle | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (normalized === 'slow') {
      return 'push_in';
    }
    if (normalized === 'fast' || normalized === 'mixed') {
      return 'alternate';
    }
    if (
      normalized === 'push_in' ||
      normalized === 'pull_out' ||
      normalized === 'alternate' ||
      normalized === 'none'
    ) {
      return normalized;
    }

    return undefined;
  }

  private mapEditingBlueprintMotionStyle(
    blueprint: EditingBlueprint,
  ): SupportedMotionStyle | undefined {
    const cues = [
      blueprint.pacingCurve,
      blueprint.musicBeatStrategy,
      blueprint.hookStyle,
      blueprint.textOverlayStyle,
      blueprint.targetPlatform,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    if (!cues) {
      return undefined;
    }

    if (/\bpush[\s_-]?in\b|\bzoom[\s_-]?in\b/.test(cues)) {
      return 'push_in';
    }
    if (/\bpull[\s_-]?out\b|\bzoom[\s_-]?out\b/.test(cues)) {
      return 'pull_out';
    }
    if (
      /\balternate\b|\bdynamic\b|\bpunchy\b|\bkinetic\b|\bfast\b|\bviral\b|\bdouyin\b/.test(
        cues,
      )
    ) {
      return 'alternate';
    }
    if (
      /\bsteady\b|\bclean\b|\bminimal\b|\bcalm\b|\bsoft\b|\bnone\b|\bbilibili\b/.test(
        cues,
      )
    ) {
      return 'none';
    }

    return undefined;
  }

  private async deriveAssemblyDefaults(args: {
    referenceBlueprintPath?: string;
    editingBlueprintPath?: string;
    naturalLanguagePrompt?: string;
    mediaManifestPath?: string;
  }): Promise<{
    referenceBlueprint?: VideoBlueprint;
    editingBlueprint?: EditingBlueprint;
    naturalLanguagePlan?: NLAssemblyPlan;
    transitionName: string | null;
    transitionDuration?: number;
    clipDuration?: number;
    motionStyle?: SupportedMotionStyle;
    transitionPolicy?: string;
  }> {
    if (typeof args.referenceBlueprintPath === 'string' && args.referenceBlueprintPath.trim()) {
      const referenceBlueprint = JSON.parse(
        await readFile(args.referenceBlueprintPath, 'utf8'),
      ) as VideoBlueprint;
      const dominantTransition =
        referenceBlueprint.dominantTransitions.find((value) => typeof value === 'string' && value.trim().length > 0) ??
        referenceBlueprint.shots.find(
          (shot) =>
            typeof shot.transitionOut === 'string' && shot.transitionOut.trim().length > 0,
        )?.transitionOut ??
        null;
      const transitionName = this.normalizeDerivedTransitionName(dominantTransition);
      const clipDuration =
        Number.isFinite(referenceBlueprint.pacing?.avgShotDurationSec) &&
        referenceBlueprint.pacing.avgShotDurationSec > 0
          ? Number(referenceBlueprint.pacing.avgShotDurationSec.toFixed(3))
          : undefined;

      return {
        referenceBlueprint,
        transitionName,
        transitionDuration: transitionName ? 0.75 : undefined,
        clipDuration,
        motionStyle: this.mapReferenceMotionStyle(referenceBlueprint.motionStyle),
        transitionPolicy: transitionName ? 'explicit' : 'explicit-only',
      };
    }

    if (typeof args.editingBlueprintPath === 'string' && args.editingBlueprintPath.trim()) {
      const editingBlueprint = JSON.parse(
        await readFile(args.editingBlueprintPath, 'utf8'),
      ) as EditingBlueprint;
      const dominantTransition =
        editingBlueprint.transitionPattern.find(
          (value) => typeof value === 'string' && value.trim().length > 0,
        ) ?? null;
      const transitionName = this.normalizeDerivedTransitionName(dominantTransition);
      const clipDuration =
        Number.isFinite(editingBlueprint.averageShotDuration) &&
        editingBlueprint.averageShotDuration > 0
          ? Number(editingBlueprint.averageShotDuration.toFixed(3))
          : undefined;

      return {
        editingBlueprint,
        transitionName,
        transitionDuration: transitionName ? 0.75 : undefined,
        clipDuration,
        motionStyle: this.mapEditingBlueprintMotionStyle(editingBlueprint),
        transitionPolicy: transitionName ? 'explicit' : 'explicit-only',
      };
    }

    if (typeof args.naturalLanguagePrompt === 'string' && args.naturalLanguagePrompt.trim()) {
      const manifest = args.mediaManifestPath
        ? JSON.parse(await readFile(args.mediaManifestPath, 'utf8')) as MediaFolderManifest
        : undefined;
      const intent = parseNaturalLanguageRequest({
        prompt: args.naturalLanguagePrompt,
        mediaManifestPath: args.mediaManifestPath,
      });
      const naturalLanguagePlan = buildNLAssemblyPlan(intent, manifest);
      return {
        naturalLanguagePlan,
        transitionName: this.normalizeDerivedTransitionName(naturalLanguagePlan.transitionName),
        transitionDuration: naturalLanguagePlan.transitionName ? 0.75 : undefined,
        clipDuration: naturalLanguagePlan.clipDuration,
        motionStyle: this.mapReferenceMotionStyle(naturalLanguagePlan.motionStyle),
        transitionPolicy: naturalLanguagePlan.transitionName ? 'explicit' : 'explicit-only',
      };
    }

    return {
      transitionName: null,
    };
  }

  private async parseEditRequestTool(args: {
    prompt: string;
    maxDurationSec?: number;
  }): Promise<any> {
    const intent = parseNaturalLanguageRequest({
      prompt: args.prompt,
      maxDurationSec: args.maxDurationSec,
    });

    return {
      success: true,
      intent,
    };
  }

  private async planEditFromRequestTool(args: {
    prompt: string;
    mediaManifestPath?: string;
    maxDurationSec?: number;
    sequenceName?: string;
  }): Promise<any> {
    const intent = parseNaturalLanguageRequest({
      prompt: args.prompt,
      mediaManifestPath: args.mediaManifestPath,
      maxDurationSec: args.maxDurationSec,
    });
    const manifest = args.mediaManifestPath
      ? JSON.parse(await readFile(args.mediaManifestPath, 'utf8')) as MediaFolderManifest
      : undefined;
    const plan = buildNLAssemblyPlan(intent, manifest);

    return {
      success: true,
      intent,
      plan: {
        ...plan,
        sequenceName: args.sequenceName ?? plan.sequenceName,
      },
    };
  }

  private async resolveAnimationFrameSize(args: {
    clipId?: string;
    sequenceId?: string;
    frameWidth?: number;
    frameHeight?: number;
  }): Promise<{
    frameWidth?: number;
    frameHeight?: number;
  }> {
    let frameWidth = args.frameWidth;
    let frameHeight = args.frameHeight;

    if (
      typeof frameWidth === 'number' &&
      Number.isFinite(frameWidth) &&
      typeof frameHeight === 'number' &&
      Number.isFinite(frameHeight)
    ) {
      return { frameWidth, frameHeight };
    }

    if (args.sequenceId) {
      const sequenceSettings = await this.getSequenceSettings(args.sequenceId);
      if (sequenceSettings?.success) {
        if (typeof frameWidth !== 'number' || !Number.isFinite(frameWidth)) {
          frameWidth = Number(sequenceSettings.settings?.width);
        }
        if (typeof frameHeight !== 'number' || !Number.isFinite(frameHeight)) {
          frameHeight = Number(sequenceSettings.settings?.height);
        }
      }
    }

    if (
      args.clipId &&
      ((typeof frameWidth !== 'number' || !Number.isFinite(frameWidth))
        || (typeof frameHeight !== 'number' || !Number.isFinite(frameHeight)))
    ) {
      const clipFrameSize = await this.resolveClipSequenceFrameSize(args.clipId);
      if (clipFrameSize?.success) {
        if (typeof frameWidth !== 'number' || !Number.isFinite(frameWidth)) {
          frameWidth = clipFrameSize.frameWidth;
        }
        if (typeof frameHeight !== 'number' || !Number.isFinite(frameHeight)) {
          frameHeight = clipFrameSize.frameHeight;
        }
      }
    }

    return { frameWidth, frameHeight };
  }

  private async resolveClipSequenceFrameSize(clipId: string): Promise<{
    success: boolean;
    sequenceId?: string;
    frameWidth?: number;
    frameHeight?: number;
    error?: string;
  }> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const result = await this.runScript(`
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) {
          return JSON.stringify({
            success: false,
            error: "Clip not found"
          });
        }
        var sequence = __findSequence(info.sequenceId) || app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found for clip",
            sequenceId: info.sequenceId || null
          });
        }
        var settings = null;
        try {
          settings = sequence.getSettings ? sequence.getSettings() : null;
        } catch (_settingsError) {}
        var frameWidth = settings && settings.videoFrameWidth !== undefined
          ? Number(settings.videoFrameWidth)
          : Number(sequence.frameSizeHorizontal);
        var frameHeight = settings && settings.videoFrameHeight !== undefined
          ? Number(settings.videoFrameHeight)
          : Number(sequence.frameSizeVertical);
        if (!isFinite(frameWidth) || frameWidth <= 0 || !isFinite(frameHeight) || frameHeight <= 0) {
          return JSON.stringify({
            success: false,
            error: "Sequence frame size unavailable",
            sequenceId: sequence.sequenceID || info.sequenceId || null
          });
        }
        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID || info.sequenceId || null,
          frameWidth: Math.round(frameWidth),
          frameHeight: Math.round(frameHeight)
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `) as {
      success?: boolean;
      sequenceId?: string;
      frameWidth?: number;
      frameHeight?: number;
      error?: string;
    };

    return {
      success: result?.success === true,
      sequenceId: result?.sequenceId,
      frameWidth:
        typeof result?.frameWidth === 'number' && Number.isFinite(result.frameWidth)
          ? result.frameWidth
          : undefined,
      frameHeight:
        typeof result?.frameHeight === 'number' && Number.isFinite(result.frameHeight)
          ? result.frameHeight
          : undefined,
      error: result?.error,
    };
  }

  private async parseKeyframeRequestTool(args: {
    prompt: string;
    durationSec?: number;
  }): Promise<any> {
    const intent = parseKeyframeAnimationRequest({
      prompt: args.prompt,
      durationSec: args.durationSec,
    });

    return {
      success: true,
      intent,
    };
  }

  private keyframeIntentNeedsFrameSize(
    intent: ParsedKeyframeAnimationIntent,
  ): boolean {
    return intent.slideDirection !== null;
  }

  private animationPresetNeedsFrameSize(preset: AnimationPresetName): boolean {
    return (
      preset === 'slide_left'
      || preset === 'slide_right'
      || preset === 'slide_top'
      || preset === 'slide_bottom'
      || preset === 'shake'
    );
  }

  private async planKeyframeAnimationTool(args: {
    prompt: string;
    target?: string;
    clipId?: string;
    startTimeSec?: number;
    durationSec?: number;
    sequenceId?: string;
    frameWidth?: number;
    frameHeight?: number;
  }): Promise<any> {
    const intent = parseKeyframeAnimationRequest({
      prompt: args.prompt,
      durationSec: args.durationSec,
    });
    const frameSize = this.keyframeIntentNeedsFrameSize(intent)
      ? await this.resolveAnimationFrameSize({
          clipId: args.clipId,
          sequenceId: args.sequenceId,
          frameWidth: args.frameWidth,
          frameHeight: args.frameHeight,
        })
      : {
          frameWidth: args.frameWidth,
          frameHeight: args.frameHeight,
        };
    const plan = buildKeyframeAnimationPlan(intent, {
      target: args.target ?? 'selected-target',
      startTimeSec: args.startTimeSec,
      durationSec: args.durationSec,
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight,
    });

    return {
      success: true,
      intent,
      plan,
    };
  }

  private async applyAnimationPreset(args: {
    clipId: string;
    preset: AnimationPresetName;
    startTimeSec?: number;
    durationSec?: number;
    frameWidth?: number;
    frameHeight?: number;
  }): Promise<any> {
    const frameSize = this.animationPresetNeedsFrameSize(args.preset)
      ? await this.resolveAnimationFrameSize({
          clipId: args.clipId,
          frameWidth: args.frameWidth,
          frameHeight: args.frameHeight,
        })
      : {
          frameWidth: args.frameWidth,
          frameHeight: args.frameHeight,
        };
    const plan = buildPresetPlan(args.preset, {
      target: args.clipId,
      startTimeSec: args.startTimeSec,
      durationSec: args.durationSec,
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight,
    });
    if (plan.unresolved.length > 0) {
      return { success: false, blocked: true, error: plan.unresolved[0], plan };
    }
    const transformFallback = await this.resolveStaticImageTransformFallback(
      args.clipId,
      plan.propertyPlans,
    );
    const appliedKeyframes: Array<Record<string, any>> = [];
    const failedKeyframes: Array<Record<string, any>> = [];
    for (const propertyPlan of plan.propertyPlans) {
      const resolvedComponentName = this.resolveFallbackComponentName(
        propertyPlan.componentName,
        propertyPlan.paramName,
        transformFallback,
      );
      for (const keyframe of propertyPlan.keyframes) {
        const interpolation = this.resolveInterpolationForEasing(keyframe.easing);
        const keyframeEntry = this.buildPlannedKeyframeApplicationEntry(
          resolvedComponentName,
          propertyPlan.paramName,
          keyframe,
          interpolation,
        );
        const result = await this.addKeyframe(
          args.clipId, resolvedComponentName, propertyPlan.paramName,
          keyframe.time, keyframe.value, interpolation,
        );
        if (!result?.success) {
          failedKeyframes.push(
            this.buildFailedKeyframeApplicationEntry(keyframeEntry, result),
          );
          continue;
        }
        appliedKeyframes.push(
          this.buildAppliedKeyframeApplicationEntry(keyframeEntry, result),
        );
      }
    }
    return this.finalizeKeyframeApplicationBatch(
      {
        preset: args.preset,
        plan,
        fallback: transformFallback.attempted ? transformFallback : null,
      },
      appliedKeyframes,
      failedKeyframes,
    );
  }

  private async applyKeyframeAnimationTool(args: {
    clipId: string;
    prompt: string;
    target?: string;
    startTimeSec?: number;
    durationSec?: number;
    sequenceId?: string;
    frameWidth?: number;
    frameHeight?: number;
  }): Promise<any> {
    const planning = await this.planKeyframeAnimationTool({
      prompt: args.prompt,
      target: args.target ?? args.clipId,
      clipId: args.clipId,
      startTimeSec: args.startTimeSec,
      durationSec: args.durationSec,
      sequenceId: args.sequenceId,
      frameWidth: args.frameWidth,
      frameHeight: args.frameHeight,
    }) as {
      success: boolean;
      intent: ParsedKeyframeAnimationIntent;
      plan: KeyframeAnimationPlan;
    };

    if (!planning.plan || planning.plan.propertyPlans.length === 0 || planning.plan.unresolved.length > 0) {
      return {
        success: false,
        blocked: true,
        error: 'Keyframe animation plan has unresolved fields and cannot be applied safely.',
        intent: planning.intent,
        plan: planning.plan,
      };
    }

    const transformFallback = await this.resolveStaticImageTransformFallback(
      args.clipId,
      planning.plan.propertyPlans,
    );
    const appliedKeyframes: Array<Record<string, any>> = [];
    const failedKeyframes: Array<Record<string, any>> = [];
    for (const propertyPlan of planning.plan.propertyPlans) {
      const resolvedComponentName = this.resolveFallbackComponentName(
        propertyPlan.componentName,
        propertyPlan.paramName,
        transformFallback,
      );
      for (const keyframe of propertyPlan.keyframes) {
        const interpolation = this.resolveInterpolationForEasing(keyframe.easing);
        const keyframeEntry = this.buildPlannedKeyframeApplicationEntry(
          resolvedComponentName,
          propertyPlan.paramName,
          keyframe,
          interpolation,
        );
        const result = await this.addKeyframe(
          args.clipId,
          resolvedComponentName,
          propertyPlan.paramName,
          keyframe.time,
          keyframe.value,
          interpolation,
        );

        if (!result?.success) {
          failedKeyframes.push(
            this.buildFailedKeyframeApplicationEntry(keyframeEntry, result),
          );
          continue;
        }

        appliedKeyframes.push(
          this.buildAppliedKeyframeApplicationEntry(keyframeEntry, result),
        );
      }
    }

    return this.finalizeKeyframeApplicationBatch(
      {
        intent: planning.intent,
        plan: planning.plan,
        fallback: transformFallback.attempted ? transformFallback : null,
      },
      appliedKeyframes,
      failedKeyframes,
    );
  }

  private async planEditAssemblyTool(args: {
    docxPath: string;
    mediaManifestPath: string;
    sequenceName?: string;
    maxAssets?: number;
    referenceBlueprintPath?: string;
    matchStrategy?: 'keyword' | 'blueprint';
    minMatchScore?: number;
    transitionName?: string;
    transitionPolicy?: string;
    clipDuration?: number;
    motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
    mediaPolicy?: string;
  }): Promise<any> {
    const result = await planEditAssemblyFromFiles({
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      sequenceName: args.sequenceName,
      maxAssets: args.maxAssets,
      referenceBlueprintPath: args.referenceBlueprintPath,
      matchStrategy: args.matchStrategy,
      minMatchScore: args.minMatchScore,
      transitionName: args.transitionName,
      transitionPolicy: args.transitionPolicy,
      clipDuration: args.clipDuration,
      motionStyle: args.motionStyle,
      mediaPolicy: args.mediaPolicy,
    });

    return {
      success: true,
      blocked: result.plan.review.status === 'blocked',
      plan: result.plan,
      markdownPlan: result.markdownPlan,
    };
  }

  private async reviewAssemblyGate(args: {
    docxPath?: string;
    mediaManifestPath?: string;
    reviewBeforeAssemble?: boolean;
    allowReviewWarnings?: boolean;
    assetPaths: string[];
    transitionName?: string;
    transitionPolicy?: string;
    clipDuration?: number;
    motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
    mediaPolicy?: string;
  }): Promise<
    | {
        shouldProceed: true;
        review?: Awaited<ReturnType<typeof reviewEditReasonabilityFromFiles>>['review'];
        markdownReport?: string;
      }
    | {
        shouldProceed: false;
        response: Record<string, any>;
      }
  > {
    if (!args.reviewBeforeAssemble) {
      return { shouldProceed: true };
    }

    if (!args.docxPath || !args.mediaManifestPath) {
      return {
        shouldProceed: false,
        response: {
          success: false,
          blocked: true,
          error:
            'reviewBeforeAssemble requires both docxPath and mediaManifestPath.',
        },
      };
    }

    const { review, markdownReport } = await reviewEditReasonabilityFromFiles({
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      assetPaths: args.assetPaths,
      transitionName: args.transitionName,
      transitionPolicy: args.transitionPolicy,
      clipDuration: args.clipDuration,
      motionStyle: args.motionStyle,
      mediaPolicy: args.mediaPolicy,
    });

    const blockedByWarnings =
      review.status === 'needs-review' && args.allowReviewWarnings !== true;
    const blocked = review.status === 'blocked' || blockedByWarnings;
    if (blocked) {
      return {
        shouldProceed: false,
        response: {
          success: false,
          blocked: true,
          error:
            review.status === 'blocked'
              ? 'Edit reasonability review blocked assembly.'
              : 'Edit reasonability review requires manual confirmation before assembly.',
          review,
          markdownReport,
        },
      };
    }

    return {
      shouldProceed: true,
      review,
      markdownReport,
    };
  }

  private async resolveAssemblyPlan(args: {
    sequenceName: string;
    assetPaths?: string[];
    docxPath?: string;
    mediaManifestPath?: string;
    autoPlanFromManifest?: boolean;
    maxPlannedAssets?: number;
    referenceBlueprintPath?: string;
    matchStrategy?: 'keyword' | 'blueprint';
    minMatchScore?: number;
    transitionName?: string;
    transitionPolicy?: string;
    clipDuration?: number;
    motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
    mediaPolicy?: string;
  }): Promise<
    | {
        success: true;
        assetPaths: string[];
        plan?: Awaited<ReturnType<typeof planEditAssemblyFromFiles>>['plan'];
        markdownPlan?: string;
        plannedFromManifest: boolean;
      }
    | {
        success: false;
        response: Record<string, any>;
      }
  > {
    if (Array.isArray(args.assetPaths) && args.assetPaths.length > 0) {
      return {
        success: true,
        assetPaths: args.assetPaths,
        plannedFromManifest: false,
      };
    }

    if (!args.autoPlanFromManifest) {
      return {
        success: false,
        response: {
          success: false,
          blocked: true,
          error: 'assemble_product_spot requires assetPaths unless autoPlanFromManifest is true.',
        },
      };
    }

    if (!args.docxPath || !args.mediaManifestPath) {
      return {
        success: false,
        response: {
          success: false,
          blocked: true,
          error: 'autoPlanFromManifest requires both docxPath and mediaManifestPath.',
        },
      };
    }

    const planned = await planEditAssemblyFromFiles({
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      sequenceName: args.sequenceName,
      maxAssets: args.maxPlannedAssets,
      referenceBlueprintPath: args.referenceBlueprintPath,
      matchStrategy: args.matchStrategy,
      minMatchScore: args.minMatchScore,
      transitionName: args.transitionName,
      transitionPolicy: args.transitionPolicy,
      clipDuration: args.clipDuration,
      motionStyle: args.motionStyle,
      mediaPolicy: args.mediaPolicy,
    });

    if (planned.plan.review.status === 'blocked') {
      return {
        success: false,
        response: {
          success: false,
          blocked: true,
          error: 'Automatic edit planning blocked assembly.',
          plan: planned.plan,
          markdownPlan: planned.markdownPlan,
        },
      };
    }

    return {
      success: true,
      assetPaths: planned.plan.assetPaths,
      plan: planned.plan,
      markdownPlan: planned.markdownPlan,
      plannedFromManifest: true,
    };
  }

  private async assembleProductSpot(args: {
    sequenceName: string;
    assetPaths?: string[];
    docxPath?: string;
    mediaManifestPath?: string;
    autoPlanFromManifest?: boolean;
    maxPlannedAssets?: number;
    referenceBlueprintPath?: string;
    editingBlueprintPath?: string;
    naturalLanguagePrompt?: string;
    applyGuideEffects?: boolean;
    reviewBeforeAssemble?: boolean;
    allowReviewWarnings?: boolean;
    mediaPolicy?: typeof REFERENCE_ONLY_MEDIA_POLICY;
    clipDuration?: number;
    videoTrackIndex?: number;
    transitionName?: string;
    transitionPolicy?: string;
    transitionDuration?: number;
    motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
  }): Promise<any> {
    const mediaPolicy = args.mediaPolicy ?? REFERENCE_ONLY_MEDIA_POLICY;
    const videoTrackIndex = args.videoTrackIndex ?? 0;
    const derivedDefaults = await this.deriveAssemblyDefaults({
      referenceBlueprintPath: args.referenceBlueprintPath,
      editingBlueprintPath: args.referenceBlueprintPath ? undefined : args.editingBlueprintPath,
      naturalLanguagePrompt:
        args.referenceBlueprintPath || args.editingBlueprintPath
          ? undefined
          : args.naturalLanguagePrompt,
      mediaManifestPath: args.mediaManifestPath,
    });

    if (mediaPolicy !== REFERENCE_ONLY_MEDIA_POLICY) {
      return {
        success: false,
        error: `Unsupported media policy: ${mediaPolicy}. Only ${REFERENCE_ONLY_MEDIA_POLICY} is supported.`,
        mediaPolicy
      };
    }

    const resolvedPlan = await this.resolveAssemblyPlan({
      sequenceName: args.sequenceName,
      assetPaths: args.assetPaths,
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      autoPlanFromManifest: args.autoPlanFromManifest,
      maxPlannedAssets: args.maxPlannedAssets,
      referenceBlueprintPath: args.referenceBlueprintPath,
      matchStrategy: args.referenceBlueprintPath ? 'blueprint' : undefined,
      transitionName: args.transitionName ?? derivedDefaults.transitionName ?? undefined,
      transitionPolicy: args.transitionPolicy ?? derivedDefaults.transitionPolicy,
      clipDuration: args.clipDuration ?? derivedDefaults.clipDuration,
      motionStyle: args.motionStyle ?? derivedDefaults.motionStyle,
      mediaPolicy,
    });
    if (!resolvedPlan.success) {
      return resolvedPlan.response;
    }

    const clipDuration =
      args.clipDuration ??
      derivedDefaults.clipDuration ??
      resolvedPlan.plan?.clipDuration ??
      4;
    const motionStyle =
      args.motionStyle ??
      derivedDefaults.motionStyle ??
      resolvedPlan.plan?.motionStyle ??
      'none';
    const resolvedTransitionName =
      typeof args.transitionName === 'string' && args.transitionName.trim().length > 0
        ? args.transitionName.trim()
        : derivedDefaults.transitionName ?? resolvedPlan.plan?.transitionName ?? null;
    const hasExplicitTransition = resolvedTransitionName !== null;
    const transitionName = hasExplicitTransition ? resolvedTransitionName : null;
    const transitionDuration = hasExplicitTransition
      ? (args.transitionDuration ?? derivedDefaults.transitionDuration ?? 0.5)
      : null;
    const transitionPolicy =
      args.transitionPolicy ??
      (typeof args.transitionName === 'string' && args.transitionName.trim().length > 0
        ? 'explicit'
        : derivedDefaults.transitionPolicy ??
          resolvedPlan.plan?.transitionPolicy ??
          (hasExplicitTransition ? 'explicit' : 'explicit-only'));
    const shouldReviewBeforeAssemble =
      args.reviewBeforeAssemble ?? Boolean(args.docxPath && args.mediaManifestPath);

    const reviewGate = await this.reviewAssemblyGate({
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      reviewBeforeAssemble: shouldReviewBeforeAssemble,
      allowReviewWarnings: args.allowReviewWarnings,
      assetPaths: resolvedPlan.assetPaths,
      transitionName: transitionName ?? undefined,
      transitionPolicy: args.transitionPolicy ?? transitionPolicy,
      clipDuration,
      motionStyle,
      mediaPolicy,
    });
    if (!reviewGate.shouldProceed) {
      return reviewGate.response;
    }
    const review = reviewGate.review;
    const markdownReport = reviewGate.markdownReport;

    const guideEffectNames =
      args.applyGuideEffects === true
        ? resolvedPlan.plan?.effectPlan.globalClipEffects ?? []
        : [];
    if (guideEffectNames.length > 0) {
      return {
        success: false,
        blocked: true,
        error:
          'Guide-derived DOCX effects are manual-only in this workflow. The planner can expose them, but assembly will not auto-apply them.',
        plan: resolvedPlan.plan,
        review,
        markdownReport,
        requestedEffectNames: guideEffectNames,
        mediaPolicy,
        copyOperations: 0,
      };
    }

    if (transitionName && transitionPolicy === 'guide-derived') {
      return {
        success: false,
        blocked: true,
        error:
          'Guide-derived DOCX transitions are manual-only in this workflow. Use the plan for review, then apply transitions manually or through a separately verified path.',
        plan: resolvedPlan.plan,
        review,
        markdownReport,
        requestedTransitionName: transitionName,
        transitionPolicy,
        mediaPolicy,
        copyOperations: 0,
      };
    }

    const imported = [];
    for (const assetPath of resolvedPlan.assetPaths) {
      const result = await this.importMedia(assetPath);
      imported.push(result);
      if (!result.success || !result.id) {
        return {
          success: false,
          error: result.error || `Failed to import ${assetPath}`,
          imported
        };
      }
    }

    if (this.shouldAssembleProductSpotViaXml({
      transitionName,
      motionStyle,
      videoTrackIndex,
    })) {
      const xmlAssembly = await this.buildTimelineFromXml(
        args.sequenceName,
        imported.map((item, index) => ({
          projectItemId: item.id,
          durationSec: clipDuration,
          ...this.resolveAssemblyXmlMotion(motionStyle, index),
        })),
        transitionName === 'Cross Dissolve' ? transitionDuration ?? undefined : undefined,
      );

      if (!xmlAssembly.success || !xmlAssembly.sequenceId) {
        return {
          success: false,
          error: xmlAssembly.error || 'Failed to build timeline from XML',
          mediaPolicy,
          copyOperations: 0,
          assetPaths: resolvedPlan.assetPaths,
          clipDuration,
          motionStyle,
          transitionName,
          transitionPolicy,
          editingBlueprint: derivedDefaults.editingBlueprint,
          editingBlueprintPath: args.editingBlueprintPath,
          naturalLanguagePlan: derivedDefaults.naturalLanguagePlan,
          referenceBlueprintPath: args.referenceBlueprintPath,
          imported,
          xmlPath: xmlAssembly.xmlPath,
        };
      }

      const sequence =
        xmlAssembly.sequence ?? {
          id: xmlAssembly.sequenceId,
          name: xmlAssembly.sequenceName,
        };
      const effects: any[] = [];
      const transitions: any[] = [];
      const animations: any[] = [];
      const tracks = await this.listSequenceTracks(xmlAssembly.sequenceId);
      const placements = this.extractTrackPlacements(tracks, videoTrackIndex);
      const assemblyReview = reviewAssemblyExecution({
        requestedTransitionName: transitionName,
        expectedTransitionCount: transitionName ? Math.max(placements.length - 1, 0) : 0,
        expectedClipCount: resolvedPlan.assetPaths.length,
        expectedAssetPaths: resolvedPlan.assetPaths,
        assembledTrackIndex: videoTrackIndex,
        requestedEffectNames: guideEffectNames,
        motionStyle,
        effects,
        transitions,
        animations,
        tracks,
        referenceBlueprintPath: args.referenceBlueprintPath,
      });

      if (assemblyReview.status === 'blocked') {
        return {
          success: false,
          blocked: true,
          error: 'Assembly execution review blocked the assembled result.',
          assemblyReview,
          mediaPolicy,
          copyOperations: 0,
          assetPaths: resolvedPlan.assetPaths,
          clipDuration,
          motionStyle,
        transitionName,
        transitionPolicy,
        editingBlueprint: derivedDefaults.editingBlueprint,
        editingBlueprintPath: args.editingBlueprintPath,
        naturalLanguagePlan: derivedDefaults.naturalLanguagePlan,
        referenceBlueprintPath: args.referenceBlueprintPath,
        sequence,
          imported,
          placements,
          effects,
          transitions,
          animations,
          tracks,
          xmlPath: xmlAssembly.xmlPath,
        };
      }

      return {
        success: true,
        message: 'Product spot assembled successfully',
        mediaPolicy,
        copyOperations: 0,
        assetPaths: resolvedPlan.assetPaths,
        clipDuration,
        motionStyle,
        transitionName,
        transitionDuration,
        plannedFromManifest: resolvedPlan.plannedFromManifest,
        plan: resolvedPlan.plan,
        markdownPlan: resolvedPlan.markdownPlan,
        transitionPolicy,
        editingBlueprint: derivedDefaults.editingBlueprint,
        editingBlueprintPath: args.editingBlueprintPath,
        naturalLanguagePlan: derivedDefaults.naturalLanguagePlan,
        referenceBlueprintPath: args.referenceBlueprintPath,
        review,
        markdownReport,
        assemblyReview,
        sequence,
        imported,
        placements,
        effects,
        transitions,
        animations,
        tracks,
        xmlPath: xmlAssembly.xmlPath,
      };
    }

    const createdSequence = await this.createSequence(args.sequenceName);
    if (!createdSequence.success || !createdSequence.id) {
      return {
        success: false,
        error: createdSequence.error || 'Failed to create sequence',
        sequenceName: args.sequenceName
      };
    }

    const placements = [];
    for (let index = 0; index < imported.length; index++) {
      const placementTime = index * clipDuration;
      const result = await this.addToTimeline(
        createdSequence.id,
        imported[index].id,
        videoTrackIndex,
        placementTime,
      );
      placements.push(result);
      if (!result.success || !result.id) {
        return {
          success: false,
          error: result.error || `Failed to place ${imported[index].name} on the timeline`,
          sequence: createdSequence,
          imported,
          placements
        };
      }
    }

    const transitions = [];
    const effects = [];
    if (guideEffectNames.length > 0) {
      for (const placement of placements) {
        for (const effectName of guideEffectNames) {
          effects.push(await this.applyEffect(placement.id, effectName));
        }
      }
    }

    if (transitionName && transitionDuration !== null) {
      for (let index = 0; index < placements.length - 1; index++) {
        transitions.push(
          await this.addTransition(
            placements[index].id,
            placements[index + 1].id,
            transitionName,
            transitionDuration,
          ),
        );
      }
    }

    const animations = [];
    if (motionStyle !== 'none') {
      for (let index = 0; index < placements.length; index++) {
        const placement = placements[index];
        const placementDuration = Math.max(
          0,
          typeof placement.outPoint === 'number' && typeof placement.inPoint === 'number'
            ? placement.outPoint - placement.inPoint
            : clipDuration,
        );
        const start = 0;
        const end = Math.max(
          0,
          placementDuration <= 0.1 ? placementDuration : placementDuration - 0.1,
        );

        let from = 100;
        let to = 106;
        if (motionStyle === 'push_in') {
          from = 100;
          to = 108;
        } else if (motionStyle === 'pull_out') {
          from = 108;
          to = 100;
        } else if (motionStyle === 'alternate') {
          const invert = index % 2 === 1;
          from = invert ? 110 : 100;
          to = invert ? 100 : 108;
        }

        animations.push(await this.addKeyframe(placement.id, 'Motion', 'Scale', start, from));
        animations.push(await this.addKeyframe(placement.id, 'Motion', 'Scale', end, to));
      }
    }

    const tracks = await this.listSequenceTracks(createdSequence.id);
    const assemblyReview = reviewAssemblyExecution({
      requestedTransitionName: transitionName,
      expectedTransitionCount: transitionName ? Math.max(placements.length - 1, 0) : 0,
      expectedClipCount: resolvedPlan.assetPaths.length,
      expectedAssetPaths: resolvedPlan.assetPaths,
      assembledTrackIndex: videoTrackIndex,
      requestedEffectNames: guideEffectNames,
      motionStyle,
      effects,
      transitions,
      animations,
      tracks,
      referenceBlueprintPath: args.referenceBlueprintPath,
    });
    if (assemblyReview.status === 'blocked') {
      return {
        success: false,
        blocked: true,
        error: 'Assembly execution review blocked the assembled result.',
        assemblyReview,
        mediaPolicy,
        copyOperations: 0,
        assetPaths: resolvedPlan.assetPaths,
        clipDuration,
        motionStyle,
        transitionName,
        transitionPolicy,
        editingBlueprint: derivedDefaults.editingBlueprint,
        editingBlueprintPath: args.editingBlueprintPath,
        naturalLanguagePlan: derivedDefaults.naturalLanguagePlan,
        referenceBlueprintPath: args.referenceBlueprintPath,
        sequence: createdSequence,
        imported,
        placements,
        effects,
        transitions,
        animations,
        tracks,
      };
    }

    return {
      success: true,
      message: 'Product spot assembled successfully',
      mediaPolicy,
      copyOperations: 0,
      assetPaths: resolvedPlan.assetPaths,
      clipDuration,
      motionStyle,
      transitionName,
      transitionDuration,
      plannedFromManifest: resolvedPlan.plannedFromManifest,
      plan: resolvedPlan.plan,
      markdownPlan: resolvedPlan.markdownPlan,
      transitionPolicy,
      editingBlueprint: derivedDefaults.editingBlueprint,
      editingBlueprintPath: args.editingBlueprintPath,
      naturalLanguagePlan: derivedDefaults.naturalLanguagePlan,
      referenceBlueprintPath: args.referenceBlueprintPath,
      review,
      markdownReport,
      assemblyReview,
      sequence: createdSequence,
      imported,
      placements,
      effects,
      transitions,
      animations,
      tracks
    };
  }

  private async assembleProductSpotClosedLoop(args: ClosedLoopAssemblyArgs): Promise<any> {
    const resolvedBlueprintPath = typeof args.editingBlueprintPath === 'string' && args.editingBlueprintPath.trim().length > 0
      ? args.editingBlueprintPath.trim()
      : typeof args.researchTaskDir === 'string' && args.researchTaskDir.trim().length > 0
        ? resolve(args.researchTaskDir.trim(), 'blueprint.json')
        : undefined;

    if (!resolvedBlueprintPath) {
      return {
        success: false,
        blocked: true,
        error: 'assemble_product_spot_closed_loop requires editingBlueprintPath or researchTaskDir.',
      };
    }

    const planResult = executeAgentTask({
      goal: args.goal,
      editingBlueprintPath: resolvedBlueprintPath,
    });
    if (!planResult.ok) {
      return {
        success: false,
        blocked: true,
        error: planResult.cannotPlan?.reason ?? 'Unable to plan closed-loop blueprint assembly.',
        plan: planResult.plan,
      };
    }

    const state = createExecutionState(planResult.plan, args.goal);
    const minimumBlueprintAdherenceScore = Number.isFinite(args.minimumBlueprintAdherenceScore)
      ? Math.max(0, Number(args.minimumBlueprintAdherenceScore))
      : 70;
    const maxAllowedBlueprintDeviations = Number.isFinite(args.maxAllowedBlueprintDeviations)
      ? Math.max(0, Math.floor(Number(args.maxAllowedBlueprintDeviations)))
      : 2;

    let loadedBlueprintResult: ReturnType<typeof loadEditingBlueprint> | undefined;
    let blueprintReviewResult:
      | ReturnType<typeof executeBlueprintReview>
      | undefined;
    let assemblyResult: any;
    let comparisonResult:
      | ReturnType<typeof compareResultToBlueprint>
      | undefined;
    let criticResult:
      | ReturnType<typeof criticEditResult>
      | undefined;
    let subtitleAutomation: ClosedLoopSubtitleAutomation | undefined;
    let beatMarkerAutomation: ClosedLoopBeatMarkerAutomation | undefined;
    let manualKeyframePlan: ClosedLoopManualKeyframeStep[] = [];
    let manualEffectChecklist: ClosedLoopManualEffectItem[] = [];
    let augmentedTimelineData: TimelineSnapshot | undefined;

    const ensureClosedLoopEnhancements = async (
      sequenceId: string,
      blueprint: EditingBlueprint,
    ): Promise<TimelineSnapshot> => {
      if (!subtitleAutomation) {
        subtitleAutomation = await this.maybeGenerateClosedLoopSubtitles({
          blueprint,
          sequenceId,
          subtitleSourcePath: args.subtitleSourcePath,
          subtitleLanguage: args.subtitleLanguage,
          subtitleBackend: args.subtitleBackend,
          captionFormat: args.captionFormat,
        });
      }

      if (!beatMarkerAutomation) {
        beatMarkerAutomation = await this.maybeCreateClosedLoopBeatMarkers({
          blueprint,
          sequenceId,
          bgmPath: args.bgmPath,
          beatMarkerPrefix: args.beatMarkerPrefix,
          beatsPerBar: args.beatsPerBar,
          placements: Array.isArray(assemblyResult?.placements) ? assemblyResult.placements : [],
          clipDuration:
            typeof assemblyResult?.clipDuration === 'number' && Number.isFinite(assemblyResult.clipDuration)
              ? assemblyResult.clipDuration
              : typeof args.clipDuration === 'number' && Number.isFinite(args.clipDuration)
                ? args.clipDuration
                : 4,
        });
      }

      if (manualKeyframePlan.length === 0) {
        manualKeyframePlan = this.buildManualKeyframePlan({
          blueprint,
          assemblyResult,
          beatMarkers: beatMarkerAutomation,
          clipDuration:
            typeof assemblyResult?.clipDuration === 'number' && Number.isFinite(assemblyResult.clipDuration)
              ? assemblyResult.clipDuration
              : typeof args.clipDuration === 'number' && Number.isFinite(args.clipDuration)
                ? args.clipDuration
                : 4,
        });
      }

      if (manualEffectChecklist.length === 0) {
        manualEffectChecklist = this.buildManualEffectChecklist({
          blueprint,
          assemblyResult,
        });
      }

      if (!augmentedTimelineData) {
        const baseTimelineData = await this.captureTimelineSnapshot(sequenceId);
        augmentedTimelineData = this.mergeClosedLoopTimelineSnapshot({
          base: baseTimelineData,
          assemblyResult,
          subtitleAutomation,
        });
      }

      return augmentedTimelineData;
    };

    while (true) {
      const step = getNextStep(state);
      if (!step) {
        break;
      }

      switch (step.tool) {
        case 'load_editing_blueprint': {
          try {
            loadedBlueprintResult = loadEditingBlueprint({
              editingBlueprintPath: resolvedBlueprintPath,
            });
            handleStepResult(state, step.id, {
              ok: true,
              data: loadedBlueprintResult,
            });
          } catch (error) {
            handleStepResult(state, step.id, {
              ok: false,
              error: {
                error_code: 'STYLE_MISMATCH',
                message: error instanceof Error ? error.message : String(error),
                retryable: false,
              },
            });
          }
          break;
        }
        case 'review_blueprint_reasonability': {
          const blueprint = state.blueprint ?? loadedBlueprintResult?.blueprint;
          if (!blueprint) {
            handleStepResult(state, step.id, {
              ok: false,
              error: {
                error_code: 'STYLE_MISMATCH',
                message: 'EditingBlueprint is unavailable for review.',
                retryable: false,
              },
            });
            break;
          }
          blueprintReviewResult = executeBlueprintReview({
            blueprint,
            goal: args.goal,
          });
          if (blueprintReviewResult.review.approved) {
            handleStepResult(state, step.id, {
              ok: true,
              data: blueprintReviewResult,
            });
          } else {
            handleStepResult(state, step.id, {
              ok: false,
              error: {
                error_code: 'ASSEMBLY_BLOCKED',
                message: `Blueprint review blocked assembly: ${blueprintReviewResult.review.issues.join('; ')}`,
                retryable: false,
              },
            });
          }
          break;
        }
        case 'assemble_product_spot': {
          assemblyResult = await this.assembleProductSpot({
            sequenceName: args.sequenceName,
            assetPaths: args.assetPaths,
            docxPath: args.docxPath,
            mediaManifestPath: args.mediaManifestPath,
            autoPlanFromManifest: args.autoPlanFromManifest,
            maxPlannedAssets: args.maxPlannedAssets,
            editingBlueprintPath: resolvedBlueprintPath,
            applyGuideEffects: args.applyGuideEffects,
            reviewBeforeAssemble:
              args.reviewBeforeAssemble ?? Boolean(args.docxPath && args.mediaManifestPath),
            allowReviewWarnings: args.allowReviewWarnings,
            mediaPolicy: args.mediaPolicy,
            clipDuration: args.clipDuration,
            videoTrackIndex: args.videoTrackIndex,
            transitionName: args.transitionName,
            transitionPolicy: args.transitionPolicy,
            transitionDuration: args.transitionDuration,
            motionStyle: args.motionStyle,
          });

          if (assemblyResult?.success) {
            handleStepResult(state, step.id, {
              ok: true,
              data: assemblyResult,
            });
          } else {
            handleStepResult(state, step.id, {
              ok: false,
              error: {
                error_code: assemblyResult?.blocked ? 'ASSEMBLY_BLOCKED' : 'STYLE_MISMATCH',
                message: assemblyResult?.error ?? 'assemble_product_spot failed during closed-loop execution.',
                retryable: false,
              },
            });
          }
          break;
        }
        case 'compare_result_to_blueprint': {
          const sequenceId = assemblyResult?.sequence?.id;
          const blueprint = state.blueprint ?? loadedBlueprintResult?.blueprint;
          if (!sequenceId || !blueprint) {
            handleStepResult(state, step.id, {
              ok: false,
              error: {
                error_code: 'STYLE_MISMATCH',
                message: 'Cannot compare to blueprint without both sequenceId and blueprint.',
                retryable: false,
              },
            });
            break;
          }
          const timelineData = await ensureClosedLoopEnhancements(sequenceId, blueprint);
          comparisonResult = compareResultToBlueprint(timelineData, blueprint);
          handleStepResult(state, step.id, {
            ok: true,
            data: comparisonResult,
          });
          break;
        }
        case 'critic_edit_result': {
          const sequenceId = assemblyResult?.sequence?.id;
          const blueprint = state.blueprint ?? loadedBlueprintResult?.blueprint;
          if (!sequenceId || !blueprint) {
            handleStepResult(state, step.id, {
              ok: false,
              error: {
                error_code: 'STYLE_MISMATCH',
                message: 'Cannot run critic without both sequenceId and blueprint.',
                retryable: false,
              },
            });
            break;
          }
          const timelineData = await ensureClosedLoopEnhancements(sequenceId, blueprint);
          criticResult = criticEditResult({
            goal: args.goal,
            scenario: 'viral_style',
            sequenceId,
            blueprint,
            editingBlueprintPath: resolvedBlueprintPath,
            successCriteria: planResult.plan.successCriteria,
            timelineData,
          });
          handleStepResult(state, step.id, {
            ok: true,
            data: criticResult,
          });
          break;
        }
        default:
          handleStepResult(state, step.id, {
            ok: false,
            error: {
              error_code: 'STYLE_MISMATCH',
              message: `Unsupported closed-loop step: ${step.tool}`,
              retryable: false,
            },
          });
          break;
      }

      if (state.aborted) {
        break;
      }
    }

    const executionReport = generateExecutionReport(state);
    const qualityGateReasons: string[] = [];
    const comparison = comparisonResult?.comparison;
    const subtitleAutomationPassed =
      subtitleAutomation?.required === false || subtitleAutomation?.success === true;
    const beatMarkerPassed =
      beatMarkerAutomation?.required === false || beatMarkerAutomation?.success === true;
    const manualKeyframeGuidanceReady = manualKeyframePlan.length > 0;
    const blueprintAdherencePassed = Boolean(
      comparison
      && comparison.adherenceScore >= minimumBlueprintAdherenceScore
      && comparison.deviations.length <= maxAllowedBlueprintDeviations,
    );

    if (!blueprintReviewResult?.review.approved) {
      qualityGateReasons.push('review_blueprint_reasonability 未通过');
    }
    if (!comparison) {
      qualityGateReasons.push('compare_result_to_blueprint 未产出结果');
    } else {
      if (comparison.adherenceScore < minimumBlueprintAdherenceScore) {
        qualityGateReasons.push(
          `蓝图匹配分数 ${comparison.adherenceScore} 低于阈值 ${minimumBlueprintAdherenceScore}`,
        );
      }
      if (comparison.deviations.length > maxAllowedBlueprintDeviations) {
        qualityGateReasons.push(
          `蓝图偏差数 ${comparison.deviations.length} 超过上限 ${maxAllowedBlueprintDeviations}`,
        );
      }
    }
    if (criticResult?.critic?.passed === false) {
      qualityGateReasons.push('critic_edit_result 未通过');
    }
    if (!executionReport.canDeliver) {
      qualityGateReasons.push(...executionReport.unmetCriteria);
    }
    if (!subtitleAutomationPassed) {
      qualityGateReasons.push(
        subtitleAutomation?.reason
          ?? 'Blueprint 要求字幕拼接，但本轮未成功生成字幕或未提供字幕源。',
      );
    }
    if (!beatMarkerPassed) {
      qualityGateReasons.push(
        beatMarkerAutomation?.warnings?.[0]
          ?? beatMarkerAutomation?.failures?.[0]?.error
          ?? 'Blueprint 要求 BGM 卡点标记，但本轮未成功创建节拍 marker。',
      );
    }
    if (!manualKeyframeGuidanceReady) {
      qualityGateReasons.push('链路未返回手工关键帧指引。');
    }

    const qualityGate = {
      passed:
        executionReport.canDeliver
        && blueprintAdherencePassed
        && blueprintReviewResult?.review.approved === true
        && criticResult?.critic?.passed === true
        && subtitleAutomationPassed
        && beatMarkerPassed
        && manualKeyframeGuidanceReady,
      blueprintReviewPassed: blueprintReviewResult?.review.approved === true,
      blueprintAdherencePassed,
      criticPassed: criticResult?.critic?.passed === true,
      executionCanDeliver: executionReport.canDeliver,
      subtitleAutomationPassed,
      beatMarkerPassed,
      manualKeyframeGuidanceReady,
      minimumBlueprintAdherenceScore,
      maxAllowedBlueprintDeviations,
      actualAdherenceScore: comparison?.adherenceScore ?? null,
      actualDeviationCount: comparison?.deviations.length ?? null,
      reasons: [...new Set(qualityGateReasons)],
    };

    return {
      success: qualityGate.passed,
      blocked: !qualityGate.passed,
      message: qualityGate.passed
        ? 'Closed-loop product spot assembled successfully'
        : 'Closed-loop product spot did not pass all delivery gates',
      goal: args.goal,
      scenario: 'viral_style',
      plan: planResult.plan,
      editingBlueprintPath: resolvedBlueprintPath,
      editingBlueprint: state.blueprint,
      blueprintReview: blueprintReviewResult?.review ?? null,
      assembly: assemblyResult ?? null,
      comparison: comparisonResult?.comparison ?? null,
      critic: criticResult?.critic ?? null,
      subtitleAutomation: subtitleAutomation ?? null,
      beatMarkers: beatMarkerAutomation ?? null,
      manualKeyframePlan,
      manualEffectChecklist,
      executionReport,
      failureReport: qualityGate.passed ? null : generateFailureReport(state),
      qualityGate,
      sequence: assemblyResult?.sequence ?? null,
    };
  }

  private async buildBrandSpotFromMogrtAndAssets(args: {
    sequenceName: string;
    assetPaths?: string[];
    docxPath?: string;
    mediaManifestPath?: string;
    autoPlanFromManifest?: boolean;
    maxPlannedAssets?: number;
    referenceBlueprintPath?: string;
    editingBlueprintPath?: string;
    naturalLanguagePrompt?: string;
    applyGuideEffects?: boolean;
    reviewBeforeAssemble?: boolean;
    allowReviewWarnings?: boolean;
    mediaPolicy?: typeof REFERENCE_ONLY_MEDIA_POLICY;
    mogrtPath?: string;
    clipDuration?: number;
    videoTrackIndex?: number;
    titleTrackIndex?: number;
    titleStartTime?: number;
    transitionName?: string;
    transitionPolicy?: string;
    transitionDuration?: number;
    motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
  }): Promise<any> {
    const assemblyArgs: {
      sequenceName: string;
      assetPaths?: string[];
      docxPath?: string;
      mediaManifestPath?: string;
      autoPlanFromManifest?: boolean;
      maxPlannedAssets?: number;
      referenceBlueprintPath?: string;
      editingBlueprintPath?: string;
      naturalLanguagePrompt?: string;
      applyGuideEffects?: boolean;
      reviewBeforeAssemble?: boolean;
      allowReviewWarnings?: boolean;
      mediaPolicy?: typeof REFERENCE_ONLY_MEDIA_POLICY;
      clipDuration?: number;
      videoTrackIndex?: number;
      transitionName?: string;
      transitionPolicy?: string;
      transitionDuration?: number;
      motionStyle?: 'push_in' | 'pull_out' | 'alternate' | 'none';
    } = {
      sequenceName: args.sequenceName,
      assetPaths: args.assetPaths,
      mediaPolicy: args.mediaPolicy,
      docxPath: args.docxPath,
      mediaManifestPath: args.mediaManifestPath,
      autoPlanFromManifest: args.autoPlanFromManifest,
      maxPlannedAssets: args.maxPlannedAssets,
      referenceBlueprintPath: args.referenceBlueprintPath,
      editingBlueprintPath: args.editingBlueprintPath,
      naturalLanguagePrompt: args.naturalLanguagePrompt,
      applyGuideEffects: args.applyGuideEffects,
      reviewBeforeAssemble: args.reviewBeforeAssemble,
      allowReviewWarnings: args.allowReviewWarnings,
    };
    if (args.clipDuration !== undefined) {
      assemblyArgs.clipDuration = args.clipDuration;
    }
    if (args.videoTrackIndex !== undefined) {
      assemblyArgs.videoTrackIndex = args.videoTrackIndex;
    }
    if (args.transitionName !== undefined) {
      assemblyArgs.transitionName = args.transitionName;
    }
    if (args.transitionPolicy !== undefined) {
      assemblyArgs.transitionPolicy = args.transitionPolicy;
    }
    if (args.transitionDuration !== undefined) {
      assemblyArgs.transitionDuration = args.transitionDuration;
    }
    if (args.motionStyle !== undefined) {
      assemblyArgs.motionStyle = args.motionStyle;
    }

    const assembly = await this.assembleProductSpot(assemblyArgs);

    if (!assembly.success || !assembly.sequence?.id) {
      return assembly;
    }

    const overlays = [];
    if (args.mogrtPath) {
      overlays.push(await this.importMogrt(
        assembly.sequence.id,
        args.mogrtPath,
        args.titleStartTime ?? 0.4,
        args.titleTrackIndex ?? 1,
        0,
      ));
    } else {
      overlays.push({
        success: true,
        skipped: true,
        note: 'No MOGRT supplied; brand title overlay was skipped'
      });
    }

    const polish = [];
    const placedClips = Array.isArray(assembly.placements) ? assembly.placements : [];
    const middleIndex = Math.floor(placedClips.length / 2);
    if (placedClips[middleIndex]?.id) {
      polish.push(await this.applyEffect(placedClips[middleIndex].id, 'Gaussian Blur'));
    }
    const lastClip = placedClips[placedClips.length - 1];
    if (lastClip?.id) {
      polish.push(await this.colorCorrect(lastClip.id, {
        clipId: lastClip.id,
        brightness: 4,
        contrast: 8,
        saturation: 6
      }));
    }

    const refreshedTracks = await this.listSequenceTracks(assembly.sequence.id);
    const assemblyReview = reviewAssemblyExecution({
      requestedTransitionName:
        typeof assembly.transitionName === 'string' && assembly.transitionName.trim().length > 0
          ? assembly.transitionName.trim()
          : null,
      expectedTransitionCount: assembly.transitionName
        ? Math.max(placedClips.length - 1, 0)
        : 0,
      expectedClipCount: Array.isArray(assembly.assetPaths) ? assembly.assetPaths.length : placedClips.length,
      expectedAssetPaths: Array.isArray(assembly.assetPaths) ? assembly.assetPaths : undefined,
      assembledTrackIndex: args.videoTrackIndex ?? 0,
      requestedEffectNames:
        args.applyGuideEffects === true
          ? assembly.plan?.effectPlan?.globalClipEffects ?? []
          : [],
      motionStyle: assembly.motionStyle ?? args.motionStyle ?? 'none',
      mogrtRequested: Boolean(args.mogrtPath),
      effects: Array.isArray(assembly.effects) ? assembly.effects : [],
      transitions: Array.isArray(assembly.transitions) ? assembly.transitions : [],
      animations: Array.isArray(assembly.animations) ? assembly.animations : [],
      overlays,
      polish,
      tracks: refreshedTracks,
      referenceBlueprintPath: args.referenceBlueprintPath,
    });
    if (assemblyReview.status === 'blocked') {
      return {
        ...assembly,
        success: false,
        blocked: true,
        error: 'Assembly execution review blocked the branded result.',
        assemblyReview,
        overlays,
        polish,
        tracks: refreshedTracks,
      };
    }

    return {
      success: true,
      ...assembly,
      message: 'Brand spot assembled successfully',
      assemblyReview,
      overlays,
      polish,
      mediaPolicy: assembly.mediaPolicy ?? REFERENCE_ONLY_MEDIA_POLICY,
      copyOperations: assembly.copyOperations ?? 0,
      tracks: refreshedTracks
    };
  }

  // Project Management Implementation
  private async createProject(name: string, location: string): Promise<any> {
    try {
      const result = await this.bridge.createProject(name, location);
      return {
        success: true,
        message: `Project "${name}" created successfully`,
        projectPath: `${location}/${name}.prproj`,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async openProject(path: string): Promise<any> {
    try {
      const result = await this.bridge.openProject(path);
      return {
        success: true,
        message: `Project opened successfully`,
        projectPath: path,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async saveProject(): Promise<any> {
    try {
      await this.bridge.saveProject();
      return { 
        success: true, 
        message: 'Project saved successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async saveProjectAs(name: string, location: string): Promise<any> {
    const newPathLiteral = this.toExtendScriptString(`${location}/${name}.prproj`);
    const script = `
      try {
        var project = app.project;
        var newPath = ${newPathLiteral};
        project.saveAs(newPath);
        
        return JSON.stringify({
          success: true,
          message: "Project saved as: " + newPath,
          newPath: newPath
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.runScript(script);
  }

  // Media Management Implementation
  private async importMedia(filePath: string, binName?: string, importMode?: typeof REFERENCE_ONLY_MEDIA_POLICY): Promise<any> {
    const resolvedImportMode = importMode ?? REFERENCE_ONLY_MEDIA_POLICY;
    if (resolvedImportMode !== REFERENCE_ONLY_MEDIA_POLICY) {
      return {
        success: false,
        error: `Unsupported import mode: ${resolvedImportMode}. Only ${REFERENCE_ONLY_MEDIA_POLICY} is supported.`,
        filePath: filePath,
        importMode: resolvedImportMode
      };
    }

    const generatedArtifactError = getGeneratedVerificationArtifactImportError(filePath);
    if (generatedArtifactError) {
      return {
        success: false,
        error: 'generated_verification_artifact_not_allowed',
        details: generatedArtifactError,
        filePath,
        binName: binName || 'Root',
        mediaPolicy: resolvedImportMode,
        copied: false,
      };
    }

    try {
      const result: any = await this.bridge.importMedia(filePath);
      if (!result.success) {
        return {
          ...result,
          filePath: filePath,
          binName: binName || 'Root',
          mediaPolicy: resolvedImportMode,
          copied: false
        };
      }
      return {
        success: true,
        message: `Media imported successfully`,
        filePath: filePath,
        binName: binName || 'Root',
        mediaPolicy: resolvedImportMode,
        copied: false,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import media: ${error instanceof Error ? error.message : String(error)}`,
        filePath: filePath,
        importMode: resolvedImportMode
      };
    }
  }

  private async importFolder(folderPath: string, binName?: string, recursive = false): Promise<any> {
    const folderPathLiteral = this.toExtendScriptString(folderPath);
    const recursiveFlag = this.coerceBooleanFlag(recursive, false);
    const binLookupScript = binName
      ? `targetBin = __findChildByName(app.project.rootItem, ${this.toExtendScriptString(binName)}) || app.project.rootItem;`
      : '';
    const script = `
      try {
        var folder = new Folder(${folderPathLiteral});
        if (!folder.exists) {
          return JSON.stringify({
            success: false,
            error: "Folder not found: " + ${folderPathLiteral}
          });
        }
        var importedItems = [];
        var errors = [];

        function collectChildNodeIds(parent) {
          var ids = {};
          if (!parent || !parent.children) return ids;
          for (var childIndex = 0; childIndex < parent.children.numItems; childIndex++) {
            var child = parent.children[childIndex];
            ids[child.nodeId] = true;
          }
          return ids;
        }

        function findImportedChild(parent, filePath, fileName, existingIds) {
          if (!parent || !parent.children) return null;
          var fallback = null;
          for (var childIndex = parent.children.numItems - 1; childIndex >= 0; childIndex--) {
            var child = parent.children[childIndex];
            if (existingIds && existingIds[child.nodeId]) {
              continue;
            }
            try {
              if (child.getMediaPath && child.getMediaPath() === filePath) {
                return child;
              }
            } catch (e) {}
            if (!fallback && child.name === fileName) {
              fallback = child;
            }
          }
          if (fallback) {
            return fallback;
          }
          if (existingIds) {
            return findImportedChild(parent, filePath, fileName, null);
          }
          return null;
        }
        
        function importFiles(dir, targetBin) {
          var files = dir.getFiles();
          for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file instanceof File) {
              try {
                var existingChildIds = collectChildNodeIds(targetBin);
                var importResult = app.project.importFiles([file.fsName], true, targetBin, false);
                if (!importResult) {
                  throw new Error("Failed to import file");
                }
                var item = findImportedChild(targetBin, file.fsName, file.name, existingChildIds);
                if (!item) {
                  throw new Error("Import completed but imported item could not be located");
                }
                importedItems.push({
                  name: file.name,
                  path: file.fsName,
                  id: item.nodeId
                });
              } catch (e) {
                errors.push({
                  file: file.name,
                  error: e.toString()
                });
              }
            } else if (file instanceof Folder && ${recursiveFlag} === 1) {
              importFiles(file, targetBin);
            }
          }
        }
        
        var targetBin = app.project.rootItem;
        ${binLookupScript}
        
        importFiles(folder, targetBin);
        
        return JSON.stringify({
          success: true,
          importedItems: importedItems,
          errors: errors,
          totalImported: importedItems.length,
          totalErrors: errors.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.runScript(script);
  }

  private async createBin(name: string, parentBinName?: string): Promise<any> {
    const nameLiteral = this.toExtendScriptString(name);
    const parentBinLookupScript = parentBinName
      ? `parentBin = __findChildByName(app.project.rootItem, ${this.toExtendScriptString(parentBinName)}) || app.project.rootItem;`
      : '';
    const parentBinLiteral = parentBinName ? this.toExtendScriptString(parentBinName) : '"Root"';
    const script = `
      try {
        var parentBin = app.project.rootItem;
        ${parentBinLookupScript}

        var newBin = parentBin.createBin(${nameLiteral});

        return JSON.stringify({
          success: true,
          binName: ${nameLiteral},
          binId: newBin.nodeId,
          parentBin: ${parentBinLiteral}
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  // Sequence Management Implementation
  private async createSequence(
    name: string,
    presetPath?: string,
    width?: number,
    height?: number,
    frameRate?: number,
    sampleRate?: number,
    mediaPath?: string,
    avoidCreateNewSequence?: boolean,
  ): Promise<any> {
    try {
      const settings: PremiereSequenceSettings | undefined = !presetPath && (
        width !== undefined
        || height !== undefined
        || frameRate !== undefined
        || sampleRate !== undefined
      )
        ? {
            width,
            height,
            frameRate,
            sampleRate,
          }
        : undefined;
      const createOptions: PremiereSequenceCreateOptions | undefined = (
        (typeof mediaPath === 'string' && mediaPath.trim())
        || avoidCreateNewSequence === true
      )
        ? {
            mediaPath,
            avoidCreateNewSequence,
          }
        : undefined;
      const result = createOptions
        ? await this.bridge.createSequence(name, presetPath, settings, createOptions)
        : await this.bridge.createSequence(name, presetPath, settings);
      return {
        success: true,
        message: `Sequence "${name}" created successfully`,
        sequenceName: name,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create sequence: ${error instanceof Error ? error.message : String(error)}`,
        sequenceName: name
      };
    }
  }

  private async buildTimelineFromXml(
    sequenceName: string,
    clips: TimelineXmlClipArgs[],
    transitionDurationSec?: number,
    audioProjectItemId?: string,
    frameRate?: number,
    frameWidth?: number,
    frameHeight?: number,
    allowExperimentalMotion = false,
  ): Promise<any> {
    try {
      if (!sequenceName.trim()) {
        return { success: false, error: 'Sequence name is required' };
      }
      if (!clips.length) {
        return { success: false, error: 'At least one clip is required' };
      }
      const experimentalMotionFields = Array.from(
        new Set(
          clips.flatMap((clip) => {
            const fields: string[] = [];
            if (clip.centerFrom !== undefined || clip.centerTo !== undefined) {
              fields.push('center');
            }
            if (clip.rotationFrom !== undefined || clip.rotationTo !== undefined) {
              fields.push('rotation');
            }
            return fields;
          }),
        ),
      );
      if (experimentalMotionFields.length > 0 && !allowExperimentalMotion) {
        return {
          success: false,
          blocked: true,
          error:
            'XML center/rotation motion is experimental and disabled by default because Premiere Pro may hang during XML import. Remove those fields or pass allowExperimentalMotion: true.',
          sequenceName,
          clipCount: clips.length,
          experimentalMotionFields,
        };
      }

      const targetFrameSize = await this.resolveTimelineXmlFrameSize(frameWidth, frameHeight);
      const itemLookup = await this.resolveProjectItemsById([
        ...clips.map((clip) => clip.projectItemId),
        ...(audioProjectItemId ? [audioProjectItemId] : []),
      ]);

      const xmlClips: FcpXmlClip[] = clips.map((clip) => {
        const projectItem = itemLookup.get(clip.projectItemId);
        if (!projectItem) {
          throw new Error(`Project item not found: ${clip.projectItemId}`);
        }
        if (projectItem.type !== 'footage') {
          throw new Error(`Project item is not footage: ${clip.projectItemId}`);
        }
        if (!projectItem.mediaPath) {
          throw new Error(`Project item does not expose a mediaPath: ${clip.projectItemId}`);
        }
        const sourceFrameSize = this.resolveProjectItemFrameSize(projectItem);
        const fitScalePercent = sourceFrameSize
          ? this.computeFitScalePercent(sourceFrameSize, targetFrameSize)
          : undefined;

        return {
          path: projectItem.mediaPath,
          name: projectItem.name,
          durationSec: clip.durationSec ?? 5,
          sourceWidth: sourceFrameSize?.width,
          sourceHeight: sourceFrameSize?.height,
          ...this.normalizeTimelineXmlClipMotion(clip, fitScalePercent),
        };
      });

      const audioItem = audioProjectItemId
        ? itemLookup.get(audioProjectItemId)
        : undefined;
      if (audioProjectItemId && !audioItem) {
        throw new Error(`Audio project item not found: ${audioProjectItemId}`);
      }
      if (audioItem?.type !== undefined && audioItem.type !== 'footage') {
        throw new Error(`Audio project item is not footage: ${audioProjectItemId}`);
      }
      if (audioProjectItemId && !audioItem?.mediaPath) {
        throw new Error(`Audio project item does not expose a mediaPath: ${audioProjectItemId}`);
      }

      const xmlContent = buildFcpXml({
        sequenceName,
        frameRate,
        frameWidth: targetFrameSize.width,
        frameHeight: targetFrameSize.height,
        clips: xmlClips,
        transitionDurationSec,
        audioPath: audioItem?.mediaPath,
      });
      const xmlPath = join(
        this.bridge.getBridgeDirectory(),
        `timeline-${randomUUID()}.xml`,
      );
      await writeFile(xmlPath, xmlContent, 'utf8');
      const tempProjectDirectory = join(
        this.bridge.getBridgeDirectory(),
        `timeline-project-${randomUUID()}`,
      );
      await mkdir(tempProjectDirectory, { recursive: true });

      const openXmlProjectResult = await this.runScript(`
        try {
          function normalizePath(value) {
            return String(value || "").split("\\\\").join("/").toLowerCase();
          }
          var xmlFile = new File(${JSON.stringify(xmlPath)});
          if (!xmlFile.exists) return JSON.stringify({ success: false, error: "xml_file_not_found" });
          if (!app || typeof app.openFCPXML !== "function") {
            return JSON.stringify({ success: false, error: "open_fcp_xml_unavailable" });
          }
          var originalProjectPath = "";
          try { originalProjectPath = String(app.project.path || ""); } catch (_projectPathError) {}
          if (!originalProjectPath) {
            return JSON.stringify({ success: false, error: "original_project_path_unavailable" });
          }
          try {
            if (app.project && typeof app.project.save === "function") {
              app.project.save();
            }
          } catch (_saveProjectError) {}
          var opened = app.openFCPXML(xmlFile.fsName, ${JSON.stringify(tempProjectDirectory)});
          return JSON.stringify({
            success: !!opened,
            openResult: !!opened,
            originalProjectPath: originalProjectPath,
            tempProjectDirectory: ${JSON.stringify(tempProjectDirectory)},
            xmlPath: xmlFile.fsName
          });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `) as {
        success?: boolean;
        openResult?: boolean;
        originalProjectPath?: string;
        tempProjectDirectory?: string;
        xmlPath?: string;
        error?: string;
      };

      if (!openXmlProjectResult?.success || !openXmlProjectResult.originalProjectPath) {
        return {
          success: false,
          error: openXmlProjectResult?.error ?? 'open_fcp_xml_failed',
          xmlPath,
          createdSequences: [],
        };
      }

      let tempProjectResult: {
        success?: boolean;
        error?: string;
        tempProjectPath?: string;
        sequence?: {
          id: string;
          name: string;
          duration?: number;
          videoTrackCount?: number;
          audioTrackCount?: number;
        };
        createdSequences?: Array<Record<string, unknown>>;
      } = {
        success: false,
        error: 'temp_project_not_detected_after_open_fcp_xml',
        createdSequences: [],
      };
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollTempProjectResult = await this.runScript(`
          try {
            function normalizePath(value) {
              return String(value || "").split("\\\\").join("/").toLowerCase();
            }
            var currentProjectPath = "";
            try { currentProjectPath = String(app.project.path || ""); } catch (_currentProjectPathError) {}
            var normalizedCurrentProjectPath = normalizePath(currentProjectPath);
            var normalizedOriginalProjectPath = normalizePath(${JSON.stringify(openXmlProjectResult.originalProjectPath)});
            var normalizedTempProjectDirectory = normalizePath(${JSON.stringify(tempProjectDirectory)});
            var onTempProject = !!normalizedCurrentProjectPath
              && normalizedCurrentProjectPath !== normalizedOriginalProjectPath
              && normalizedCurrentProjectPath.indexOf(normalizedTempProjectDirectory) === 0;
            if (!onTempProject) {
              return JSON.stringify({ success: false, error: "not_ready_yet", createdSequences: [], currentProjectPath: currentProjectPath });
            }
            var createdSequences = [];
            for (var i = 0; i < app.project.sequences.numSequences; i++) {
              var seq = app.project.sequences[i];
              createdSequences.push({
                id: seq.sequenceID,
                name: seq.name,
                videoTrackCount: seq.videoTracks.numTracks,
                audioTrackCount: seq.audioTracks.numTracks
              });
            }
            if (!createdSequences.length) {
              return JSON.stringify({ success: false, error: "not_ready_yet", createdSequences: [], currentProjectPath: currentProjectPath });
            }
            var targetName = ${JSON.stringify(sequenceName)};
            var detectedSequence = null;
            for (var ci = 0; ci < createdSequences.length; ci++) {
              if (createdSequences[ci].name === targetName) {
                detectedSequence = createdSequences[ci];
                break;
              }
            }
            if (!detectedSequence) detectedSequence = createdSequences[0];
            return JSON.stringify({
              success: true,
              tempProjectPath: currentProjectPath,
              sequence: detectedSequence,
              createdSequences: createdSequences
            });
          } catch (e) {
            return JSON.stringify({ success: false, error: e.toString(), createdSequences: [] });
          }
        `) as typeof tempProjectResult;
        if (pollTempProjectResult?.success) {
          tempProjectResult = pollTempProjectResult;
          break;
        }
        if (pollTempProjectResult?.error !== 'not_ready_yet') {
          tempProjectResult = pollTempProjectResult;
          break;
        }
      }

      if (!tempProjectResult?.success || !tempProjectResult.sequence || !tempProjectResult.tempProjectPath) {
        return {
          success: false,
          error: tempProjectResult?.error ?? 'temp_project_not_detected_after_open_fcp_xml',
          xmlPath,
          createdSequences: tempProjectResult?.createdSequences ?? [],
        };
      }

      await this.bridge.openProject(openXmlProjectResult.originalProjectPath);

      let reopenOriginalProjectResult: { success?: boolean; error?: string; currentProjectPath?: string } = {
        success: false,
        error: 'original_project_not_reopened',
      };
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const reopenPollResult = await this.runScript(`
          try {
            function normalizePath(value) {
              return String(value || "").split("\\\\").join("/").toLowerCase();
            }
            var currentProjectPath = "";
            try { currentProjectPath = String(app.project.path || ""); } catch (_currentProjectPathError) {}
            if (!currentProjectPath || normalizePath(currentProjectPath) !== normalizePath(${JSON.stringify(openXmlProjectResult.originalProjectPath)})) {
              return JSON.stringify({ success: false, error: "not_ready_yet", currentProjectPath: currentProjectPath });
            }
            return JSON.stringify({ success: true, currentProjectPath: currentProjectPath });
          } catch (e) {
            return JSON.stringify({ success: false, error: e.toString() });
          }
        `) as typeof reopenOriginalProjectResult;
        if (reopenPollResult?.success) {
          reopenOriginalProjectResult = reopenPollResult;
          break;
        }
        if (reopenPollResult?.error !== 'not_ready_yet') {
          reopenOriginalProjectResult = reopenPollResult;
          break;
        }
      }

      if (!reopenOriginalProjectResult?.success) {
        return {
          success: false,
          error: reopenOriginalProjectResult?.error ?? 'original_project_not_reopened',
          xmlPath,
          tempProjectPath: tempProjectResult.tempProjectPath,
          createdSequences: tempProjectResult.createdSequences ?? [],
        };
      }

      const beforeImportResult = await this.runScript(`
        try {
          var before = {};
          for (var i = 0; i < app.project.sequences.numSequences; i++) {
            before[app.project.sequences[i].sequenceID] = true;
          }
          app.project.importSequences(${JSON.stringify(tempProjectResult.tempProjectPath)}, [${JSON.stringify(tempProjectResult.sequence.id)}]);
          return JSON.stringify({ success: true, before: before });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `) as { success?: boolean; before?: Record<string, boolean>; error?: string };

      if (!beforeImportResult?.success) {
        return {
          success: false,
          error: beforeImportResult?.error ?? 'sequence_import_from_temp_project_failed',
          xmlPath,
          tempProjectPath: tempProjectResult.tempProjectPath,
          createdSequences: tempProjectResult.createdSequences ?? [],
        };
      }

      const before = beforeImportResult.before ?? {};
      let importResult: {
        success?: boolean;
        sequence?: {
          id: string;
          name: string;
          duration?: number;
          videoTrackCount?: number;
          audioTrackCount?: number;
        };
        createdSequences?: Array<Record<string, unknown>>;
        error?: string;
      } = {
        success: false,
        error: 'sequence_not_detected_after_project_import',
        createdSequences: [],
      };
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollImportResult = await this.runScript(`
          try {
            var before = ${JSON.stringify(before)};
            var createdSequences = [];
            for (var i = 0; i < app.project.sequences.numSequences; i++) {
              var seq = app.project.sequences[i];
              if (before[seq.sequenceID]) continue;
              createdSequences.push({
                id: seq.sequenceID,
                name: seq.name,
                videoTrackCount: seq.videoTracks.numTracks,
                audioTrackCount: seq.audioTracks.numTracks
              });
            }
            if (!createdSequences.length) return JSON.stringify({ success: false, error: "not_ready_yet", createdSequences: [] });
            var targetName = ${JSON.stringify(sequenceName)};
            var detectedSequence = null;
            for (var ci = 0; ci < createdSequences.length; ci++) {
              if (createdSequences[ci].name === targetName) {
                detectedSequence = createdSequences[ci];
                break;
              }
            }
            if (!detectedSequence) detectedSequence = createdSequences[0];
            if (typeof app.project.openSequence === "function") { try { app.project.openSequence(detectedSequence.id); } catch(_openSequenceError) {} }
            return JSON.stringify({ success: true, sequence: detectedSequence, createdSequences: createdSequences });
          } catch (e) {
            return JSON.stringify({ success: false, error: e.toString(), createdSequences: [] });
          }
        `) as typeof importResult;
        if (pollImportResult?.success) {
          importResult = pollImportResult;
          break;
        }
        if (pollImportResult?.error !== 'not_ready_yet') {
          importResult = pollImportResult;
          break;
        }
      }

      if (!importResult?.success || !importResult.sequence) {
        return {
          success: false,
          error: importResult?.error ?? 'sequence_not_detected_after_project_import',
          xmlPath,
          tempProjectPath: tempProjectResult.tempProjectPath,
          createdSequences: importResult?.createdSequences ?? [],
        };
      }

      return {
        success: true,
        message: 'Timeline imported from generated FCP XML via openFCPXML temp project',
        xmlPath,
        tempProjectPath: tempProjectResult.tempProjectPath,
        importStrategy: 'openFCPXML-importSequences',
        sequenceId: importResult.sequence.id,
        sequenceName: importResult.sequence.name,
        sequence: importResult.sequence,
        createdSequences: importResult.createdSequences ?? [],
        clipCount: xmlClips.length,
        audioIncluded: Boolean(audioItem?.mediaPath),
        frameWidth: targetFrameSize.width,
        frameHeight: targetFrameSize.height,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to build timeline from XML: ${error instanceof Error ? error.message : String(error)}`,
        sequenceName,
        clipCount: clips.length,
      };
    }
  }

  private async duplicateSequence(sequenceId: string, newName: string): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const newNameLiteral = this.toExtendScriptString(newName);
    const script = `
      try {
        var originalSeq = __findSequence(${sequenceIdLiteral});
        if (!originalSeq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var newSeq = originalSeq.clone();
        newSeq.name = ${newNameLiteral};
        return JSON.stringify({
          success: true,
          originalSequenceId: ${sequenceIdLiteral},
          newSequenceId: newSeq.sequenceID,
          newName: ${newNameLiteral}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  private async deleteSequence(sequenceId: string): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var sequenceName = sequence.name;
        app.project.deleteSequence(sequence);
        return JSON.stringify({
          success: true,
          message: "Sequence deleted successfully",
          deletedSequenceId: ${sequenceIdLiteral},
          deletedSequenceName: sequenceName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  // Timeline Operations Implementation
  private async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, insertMode = 'overwrite'): Promise<any> {
    try {
      const result: any = await this.bridge.addToTimeline(sequenceId, projectItemId, trackIndex, time);
      if (!result.success) {
        return {
          ...result,
          sequenceId: sequenceId,
          projectItemId: projectItemId,
          trackIndex: trackIndex,
          time: time,
          insertMode: insertMode
        };
      }
      return {
        success: true,
        message: `Clip added to timeline successfully`,
        sequenceId: sequenceId,
        projectItemId: projectItemId,
        trackIndex: trackIndex,
        time: time,
        insertMode: insertMode,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add clip to timeline: ${error instanceof Error ? error.message : String(error)}`,
        sequenceId: sequenceId,
        projectItemId: projectItemId,
        trackIndex: trackIndex,
        time: time
      };
    }
  }

  private async removeFromTimeline(clipId: string, deleteMode = 'ripple'): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const deleteModeLiteral = this.toExtendScriptString(deleteMode);
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var clipName = clip.name;
        var isRipple = ${deleteModeLiteral} === "ripple";
        clip.remove(isRipple, true);
        return JSON.stringify({
          success: true,
          message: "Clip removed from timeline",
          clipId: ${clipIdLiteral},
          clipName: clipName,
          deleteMode: ${deleteModeLiteral}
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async moveClip(clipId: string, newTime: number, newTrackIndex?: number): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldTime = clip.start.seconds;
        var targetTrackIndex = ${newTrackIndex !== undefined ? newTrackIndex : 'info.trackIndex'};
        if (targetTrackIndex === info.trackIndex) {
          var shiftAmount = ${newTime} - oldTime;
          clip.move(shiftAmount);
          return JSON.stringify({
            success: true,
            message: "Clip moved successfully",
            clipId: ${clipIdLiteral},
            oldTime: oldTime,
            newTime: ${newTime},
            oldTrackIndex: info.trackIndex,
            trackIndex: info.trackIndex
          });
        }

        var sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "No active sequence" });

        var targetTrack = info.trackType === 'video' ? sequence.videoTracks[targetTrackIndex] : sequence.audioTracks[targetTrackIndex];
        if (!targetTrack) {
          return JSON.stringify({
            success: false,
            error: "Target " + info.trackType + " track not found at index " + targetTrackIndex
          });
        }

        var projectItem = clip.projectItem;
        if (!projectItem) {
          return JSON.stringify({ success: false, error: "Clip has no backing project item" });
        }

        var originalProjectInPoint = null;
        var originalProjectOutPoint = null;
        try { originalProjectInPoint = projectItem.getInPoint ? projectItem.getInPoint() : null; } catch (e) {}
        try { originalProjectOutPoint = projectItem.getOutPoint ? projectItem.getOutPoint() : null; } catch (e) {}

        try {
          if (projectItem.setInPoint && clip.inPoint) {
            var clipInTicks = clip.inPoint.ticks !== undefined ? clip.inPoint.ticks : __secondsToTicks(clip.inPoint.seconds);
            projectItem.setInPoint(clipInTicks, 4);
          }
          if (projectItem.setOutPoint && clip.outPoint) {
            var clipOutTicks = clip.outPoint.ticks !== undefined ? clip.outPoint.ticks : __secondsToTicks(clip.outPoint.seconds);
            projectItem.setOutPoint(clipOutTicks, 4);
          }

          targetTrack.overwriteClip(projectItem, ${newTime});
        } finally {
          try {
            if (projectItem.setInPoint && originalProjectInPoint) {
              var restoreInTicks = originalProjectInPoint.ticks !== undefined ? originalProjectInPoint.ticks : __secondsToTicks(originalProjectInPoint.seconds);
              projectItem.setInPoint(restoreInTicks, 4);
            }
          } catch (e) {}
          try {
            if (projectItem.setOutPoint && originalProjectOutPoint) {
              var restoreOutTicks = originalProjectOutPoint.ticks !== undefined ? originalProjectOutPoint.ticks : __secondsToTicks(originalProjectOutPoint.seconds);
              projectItem.setOutPoint(restoreOutTicks, 4);
            }
          } catch (e) {}
        }

        var movedClip = null;
        for (var i = 0; i < targetTrack.clips.numItems; i++) {
          var candidate = targetTrack.clips[i];
          if (candidate && candidate.projectItem && candidate.projectItem.nodeId === projectItem.nodeId && Math.abs(candidate.start.seconds - ${newTime}) < 0.1) {
            movedClip = candidate;
            break;
          }
        }
        if (!movedClip) {
          return JSON.stringify({
            success: false,
            error: "Failed to confirm clip insertion on target track; original clip was left in place",
            originalClipId: ${clipIdLiteral},
            targetTrackIndex: targetTrackIndex
          });
        }

        clip.remove(false, true);
        return JSON.stringify({
          success: true,
          message: "Clip moved successfully",
          clipId: movedClip.nodeId,
          originalClipId: ${clipIdLiteral},
          newClipId: movedClip.nodeId,
          oldTime: oldTime,
          newTime: ${newTime},
          oldTrackIndex: info.trackIndex,
          trackIndex: targetTrackIndex
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async trimClip(clipId: string, inPoint?: number, outPoint?: number, duration?: number): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const newStartExpr = inPoint !== undefined ? `oldStart + ${inPoint}` : 'oldStart';
    const newInPointExpr = inPoint !== undefined ? `oldInPoint + ${inPoint}` : 'oldInPoint';
    const newEndExpr = outPoint !== undefined
      ? `oldStart + ${outPoint}`
      : duration !== undefined
        ? `${newStartExpr} + ${duration}`
        : 'oldEnd';
    const newOutPointExpr = outPoint !== undefined
      ? `oldInPoint + ${outPoint}`
      : duration !== undefined
        ? `${newInPointExpr} + ${duration}`
        : 'oldOutPoint';
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldStart = clip.start.seconds;
        var oldEnd = clip.end.seconds;
        var oldInPoint = clip.inPoint.seconds;
        var oldOutPoint = clip.outPoint.seconds;
        var oldDuration = clip.duration.seconds;
        var requestedInPoint = ${inPoint !== undefined ? inPoint : 'null'};
        var requestedOutPoint = ${outPoint !== undefined ? outPoint : 'null'};
        var requestedDuration = ${duration !== undefined ? duration : 'null'};

        if (requestedInPoint === null && requestedOutPoint === null && requestedDuration === null) {
          return JSON.stringify({ success: false, error: "At least one trim parameter is required" });
        }
        if (requestedInPoint !== null && requestedInPoint < 0) {
          return JSON.stringify({ success: false, error: "Trim points must be non-negative" });
        }
        if (requestedOutPoint !== null && requestedOutPoint < 0) {
          return JSON.stringify({ success: false, error: "Trim points must be non-negative" });
        }
        if (requestedDuration !== null && requestedDuration <= 0) {
          return JSON.stringify({ success: false, error: "Trim duration must be positive" });
        }
        if (requestedOutPoint !== null && requestedOutPoint > oldDuration) {
          return JSON.stringify({ success: false, error: "Trim points exceed current clip duration" });
        }
        if (requestedInPoint !== null && requestedInPoint >= oldDuration) {
          return JSON.stringify({ success: false, error: "Trim points exceed current clip duration" });
        }
        if (requestedDuration !== null && requestedDuration > oldDuration) {
          return JSON.stringify({ success: false, error: "Trim points exceed current clip duration" });
        }

        var newStart = ${newStartExpr};
        var newEnd = ${newEndExpr};
        var newInPoint = ${newInPointExpr};
        var newOutPoint = ${newOutPointExpr};

        if (newEnd <= newStart || newOutPoint <= newInPoint) {
          return JSON.stringify({ success: false, error: "Trim would create a non-positive clip duration" });
        }
        if (newEnd > oldEnd || newOutPoint > oldOutPoint) {
          return JSON.stringify({ success: false, error: "Trim cannot extend beyond the current visible clip range" });
        }

        var newInTicks = __secondsToTicks(newInPoint);
        var newOutTicks = __secondsToTicks(newOutPoint);
        var canSetTrimPoints = typeof clip.setInPoint === "function" && typeof clip.setOutPoint === "function";
        var canMoveClip = typeof clip.move === "function";

        if (canSetTrimPoints) {
          if (newInPoint !== oldInPoint) {
            clip.setInPoint(newInTicks, 4);
          }
          if (newOutPoint !== oldOutPoint) {
            clip.setOutPoint(newOutTicks, 4);
          }
          if (newStart !== oldStart && canMoveClip) {
            clip.move(__secondsToTicks(newStart - oldStart));
          }
        } else {
          var fallbackStart = new Time();
          fallbackStart.seconds = newStart;
          clip.start = fallbackStart;

          var fallbackEnd = new Time();
          fallbackEnd.seconds = newEnd;
          clip.end = fallbackEnd;

          var fallbackIn = new Time();
          fallbackIn.seconds = newInPoint;
          clip.inPoint = fallbackIn;

          var fallbackOut = new Time();
          fallbackOut.seconds = newOutPoint;
          clip.outPoint = fallbackOut;
        }
        return JSON.stringify({
          success: true,
          message: "Clip trimmed successfully",
          clipId: ${clipIdLiteral},
          oldStart: oldStart,
          oldEnd: oldEnd,
          oldInPoint: oldInPoint,
          oldOutPoint: oldOutPoint,
          oldDuration: oldDuration,
          newStart: clip.start.seconds,
          newEnd: clip.end.seconds,
          newInPoint: clip.inPoint.seconds,
          newOutPoint: clip.outPoint.seconds,
          newDuration: clip.duration.seconds
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async splitClip(clipId: string, splitTime: number): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var splitSeconds = ${splitTime};
        if (splitSeconds <= info.clip.start.seconds || splitSeconds >= info.clip.end.seconds) {
          return JSON.stringify({ success: false, error: "Split time must fall within the visible clip range" });
        }
        var seq = app.project.activeSequence;
        var ticksPerFrame = seq.timebase ? parseInt(seq.timebase, 10) : 8486666;
        var totalTicks = Math.round(splitSeconds * 254016000000);
        var totalFrames = Math.floor(totalTicks / ticksPerFrame);
        var framesPerSec = Math.round(254016000000 / ticksPerFrame);
        var hours = Math.floor(totalFrames / (framesPerSec * 3600));
        var mins = Math.floor((totalFrames % (framesPerSec * 3600)) / (framesPerSec * 60));
        var secs = Math.floor((totalFrames % (framesPerSec * 60)) / framesPerSec);
        var frames = totalFrames % framesPerSec;
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var tc = pad(hours) + ":" + pad(mins) + ":" + pad(secs) + ":" + pad(frames);
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        qeTrack.razor(tc);
        return JSON.stringify({ success: true, message: "Clip split at " + tc, splitTime: ${splitTime}, timecode: tc });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  // Effects and Transitions Implementation
  private async applyEffect(clipId: string, effectName: string, parameters?: Record<string, any>): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const effectNameLiteral = this.toExtendScriptString(effectName);
    const parameterAssignments = Object.entries(parameters ?? {})
      .filter(([, value]) =>
        ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value)
      )
      .map(([paramName, value]) => {
        const paramNameLiteral = this.toExtendScriptString(paramName);
        if (Array.isArray(value)) {
          const serializedValue = JSON.stringify(value);
          if (value.length === 4) {
            const [c0, c1, c2, c3] = value;
            return `if (param.displayName === ${paramNameLiteral}) { if (param.setColorValue) { param.setColorValue(${c0}, ${c1}, ${c2}, ${c3}, 1); } else { param.setValue(${serializedValue}, 1); } appliedParameters.push(${paramNameLiteral}); matchedParameter = true; }`;
          }
          return `if (param.displayName === ${paramNameLiteral}) { param.setValue(${serializedValue}, 1); appliedParameters.push(${paramNameLiteral}); matchedParameter = true; }`;
        }
        const serializedValue = typeof value === 'string'
          ? this.toExtendScriptString(value)
          : typeof value === 'boolean'
            ? (value ? 1 : 0)
            : value;
        return `if (param.displayName === ${paramNameLiteral}) { param.setValue(${serializedValue}, 1); appliedParameters.push(${paramNameLiteral}); matchedParameter = true; }`;
      })
      .join('\n              ');
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack, effect;
        if (info.trackType === 'video') {
          qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
          effect = qe.project.getVideoEffectByName(${effectNameLiteral});
        } else {
          qeTrack = qeSeq.getAudioTrackAt(info.trackIndex);
          effect = qe.project.getAudioEffectByName(${effectNameLiteral});
        }
        if (!effect) return JSON.stringify({ success: false, error: "Effect not found: " + ${effectNameLiteral} + ". Use list_available_effects to see available effects." });
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        function normalizeName(value) {
          return String(value || "")
            .toLowerCase()
            .replace(/[\\s_\\-]+/g, " ")
            .trim();
        }
        function componentSignature(component) {
          return [component && component.matchName ? component.matchName : "", component && component.displayName ? component.displayName : ""].join("|");
        }
        function collectComponentSnapshot(componentCollection) {
          var snapshot = [];
          if (!componentCollection) {
            return snapshot;
          }
          for (var snapshotIndex = 0; snapshotIndex < componentCollection.numItems; snapshotIndex++) {
            var snapshotComponent = componentCollection[snapshotIndex];
            snapshot.push({
              index: snapshotIndex,
              displayName: snapshotComponent.displayName || "",
              matchName: snapshotComponent.matchName || "",
              signature: componentSignature(snapshotComponent)
            });
          }
          return snapshot;
        }
        function buildSignatureCounts(snapshot) {
          var counts = {};
          for (var countIndex = 0; countIndex < snapshot.length; countIndex++) {
            var signature = snapshot[countIndex].signature;
            counts[signature] = (counts[signature] || 0) + 1;
          }
          return counts;
        }
        function looksLikeRequestedEffect(component, requestedName) {
          if (!component) {
            return false;
          }
          var requested = normalizeName(requestedName);
          if (!requested) {
            return false;
          }
          var displayName = normalizeName(component.displayName);
          var matchName = normalizeName(component.matchName);
          return (
            (displayName.length > 0 && (
              displayName === requested ||
              displayName.indexOf(requested) !== -1 ||
              requested.indexOf(displayName) !== -1
            )) ||
            (matchName.length > 0 && (
              matchName === requested ||
              matchName.indexOf(requested) !== -1 ||
              requested.indexOf(matchName) !== -1
            ))
          );
        }
        var beforeComponents = collectComponentSnapshot(clip.components);
        var beforeComponentCount = beforeComponents.length;
        var beforeSignatureCounts = buildSignatureCounts(beforeComponents);
        try { clip.setSelected(1, 1); } catch (_selErr) {}
        var qeClipNull = (qeClip === null || qeClip === undefined);
        var effectNull = (effect === null || effect === undefined);
        if (!qeClipNull && !effectNull) {
          if (info.trackType === 'video') { qeClip.addVideoEffect(effect); } else { qeClip.addAudioEffect(effect); }
        } else {
          return JSON.stringify({ success: false, error: 'qeClip or effect is null', qeClipNull: qeClipNull, effectNull: effectNull, clipId: ${clipIdLiteral}, effectName: ${effectNameLiteral} });
        }
        var afterComponents = collectComponentSnapshot(clip.components);
        var afterComponentCount = afterComponents.length;
        var afterSignatureCounts = buildSignatureCounts(afterComponents);
        var appliedComponent = null;
        for (var componentIndex = afterComponents.length - 1; componentIndex >= 0; componentIndex--) {
          var candidateSnapshot = afterComponents[componentIndex];
          if ((afterSignatureCounts[candidateSnapshot.signature] || 0) > (beforeSignatureCounts[candidateSnapshot.signature] || 0)) {
            appliedComponent = clip.components[candidateSnapshot.index];
            break;
          }
        }
        if (!appliedComponent && afterComponentCount > beforeComponentCount && clip.components.numItems > 0) {
          appliedComponent = clip.components[clip.components.numItems - 1];
        }
        if (!appliedComponent && afterComponentCount > beforeComponentCount) {
          for (var fallbackIndex = clip.components.numItems - 1; fallbackIndex >= 0; fallbackIndex--) {
            var fallbackComponent = clip.components[fallbackIndex];
            if (looksLikeRequestedEffect(fallbackComponent, ${effectNameLiteral})) {
              appliedComponent = fallbackComponent;
              break;
            }
          }
        }
        if (!appliedComponent) {
          for (var nameSearchIndex = clip.components.numItems - 1; nameSearchIndex >= 0; nameSearchIndex--) {
            var nameSearchComponent = clip.components[nameSearchIndex];
            if (looksLikeRequestedEffect(nameSearchComponent, ${effectNameLiteral})) {
              appliedComponent = nameSearchComponent;
              break;
            }
          }
        }
        if (!appliedComponent) {
          return JSON.stringify({
            success: false,
            error: "Applied effect component not found after QE addVideoEffect/addAudioEffect.",
            clipId: ${clipIdLiteral},
            effectName: ${effectNameLiteral},
            beforeComponentCount: beforeComponentCount,
            afterComponentCount: afterComponentCount
          });
        }
        var appliedParameters = [];
        var skippedParameters = [];

        if (appliedComponent && appliedComponent.properties) {
          for (var propertyIndex = 0; propertyIndex < appliedComponent.properties.numItems; propertyIndex++) {
            var param = appliedComponent.properties[propertyIndex];
            var matchedParameter = false;
            try {
              ${parameterAssignments}
            } catch (parameterError) {
              skippedParameters.push(param.displayName + ": " + parameterError.toString());
            }
          }
        }

        return JSON.stringify({
          success: true,
          message: "Effect applied",
          clipId: ${clipIdLiteral},
          effectName: ${effectNameLiteral},
          componentDisplayName: appliedComponent.displayName || null,
          componentMatchName: appliedComponent.matchName || null,
          appliedParameters: appliedParameters,
          skippedParameters: skippedParameters
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  private async removeEffect(clipId: string, effectName: string): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const effectNameLiteral = this.toExtendScriptString(effectName);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
          return JSON.stringify({
            success: false,
            error: "Effect removal is not supported by the available QE DOM APIs for this clip.",
            note: "Tool remains hidden from the public tool list until QE effect removal is validated on the host Premiere build."
          });
        }
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        if (!qeTrack) {
          return JSON.stringify({
            success: false,
            error: "Effect removal is not supported by the available QE DOM APIs for this clip.",
            note: "Tool remains hidden from the public tool list until QE effect removal is validated on the host Premiere build."
          });
        }
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        if (!qeClip) {
          return JSON.stringify({
            success: false,
            error: "Effect removal is not supported by the available QE DOM APIs for this clip.",
            note: "Tool remains hidden from the public tool list until QE effect removal is validated on the host Premiere build."
          });
        }

        var removalStrategy = null;

        function matchesEffectName(qeEffect) {
          if (!qeEffect) return false;
          var names = [qeEffect.displayName, qeEffect.name, qeEffect.matchName, qeEffect.effectName];
          for (var nameIndex = 0; nameIndex < names.length; nameIndex++) {
            if (names[nameIndex] === ${effectNameLiteral}) {
              return true;
            }
          }
          return false;
        }

        function removeFromCollection(collection) {
          if (!collection) return false;
          var count = 0;
          if (typeof collection.numItems === "number") {
            count = collection.numItems;
          } else if (typeof collection.length === "number") {
            count = collection.length;
          }
          for (var effectIndex = count - 1; effectIndex >= 0; effectIndex--) {
            var qeEffect = collection[effectIndex];
            if (!matchesEffectName(qeEffect)) continue;
            if (typeof qeEffect.remove === "function") {
              qeEffect.remove();
              removalStrategy = "effect.remove()";
              return true;
            }
            if (typeof collection.remove === "function") {
              collection.remove(effectIndex);
              removalStrategy = "collection.remove(index)";
              return true;
            }
          }
          return false;
        }

        function removeFromGetter(getterName, countName) {
          if (typeof qeClip[getterName] !== "function") return false;
          var count = typeof qeClip[countName] === "number" ? qeClip[countName] : 0;
          for (var effectIndex = count - 1; effectIndex >= 0; effectIndex--) {
            var qeEffect = qeClip[getterName](effectIndex);
            if (!matchesEffectName(qeEffect)) continue;
            if (typeof qeEffect.remove === "function") {
              qeEffect.remove();
              removalStrategy = getterName + ".remove()";
              return true;
            }
          }
          return false;
        }

        var removed =
          removeFromCollection(qeClip.effects) ||
          removeFromCollection(qeClip.videoEffects) ||
          removeFromCollection(qeClip.audioEffects) ||
          removeFromGetter("getEffectAt", "numEffects") ||
          removeFromGetter("getVideoEffectAt", "numVideoEffects") ||
          removeFromGetter("getAudioEffectAt", "numAudioEffects");

        if (!removed) {
          return JSON.stringify({
            success: false,
            error: "Effect removal is not supported by the available QE DOM APIs for this clip.",
            note: "Tool remains hidden from the public tool list until QE effect removal is validated on the host Premiere build."
          });
        }

        return JSON.stringify({
          success: true,
          message: "Effect removed",
          clipId: ${clipIdLiteral},
          effectName: ${effectNameLiteral},
          removalStrategy: removalStrategy
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString(),
          note: "Tool remains hidden from the public tool list until QE effect removal is validated on the host Premiere build."
        });
      }
    `;

    return await this.runScript(script);
  }

  private async addTransition(clipId1: string, clipId2: string, transitionName: string, duration: number): Promise<any> {
    const clipId1Literal = this.toExtendScriptString(clipId1);
    const clipId2Literal = this.toExtendScriptString(clipId2);
    const transitionNameLiteral = this.toExtendScriptString(transitionName);
    const script = `
      try {
        app.enableQE();
        var baseContext = {
          clipId1: ${clipId1Literal},
          clipId2: ${clipId2Literal},
          transitionName: ${transitionNameLiteral},
          duration: ${duration}
        };
        var info1 = __findClip(${clipId1Literal});
        var info2 = __findClip(${clipId2Literal});
        if (!info1) return __buildTransitionFailure("clip_not_found", "First clip not found", baseContext);
        if (!info2) return __buildTransitionFailure("clip_not_found", "Second clip not found", baseContext);
        if (info1.trackType !== info2.trackType) {
          return __buildTransitionFailure("invalid_clip_pair", "Clips must be on the same track type", __appendResultContext({
            trackType1: info1.trackType,
            trackType2: info2.trackType
          }, baseContext));
        }
        if (info1.sequenceId !== info2.sequenceId) {
          return __buildTransitionFailure("invalid_clip_pair", "Clips must belong to the same sequence", __appendResultContext({
            firstSequenceId: info1.sequenceId,
            secondSequenceId: info2.sequenceId
          }, baseContext));
        }
        if (info1.trackIndex !== info2.trackIndex) {
          return __buildTransitionFailure("invalid_clip_pair", "Clips must be on the same track", __appendResultContext({
            trackIndex1: info1.trackIndex,
            trackIndex2: info2.trackIndex,
            trackType: info1.trackType,
            sequenceId: info1.sequenceId
          }, baseContext));
        }
        if (Math.abs(info1.clipIndex - info2.clipIndex) !== 1) {
          return __buildTransitionFailure("invalid_clip_pair", "Clips must be adjacent to add a shared transition", __appendResultContext({
            trackType: info1.trackType,
            sequenceId: info1.sequenceId,
            trackIndex: info1.trackIndex,
            clipIndex1: info1.clipIndex,
            clipIndex2: info2.clipIndex
          }, baseContext));
        }
        var earlierInfo = info1.clipIndex < info2.clipIndex ? info1 : info2;
        var laterInfo = earlierInfo === info1 ? info2 : info1;
        var transitionContext = __appendResultContext({
          sequenceId: earlierInfo.sequenceId,
          sequenceName: earlierInfo.sequenceName,
          trackType: earlierInfo.trackType,
          trackIndex: earlierInfo.trackIndex,
          clipIndex: earlierInfo.clipIndex,
          clipIndex1: info1.clipIndex,
          clipIndex2: info2.clipIndex
        }, baseContext);
        var deltaToNext = laterInfo.clip.start.seconds - earlierInfo.clip.end.seconds;
        if (deltaToNext > 0.05) {
          return __buildTransitionFailure("invalid_clip_pair", "Clips leave a visible gap and cannot share a transition", __appendResultContext({
            gapAfterSec: deltaToNext
          }, transitionContext));
        }
        if (deltaToNext < -0.05) {
          return __buildTransitionFailure("invalid_clip_pair", "Clips overlap on the timeline and do not expose a clean transition boundary", __appendResultContext({
            overlapAfterSec: Math.abs(deltaToNext)
          }, transitionContext));
        }
        var targetSequence = __openSequenceById(earlierInfo.sequenceId);
        if (!targetSequence || !app.project.activeSequence || app.project.activeSequence.sequenceID !== earlierInfo.sequenceId) {
          return __buildTransitionFailure("sequence_activation_failed", "Target sequence could not be activated", transitionContext);
        }
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
          return __buildTransitionFailure("qe_sequence_unavailable", "QE active sequence unavailable after activation", transitionContext);
        }
        var qeTrack = earlierInfo.trackType === 'video'
          ? qeSeq.getVideoTrackAt(earlierInfo.trackIndex)
          : qeSeq.getAudioTrackAt(earlierInfo.trackIndex);
        if (!qeTrack) {
          return __buildTransitionFailure("qe_track_unavailable", "QE track unavailable after activation", transitionContext);
        }
        var qeClip = qeTrack.getItemAt(earlierInfo.clipIndex);
        if (!qeClip) {
          return __buildTransitionFailure("qe_clip_unavailable", "QE clip unavailable at the requested transition boundary", transitionContext);
        }
        var transition = earlierInfo.trackType === 'video'
          ? qe.project.getVideoTransitionByName(${transitionNameLiteral})
          : qe.project.getAudioTransitionByName(${transitionNameLiteral});
        if (!transition) return __buildTransitionFailure("transition_not_found", "Transition not found: " + ${transitionNameLiteral} + ". Use list_available_transitions.", transitionContext);
        var frames = __getDurationFramesForSequence(targetSequence, ${duration});
        if (frames === null) {
          return __buildTransitionFailure("sequence_timebase_unavailable", "Sequence timebase is unavailable, so transition duration could not be converted to frames", transitionContext);
        }
        transitionContext.durationFrames = frames;
        try {
          qeClip.addTransition(transition, true, String(frames), "0:00", 0.5, false, true);
        } catch (qeAddTransitionError) {
          return __buildTransitionFailure("qe_add_transition_failed", qeAddTransitionError.toString(), transitionContext);
        }
        return JSON.stringify({
          success: true,
          message: "Transition added",
          transitionName: ${transitionNameLiteral},
          duration: ${duration},
          durationFrames: frames,
          sequenceId: earlierInfo.sequenceId,
          sequenceName: earlierInfo.sequenceName,
          trackType: earlierInfo.trackType,
          trackIndex: earlierInfo.trackIndex,
          clipIndex: earlierInfo.clipIndex,
          clipIndex1: info1.clipIndex,
          clipIndex2: info2.clipIndex,
          adjacencyDeltaSec: deltaToNext
        });
      } catch (e) {
        return __buildTransitionFailure("qe_add_transition_failed", e.toString(), {
          clipId1: ${clipId1Literal},
          clipId2: ${clipId2Literal},
          transitionName: ${transitionNameLiteral},
          duration: ${duration}
        });
      }
    `;

    return await this.runScript(script);
  }

  private async inspectTransitionBoundary(
    clipId1: string,
    clipId2: string,
    duration?: number,
  ): Promise<any> {
    const clipId1Literal = this.toExtendScriptString(clipId1);
    const clipId2Literal = this.toExtendScriptString(clipId2);
    const durationLiteral =
      typeof duration === 'number' && Number.isFinite(duration) ? String(duration) : 'null';
    const script = `
      try {
        app.enableQE();
        var info1 = __findClip(${clipId1Literal});
        var info2 = __findClip(${clipId2Literal});
        var requestContext = {
          clipId1: ${clipId1Literal},
          clipId2: ${clipId2Literal},
          requestedDuration: ${durationLiteral}
        };
        if (!info1) return __buildTransitionFailure("clip_not_found", "First clip not found", requestContext);
        if (!info2) return __buildTransitionFailure("clip_not_found", "Second clip not found", requestContext);

        var sameTrackType = info1.trackType === info2.trackType;
        var sameSequence = info1.sequenceId === info2.sequenceId;
        var sameTrack = sameTrackType && sameSequence && info1.trackIndex === info2.trackIndex;
        var adjacentByIndex = sameTrack && Math.abs(info1.clipIndex - info2.clipIndex) === 1;
        var clipOrder = info1.clipIndex <= info2.clipIndex ? "forward" : "reverse";
        var earlierInfo = clipOrder === "forward" ? info1 : info2;
        var laterInfo = clipOrder === "forward" ? info2 : info1;
        var boundaryDeltaSec = null;
        var boundaryType = "unknown";
        if (sameTrack) {
          boundaryDeltaSec = laterInfo.clip.start.seconds - earlierInfo.clip.end.seconds;
          if (boundaryDeltaSec > 0.05) {
            boundaryType = "gap";
          } else if (boundaryDeltaSec < -0.05) {
            boundaryType = "overlap";
          } else {
            boundaryType = "contiguous";
          }
        }

        var issues = [];
        if (!sameTrackType) issues.push("different-track-type");
        if (!sameSequence) issues.push("different-sequence");
        if (sameTrackType && sameSequence && info1.trackIndex !== info2.trackIndex) issues.push("different-track-index");
        if (sameTrack && !adjacentByIndex) issues.push("not-adjacent-by-index");
        if (boundaryType === "gap") issues.push("timeline-gap");
        if (boundaryType === "overlap") issues.push("timeline-overlap");

        var targetSequence = sameSequence ? __openSequenceById(earlierInfo.sequenceId) : null;
        var sequenceActivationSucceeded = Boolean(
          targetSequence &&
          app.project.activeSequence &&
          app.project.activeSequence.sequenceID === earlierInfo.sequenceId
        );
        var qeSequenceAvailable = false;
        if (sequenceActivationSucceeded) {
          var qeSeq = qe.project.getActiveSequence();
          qeSequenceAvailable = qeSeq ? true : false;
        }
        if (sameSequence && !sequenceActivationSucceeded) {
          issues.push("sequence-activation-failed");
        }
        if (sameSequence && sequenceActivationSucceeded && !qeSequenceAvailable) {
          issues.push("qe-sequence-unavailable");
        }

        var durationFrames = null;
        if (targetSequence && ${durationLiteral} !== null) {
          durationFrames = __getDurationFramesForSequence(targetSequence, ${durationLiteral});
          if (durationFrames === null) {
            issues.push("sequence-timebase-unavailable");
          }
        }

        var canAddSharedTransition =
          sameTrack &&
          adjacentByIndex &&
          boundaryType === "contiguous" &&
          sequenceActivationSucceeded &&
          qeSequenceAvailable;

        return JSON.stringify({
          success: true,
          canAddSharedTransition: canAddSharedTransition,
          issues: issues,
          clipOrder: clipOrder,
          sameTrackType: sameTrackType,
          sameSequence: sameSequence,
          sameTrack: sameTrack,
          adjacentByIndex: adjacentByIndex,
          boundaryType: boundaryType,
          boundaryDeltaSec: boundaryDeltaSec,
          requestedDuration: ${durationLiteral},
          durationFrames: durationFrames,
          sequenceActivationSucceeded: sequenceActivationSucceeded,
          qeSequenceAvailable: qeSequenceAvailable,
          sequenceId: earlierInfo.sequenceId,
          sequenceName: earlierInfo.sequenceName,
          trackType: earlierInfo.trackType,
          trackIndex: earlierInfo.trackIndex,
          clipIndex1: info1.clipIndex,
          clipIndex2: info2.clipIndex
        });
      } catch (e) {
        return __buildTransitionFailure("transition_boundary_inspection_failed", e.toString(), {
          clipId1: ${clipId1Literal},
          clipId2: ${clipId2Literal},
          requestedDuration: ${durationLiteral}
        });
      }
    `;

    return await this.runScript(script);
  }

  private async inspectTrackTransitionBoundaries(
    sequenceId: string,
    trackIndex: number,
    trackType: 'video' | 'audio' = 'video',
    duration?: number,
  ): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const trackTypeLiteral = this.toExtendScriptString(trackType);
    const durationLiteral =
      typeof duration === 'number' && Number.isFinite(duration) ? String(duration) : 'null';
    const trackAccessor = trackType === 'audio' ? 'audioTracks' : 'videoTracks';
    const script = `
      try {
        app.enableQE();
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) {
          return __buildTransitionFailure("sequence_not_found", "Sequence not found", {
            sequenceId: ${sequenceIdLiteral},
            trackType: ${trackTypeLiteral},
            trackIndex: ${trackIndex},
            requestedDuration: ${durationLiteral}
          });
        }
        var activationTarget = __openSequenceById(sequence.sequenceID);
        var sequenceActivationSucceeded = Boolean(
          activationTarget &&
          app.project.activeSequence &&
          app.project.activeSequence.sequenceID === sequence.sequenceID
        );
        var qeSequenceAvailable = false;
        if (sequenceActivationSucceeded) {
          var qeSeq = qe.project.getActiveSequence();
          qeSequenceAvailable = qeSeq ? true : false;
        }

        var track = sequence.${trackAccessor}[${trackIndex}];
        if (!track) {
          return __buildTransitionFailure("track_not_found", "Track not found", {
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            trackType: ${trackTypeLiteral},
            trackIndex: ${trackIndex},
            requestedDuration: ${durationLiteral}
          });
        }

        var durationFrames = null;
        var sequenceTimebaseAvailable = true;
        if (${durationLiteral} !== null) {
          durationFrames = __getDurationFramesForSequence(sequence, ${durationLiteral});
          if (durationFrames === null) {
            sequenceTimebaseAvailable = false;
          }
        }

        var topLevelIssues = [];
        if (!sequenceActivationSucceeded) topLevelIssues.push("sequence-activation-failed");
        if (sequenceActivationSucceeded && !qeSequenceAvailable) topLevelIssues.push("qe-sequence-unavailable");
        if (${durationLiteral} !== null && !sequenceTimebaseAvailable) topLevelIssues.push("sequence-timebase-unavailable");

        var clipCount = track.clips.numItems;
        if (clipCount < 2) topLevelIssues.push("insufficient-clips");

        var boundaries = [];
        var contiguousBoundaries = 0;
        var gapBoundaries = 0;
        var overlapBoundaries = 0;
        var canAddSharedTransitionCount = 0;

        for (var i = 0; i < clipCount - 1; i++) {
          var currentClip = track.clips[i];
          var nextClip = track.clips[i + 1];
          var boundaryDeltaSec = nextClip.start.seconds - currentClip.end.seconds;
          var boundaryType = "contiguous";
          var issues = [];
          if (boundaryDeltaSec > 0.05) {
            boundaryType = "gap";
            gapBoundaries++;
            issues.push("timeline-gap");
          } else if (boundaryDeltaSec < -0.05) {
            boundaryType = "overlap";
            overlapBoundaries++;
            issues.push("timeline-overlap");
          } else {
            contiguousBoundaries++;
          }

          if (!sequenceActivationSucceeded) issues.push("sequence-activation-failed");
          if (sequenceActivationSucceeded && !qeSequenceAvailable) issues.push("qe-sequence-unavailable");
          if (${durationLiteral} !== null && !sequenceTimebaseAvailable) issues.push("sequence-timebase-unavailable");

          var canAddSharedTransition =
            boundaryType === "contiguous" &&
            sequenceActivationSucceeded &&
            qeSequenceAvailable &&
            (${durationLiteral} === null || sequenceTimebaseAvailable);

          if (canAddSharedTransition) {
            canAddSharedTransitionCount++;
          }

          boundaries.push({
            clipId1: currentClip.nodeId,
            clipName1: currentClip.name,
            clipId2: nextClip.nodeId,
            clipName2: nextClip.name,
            clipIndex1: i,
            clipIndex2: i + 1,
            boundaryType: boundaryType,
            boundaryDeltaSec: boundaryDeltaSec,
            canAddSharedTransition: canAddSharedTransition,
            issues: issues,
            durationFrames: durationFrames
          });
        }

        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          trackType: ${trackTypeLiteral},
          trackIndex: ${trackIndex},
          totalClips: clipCount,
          totalBoundaries: Math.max(clipCount - 1, 0),
          requestedDuration: ${durationLiteral},
          durationFrames: durationFrames,
          sequenceActivationSucceeded: sequenceActivationSucceeded,
          qeSequenceAvailable: qeSequenceAvailable,
          sequenceTimebaseAvailable: sequenceTimebaseAvailable,
          issues: topLevelIssues,
          canBatchAddTransitions:
            topLevelIssues.length === 0 &&
            clipCount >= 2 &&
            canAddSharedTransitionCount === Math.max(clipCount - 1, 0),
          summary: {
            contiguousBoundaries: contiguousBoundaries,
            gapBoundaries: gapBoundaries,
            overlapBoundaries: overlapBoundaries,
            canAddSharedTransitionCount: canAddSharedTransitionCount
          },
          boundaries: boundaries
        });
      } catch (e) {
        return __buildTransitionFailure("track_transition_inspection_failed", e.toString(), {
          sequenceId: ${sequenceIdLiteral},
          trackType: ${trackTypeLiteral},
          trackIndex: ${trackIndex},
          requestedDuration: ${durationLiteral}
        });
      }
    `;

    return await this.runScript(script);
  }

  private async safeBatchAddTransitions(
    sequenceId: string,
    trackIndex: number,
    transitionName: string,
    duration: number,
    trackType: 'video' | 'audio' = 'video',
  ): Promise<any> {
    const inspection = await this.inspectTrackTransitionBoundaries(
      sequenceId,
      trackIndex,
      trackType,
      duration,
    ) as {
      success?: boolean;
      stage?: string;
      error?: string;
      sequenceId?: string;
      sequenceName?: string;
      trackType?: 'video' | 'audio';
      trackIndex?: number;
      totalBoundaries?: number;
      durationFrames?: number | null;
      issues?: string[];
      summary?: Record<string, unknown>;
      boundaries?: Array<{
        clipId1: string;
        clipName1?: string;
        clipId2: string;
        clipName2?: string;
        clipIndex1: number;
        clipIndex2: number;
        boundaryType: string;
        boundaryDeltaSec: number | null;
        canAddSharedTransition: boolean;
        issues?: string[];
        durationFrames?: number | null;
      }>;
    };

    if (!inspection?.success) {
      return {
        success: false,
        blocked: true,
        stage: inspection?.stage ?? 'track_transition_inspection_failed',
        error: inspection?.error ?? 'Track transition inspection failed',
        transitionName,
        duration,
        inspection,
      };
    }

    const topLevelIssues = Array.isArray(inspection.issues) ? inspection.issues : [];
    const boundaries = Array.isArray(inspection.boundaries) ? inspection.boundaries : [];
    const safeBoundaries = boundaries.filter((boundary) => boundary.canAddSharedTransition);
    const skipped = boundaries
      .filter((boundary) => !boundary.canAddSharedTransition)
      .map((boundary) => ({
        clipId1: boundary.clipId1,
        clipName1: boundary.clipName1,
        clipId2: boundary.clipId2,
        clipName2: boundary.clipName2,
        clipIndex1: boundary.clipIndex1,
        clipIndex2: boundary.clipIndex2,
        boundaryType: boundary.boundaryType,
        boundaryDeltaSec: boundary.boundaryDeltaSec,
        issues: Array.isArray(boundary.issues) ? boundary.issues : ['unsafe-boundary'],
        durationFrames: boundary.durationFrames ?? inspection.durationFrames ?? null,
      }));

    const skippedIssueCounts = skipped.reduce<Record<string, number>>((counts, boundary) => {
      for (const issue of boundary.issues) {
        counts[issue] = (counts[issue] ?? 0) + 1;
      }
      return counts;
    }, {});

    const blockingIssues = topLevelIssues.filter((issue) => issue !== 'insufficient-clips');
    if (blockingIssues.length > 0) {
      return {
        success: false,
        blocked: true,
        stage: 'inspection_blocked',
        error: `Track inspection reported blocking issues: ${blockingIssues.join(', ')}`,
        sequenceId: inspection.sequenceId ?? sequenceId,
        sequenceName: inspection.sequenceName,
        trackType: inspection.trackType ?? trackType,
        trackIndex: inspection.trackIndex ?? trackIndex,
        transitionName,
        duration,
        inspectionIssues: topLevelIssues,
        inspectionSummary: inspection.summary ?? null,
        totalBoundaries: inspection.totalBoundaries ?? boundaries.length,
        safeBoundaryCount: safeBoundaries.length,
        skippedBoundaries: skipped.length,
        skippedIssueCounts,
        skipped,
        inspection,
      };
    }

    if (safeBoundaries.length === 0) {
      return {
        success: false,
        blocked: true,
        stage: 'no_safe_boundaries',
        error: 'No safe transition boundaries were available on the requested track.',
        sequenceId: inspection.sequenceId ?? sequenceId,
        sequenceName: inspection.sequenceName,
        trackType: inspection.trackType ?? trackType,
        trackIndex: inspection.trackIndex ?? trackIndex,
        transitionName,
        duration,
        inspectionIssues: topLevelIssues,
        inspectionSummary: inspection.summary ?? null,
        totalBoundaries: inspection.totalBoundaries ?? boundaries.length,
        safeBoundaryCount: 0,
        skippedBoundaries: skipped.length,
        skippedIssueCounts,
        skipped,
        inspection,
      };
    }

    const applied: Array<Record<string, unknown>> = [];
    const failures: Array<Record<string, unknown>> = [];

    for (const boundary of safeBoundaries) {
      const result = await this.addTransition(
        boundary.clipId1,
        boundary.clipId2,
        transitionName,
        duration,
      ) as Record<string, unknown>;

      const boundaryContext = {
        clipId1: boundary.clipId1,
        clipName1: boundary.clipName1,
        clipId2: boundary.clipId2,
        clipName2: boundary.clipName2,
        clipIndex1: boundary.clipIndex1,
        clipIndex2: boundary.clipIndex2,
        boundaryType: boundary.boundaryType,
        boundaryDeltaSec: boundary.boundaryDeltaSec,
        durationFrames: boundary.durationFrames ?? inspection.durationFrames ?? null,
      };

      if (result?.success) {
        applied.push({
          ...boundaryContext,
          sequenceId: result.sequenceId ?? inspection.sequenceId ?? sequenceId,
          sequenceName: result.sequenceName ?? inspection.sequenceName,
          trackType: result.trackType ?? inspection.trackType ?? trackType,
          trackIndex: result.trackIndex ?? inspection.trackIndex ?? trackIndex,
          transitionName: result.transitionName ?? transitionName,
          duration: result.duration ?? duration,
          durationFrames: result.durationFrames ?? boundaryContext.durationFrames,
          adjacencyDeltaSec: result.adjacencyDeltaSec ?? boundary.boundaryDeltaSec,
        });
      } else {
        failures.push({
          ...boundaryContext,
          stage: result?.stage ?? 'safe_batch_add_transition_failed',
          error: result?.error ?? 'Transition insertion failed',
          sequenceId: result?.sequenceId ?? inspection.sequenceId ?? sequenceId,
          sequenceName: result?.sequenceName ?? inspection.sequenceName,
          trackType: result?.trackType ?? inspection.trackType ?? trackType,
          trackIndex: result?.trackIndex ?? inspection.trackIndex ?? trackIndex,
          transitionName: result?.transitionName ?? transitionName,
          duration: result?.duration ?? duration,
        });
      }
    }

    const failedStageCounts = failures.reduce<Record<string, number>>((counts, failure) => {
      const stage =
        typeof failure.stage === 'string' && failure.stage.trim().length > 0
          ? failure.stage
          : 'unknown';
      counts[stage] = (counts[stage] ?? 0) + 1;
      return counts;
    }, {});

    return {
      success: failures.length === 0,
      partialSuccess:
        applied.length > 0 &&
        (failures.length > 0 || skipped.length > 0),
      sequenceId: inspection.sequenceId ?? sequenceId,
      sequenceName: inspection.sequenceName,
      trackType: inspection.trackType ?? trackType,
      trackIndex: inspection.trackIndex ?? trackIndex,
      transitionName,
      duration,
      durationFrames: inspection.durationFrames ?? null,
      totalBoundaries: inspection.totalBoundaries ?? boundaries.length,
      attemptedBoundaries: safeBoundaries.length,
      transitionsAdded: applied.length,
      skippedBoundaries: skipped.length,
      failedBoundaries: failures.length,
      inspectionIssues: topLevelIssues,
      inspectionSummary: inspection.summary ?? null,
      failedStageCounts,
      skippedIssueCounts,
      applied,
      skipped,
      failures,
      inspection,
    };
  }

  private async addTransitionToClip(clipId: string, transitionName: string, position: 'start' | 'end', duration: number): Promise<any> {
    const atEnd = position === 'end';
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const transitionNameLiteral = this.toExtendScriptString(transitionName);
    const positionLiteral = this.toExtendScriptString(position);
    const script = `
      try {
        app.enableQE();
        var baseContext = {
          clipId: ${clipIdLiteral},
          transitionName: ${transitionNameLiteral},
          position: ${positionLiteral},
          duration: ${duration}
        };
        var info = __findClip(${clipIdLiteral});
        if (!info) return __buildTransitionFailure("clip_not_found", "Clip not found", baseContext);
        var transitionContext = __appendResultContext({
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex
        }, baseContext);
        var targetSequence = __openSequenceById(info.sequenceId);
        if (!targetSequence || !app.project.activeSequence || app.project.activeSequence.sequenceID !== info.sequenceId) {
          return __buildTransitionFailure("sequence_activation_failed", "Target sequence could not be activated", transitionContext);
        }
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
          return __buildTransitionFailure("qe_sequence_unavailable", "QE active sequence unavailable after activation", transitionContext);
        }
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        if (!qeTrack) {
          return __buildTransitionFailure("qe_track_unavailable", "QE track unavailable after activation", transitionContext);
        }
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        if (!qeClip) {
          return __buildTransitionFailure("qe_clip_unavailable", "QE clip unavailable at the requested index", transitionContext);
        }
        var transition = info.trackType === 'video'
          ? qe.project.getVideoTransitionByName(${transitionNameLiteral})
          : qe.project.getAudioTransitionByName(${transitionNameLiteral});
        if (!transition) return __buildTransitionFailure("transition_not_found", "Transition not found: " + ${transitionNameLiteral}, transitionContext);
        var frames = __getDurationFramesForSequence(targetSequence, ${duration});
        if (frames === null) {
          return __buildTransitionFailure("sequence_timebase_unavailable", "Sequence timebase is unavailable, so transition duration could not be converted to frames", transitionContext);
        }
        transitionContext.durationFrames = frames;
        try {
          qeClip.addTransition(transition, ${atEnd}, String(frames), "0:00", 0.5, true, true);
        } catch (qeAddTransitionError) {
          return __buildTransitionFailure("qe_add_transition_failed", qeAddTransitionError.toString(), transitionContext);
        }
        return JSON.stringify({
          success: true,
          message: "Transition added at " + ${positionLiteral},
          transitionName: ${transitionNameLiteral},
          duration: ${duration},
          durationFrames: frames,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex
        });
      } catch (e) {
        return __buildTransitionFailure("qe_add_transition_failed", e.toString(), {
          clipId: ${clipIdLiteral},
          transitionName: ${transitionNameLiteral},
          position: ${positionLiteral},
          duration: ${duration}
        });
      }
    `;

    return await this.runScript(script);
  }

  // Audio Operations Implementation
  private async adjustAudioLevels(clipId: string, level: number): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var found = false;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          for (var j = 0; j < comp.properties.numItems; j++) {
            if (comp.properties[j].displayName === "Volume") {
              var oldLevel = comp.properties[j].getValue();
              comp.properties[j].setValue(${level}, true);
              found = true;
              return JSON.stringify({
                success: true,
                message: "Audio level adjusted successfully",
                clipId: ${clipIdLiteral},
                oldLevel: oldLevel,
                newLevel: ${level}
              });
            }
          }
        }
        if (!found) return JSON.stringify({ success: false, error: "Volume property not found on clip" });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.runScript(script);
  }

  private async addAudioKeyframes(clipId: string, keyframes: Array<{time: number, level: number}>): Promise<any> {
    const keyframeCode = keyframes.map(kf => `
        try {
          var keyframeTimeTicks = __secondsToTicks(${kf.time});
          volumeProperty.addKey(keyframeTimeTicks);
          volumeProperty.setValueAtKey(keyframeTimeTicks, ${kf.level}, true);
          addedKeyframes.push({ time: ${kf.time}, level: ${kf.level}, ticks: keyframeTimeTicks });
        } catch (e2) {}
    `).join('\n');

    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var volumeProperty = null;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          for (var j = 0; j < comp.properties.numItems; j++) {
            if (comp.properties[j].displayName === "Volume") {
              volumeProperty = comp.properties[j];
              break;
            }
          }
          if (volumeProperty) break;
        }
        if (!volumeProperty) return JSON.stringify({ success: false, error: "Volume property not found" });
        volumeProperty.setTimeVarying(true);
        var addedKeyframes = [];
        ${keyframeCode}
        return JSON.stringify({
          success: true,
          message: "Audio keyframes added",
          clipId: ${JSON.stringify(clipId)},
          addedKeyframes: addedKeyframes,
          totalKeyframes: addedKeyframes.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  private async muteTrack(sequenceId: string, trackIndex: number, muted: boolean): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var track = sequence.audioTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: "Audio track not found" });
        track.setMute(${muted ? 1 : 0});
        return JSON.stringify({
          success: true,
          message: "Track mute status changed",
          sequenceId: ${sequenceIdLiteral},
          trackIndex: ${trackIndex},
          muted: ${muted}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  // Text and Graphics Implementation
  private async addTextOverlay(args: any): Promise<any> {
    if (args.mogrtPath) {
      const script = `
        try {
          var sequence = __findSequence(${JSON.stringify(args.sequenceId)});
          if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
          var timeTicks = __secondsToTicks(${args.startTime});
          var trackItem = sequence.importMGT(${JSON.stringify(args.mogrtPath)}, timeTicks, ${args.trackIndex}, 0);
          if (!trackItem) return JSON.stringify({ success: false, error: "Failed to import MOGRT. Ensure the .mogrt file exists." });
          return JSON.stringify({ success: true, message: "MOGRT imported as text overlay", clipId: trackItem.nodeId });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `;
      return await this.runScript(script);
    }

    // Fallback: try legacy title approach
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(args.sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        return JSON.stringify({
          success: false,
          error: "Text overlay requires a MOGRT file path. Use the mogrtPath parameter with a .mogrt template file, or use import_mogrt tool.",
          note: "Legacy titles (app.project.createNewTitle) are not supported in current Premiere Pro ExtendScript API."
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Color Correction Implementation
  private async colorCorrect(clipId: string, adjustments: any): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const paramCode = [
      adjustments.brightness !== undefined ? `if (p.displayName === "Brightness") p.setValue(${adjustments.brightness}, true);` : '',
      adjustments.contrast !== undefined ? `if (p.displayName === "Contrast") p.setValue(${adjustments.contrast}, true);` : '',
      adjustments.saturation !== undefined ? `if (p.displayName === "Saturation") p.setValue(${adjustments.saturation}, true);` : '',
      adjustments.hue !== undefined ? `if (p.displayName === "Hue") p.setValue(${adjustments.hue}, true);` : '',
      adjustments.temperature !== undefined ? `if (p.displayName === "Temperature") p.setValue(${adjustments.temperature}, true);` : '',
      adjustments.tint !== undefined ? `if (p.displayName === "Tint") p.setValue(${adjustments.tint}, true);` : '',
    ].filter(Boolean).join('\n              ');

    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color effect not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            ${paramCode}
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "Color correction applied", clipId: ${clipIdLiteral} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  private async applyLut(clipId: string, lutPath: string, intensity = 100): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const lutPathLiteral = this.toExtendScriptString(lutPath);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        var appliedIntensityProperty = null;
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            if (p.displayName === "Input LUT") p.setValue(${lutPathLiteral}, true);
            if (!appliedIntensityProperty && p.displayName === "Input LUT Intensity") {
              p.setValue(${intensity}, true);
              appliedIntensityProperty = "Input LUT Intensity";
            }
            if (!appliedIntensityProperty && p.displayName === "Blend") {
              p.setValue(${intensity}, true);
              appliedIntensityProperty = "Blend";
            }
            if (!appliedIntensityProperty && p.displayName === "Opacity") {
              p.setValue(${intensity}, true);
              appliedIntensityProperty = "Opacity";
            }
          } catch (e2) {}
        }
        return JSON.stringify({
          success: true,
          message: "LUT applied",
          clipId: ${clipIdLiteral},
          lutPath: ${lutPathLiteral},
          intensity: ${intensity},
          intensityProperty: appliedIntensityProperty
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  // Export and Rendering Implementation
  private async exportSequence(sequenceId: string, outputPath: string, presetPath?: string, format?: string, quality?: string, resolution?: string): Promise<any> {
    try {
      const defaultPreset = format === 'mp4' ? 'H.264' : 'ProRes';
      const preset = presetPath || defaultPreset;
      
      await this.bridge.renderSequence(sequenceId, outputPath, preset);
      return { 
        success: true, 
        message: 'Sequence exported successfully',
        outputPath: outputPath, 
        format: preset,
        quality: quality,
        resolution: resolution
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export sequence: ${error instanceof Error ? error.message : String(error)}`,
        sequenceId: sequenceId,
        outputPath: outputPath
      };
    }
  }

  private async exportFrame(sequenceId: string, time: number, outputPath: string, format = 'png'): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const outputPathLiteral = this.toExtendScriptString(outputPath);
    const formatLiteral = this.toExtendScriptString(format);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });

        if (sequence.openInTimeline) {
          try { sequence.openInTimeline(); } catch (e0) {}
        }

        app.enableQE();
        var qeSequence = qe.project.getActiveSequence();
        if (!qeSequence) {
          return JSON.stringify({ success: false, error: "QE active sequence not available for frame export" });
        }

        var methodName = ${formatLiteral} === "jpg" ? "exportFrameJPEG" : (${formatLiteral} === "tiff" ? "exportFrameTiff" : "exportFramePNG");
        if (typeof qeSequence[methodName] !== "function") {
          return JSON.stringify({
            success: false,
            error: "Frame export format '" + ${formatLiteral} + "' is not supported by the available Premiere API"
          });
        }

        var timeNumber = ${time};
        var timeString = String(timeNumber);
        var timeTicks = timeString;
        try {
          var exportTime = new Time();
          exportTime.seconds = timeNumber;
          timeTicks = exportTime.ticks;
        } catch (e1) {}

        var exportError = null;
        function tryExport(arg1, arg2) {
          try {
            qeSequence[methodName](arg1, arg2);
            return true;
          } catch (e2) {
            exportError = e2.toString();
            return false;
          }
        }

        var exported =
          tryExport(timeNumber, ${outputPathLiteral}) ||
          tryExport(${outputPathLiteral}, timeNumber) ||
          tryExport(timeString, ${outputPathLiteral}) ||
          tryExport(${outputPathLiteral}, timeString) ||
          tryExport(timeTicks, ${outputPathLiteral}) ||
          tryExport(${outputPathLiteral}, timeTicks);

        if (!exported) {
          return JSON.stringify({
            success: false,
            error: exportError || "Frame export failed"
          });
        }

        return JSON.stringify({
          success: true,
          message: "Frame exported successfully",
          sequenceId: ${sequenceIdLiteral},
          time: ${time},
          outputPath: ${outputPathLiteral},
          format: ${formatLiteral}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  // Advanced Features Implementation
  private async stabilizeClip(clipId: string, smoothness = 50): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Warp Stabilizer");
        if (!effect) return JSON.stringify({ success: false, error: "Warp Stabilizer effect not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          try {
            if (lastComp.properties[j].displayName === "Smoothness") lastComp.properties[j].setValue(${smoothness}, true);
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "Warp Stabilizer applied", clipId: ${clipIdLiteral}, smoothness: ${smoothness} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  private async speedChange(clipId: string, speed: number, maintainAudio = true): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const maintainAudioFlag = this.coerceBooleanFlag(maintainAudio, true);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var oldSpeed = info.clip.getSpeed();
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        try { qeClip.setSpeed(${speed}, ${maintainAudioFlag}); } catch(e2) {
          return JSON.stringify({ success: false, error: "Speed change via QE DOM not available: " + e2.toString() });
        }
        return JSON.stringify({ success: true, oldSpeed: oldSpeed, newSpeed: ${speed} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.runScript(script);
  }

  // ============================================
  // NEW TOOLS IMPLEMENTATION
  // ============================================

  // Markers Implementation
  private async addMarker(sequenceId: string, time: number, name: string, comment?: string, color?: string, duration?: number): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var marker = sequence.markers.createMarker(${time});
          marker.name = ${JSON.stringify(name)};
          ${comment ? `marker.comments = ${JSON.stringify(comment)};` : ''}
          ${color ? `marker.setColorByIndex(${color === 'red' ? '5' : color === 'green' ? '3' : color === 'blue' ? '1' : '0'});` : ''}
          ${duration && duration > 0 ? `marker.end = ${time + duration};` : ''}

          return JSON.stringify({
            success: true,
            markerId: marker.guid,
            message: "Marker added successfully"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async deleteMarker(sequenceId: string, markerId: string): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var deleted = false;
          var marker = sequence.markers.getFirstMarker();
          while (marker) {
            var nextMarker = sequence.markers.getNextMarker(marker);
            if (marker.guid === ${JSON.stringify(markerId)}) {
              sequence.markers.deleteMarker(marker);
              deleted = true;
              break;
            }
            marker = nextMarker;
          }

          return JSON.stringify({
            success: deleted,
            message: deleted ? "Marker deleted successfully" : "Marker not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async updateMarker(sequenceId: string, markerId: string, updates: any): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var found = false;
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var marker = sequence.markers[i];
            if (marker.guid === ${JSON.stringify(markerId)}) {
              ${updates.name ? `marker.name = ${JSON.stringify(updates.name)};` : ''}
              ${updates.comment ? `marker.comments = ${JSON.stringify(updates.comment)};` : ''}
              ${updates.color ? `marker.setColorByIndex(${updates.color === 'red' ? '5' : updates.color === 'green' ? '3' : updates.color === 'blue' ? '1' : '0'});` : ''}
              found = true;
              break;
            }
          }

          return JSON.stringify({
            success: found,
            message: found ? "Marker updated successfully" : "Marker not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async listMarkers(sequenceId: string): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var markers = [];
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var marker = sequence.markers[i];
            markers.push({
              id: marker.guid,
              name: marker.name,
              comment: marker.comments,
              start: marker.start.seconds,
              end: marker.end.seconds,
              duration: marker.end.seconds - marker.start.seconds,
              type: marker.type
            });
          }

          return JSON.stringify({
            success: true,
            markers: markers,
            count: markers.length
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  // Track Management Implementation
  private async addTrack(sequenceId: string, trackType: string, _position?: string): Promise<any> {
    const numVideo = trackType === 'video' ? 1 : 0;
    const numAudio = trackType === 'audio' ? 1 : 0;
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
        }
        if (!app.project.activeSequence || app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          app.project.openSequence(sequence.sequenceID);
        }
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
          return JSON.stringify({
            success: false,
            error: "QE active sequence not available"
          });
        }
        qeSeq.addTracks(${numVideo}, ${numAudio}, 0);
        return JSON.stringify({
          success: true,
          message: "${trackType} track added",
          sequenceId: ${JSON.stringify(sequenceId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async deleteTrack(sequenceId: string, trackType: string, trackIndex: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
        }
        if (!app.project.activeSequence || app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          app.project.openSequence(sequence.sequenceID);
        }
        sequence = app.project.activeSequence || sequence;
        var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
        if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
          tracks.deleteTrack(${trackIndex});
          return JSON.stringify({
            success: true,
            message: "Track deleted successfully",
            sequenceId: ${JSON.stringify(sequenceId)}
          });
        }
        return JSON.stringify({
          success: false,
          error: "Track index out of range"
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async lockTrack(sequenceId: string, trackType: string, trackIndex: number, locked: boolean): Promise<any> {
    const lockedFlag = this.coerceBooleanFlag(locked, false);
    const lockMessage = lockedFlag === 1 ? 'Track locked' : 'Track unlocked';
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
        }
        if (!app.project.activeSequence || app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          app.project.openSequence(sequence.sequenceID);
        }
        sequence = app.project.activeSequence || sequence;
        var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
        if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
          var lockState = ${lockedFlag};
          tracks[${trackIndex}].setLocked(lockState === 1);
          return JSON.stringify({
            success: true,
            message: ${JSON.stringify(lockMessage)},
            sequenceId: ${JSON.stringify(sequenceId)}
          });
        }
        return JSON.stringify({
          success: false,
          error: "Track index out of range"
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async toggleTrackVisibility(sequenceId: string, trackIndex: number, visible: boolean): Promise<any> {
    const sequenceIdLiteral = this.toExtendScriptString(sequenceId);
    const visibleFlag = this.coerceBooleanFlag(visible, true);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
        }
        if (!app.project.activeSequence || app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          app.project.openSequence(sequence.sequenceID);
        }
        sequence = app.project.activeSequence || sequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else if (${trackIndex} < 0) {
          return JSON.stringify({
            success: false,
            error: "Track index out of range"
          });
        } else {
          var visibilityState = ${visibleFlag} === 1;
          if (${trackIndex} < sequence.videoTracks.numTracks) {
            var vTrack = sequence.videoTracks[${trackIndex}];
            if (typeof vTrack.setVisibility === "function") {
              vTrack.setVisibility(visibilityState);
            } else {
              vTrack.enabled = visibilityState;
            }
            return JSON.stringify({
              success: true,
              message: "Track visibility toggled"
            });
          } else if (${trackIndex} < sequence.audioTracks.numTracks) {
            var aTrack = sequence.audioTracks[${trackIndex}];
            if (typeof aTrack.setVisibility === "function") {
              aTrack.setVisibility(visibilityState);
            } else {
              aTrack.enabled = visibilityState;
            }
            return JSON.stringify({
              success: true,
              message: "Track visibility toggled"
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async linkAudioVideo(clipId: string, linked: boolean): Promise<any> {
    const linkedFlag = this.coerceBooleanFlag(linked, false);
    const linkedMessage = linkedFlag === 1 ? 'Clip linked' : 'Clip unlinked';
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var seq = info.sequenceId ? __openSequenceById(info.sequenceId) : app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found for clip" });
        info = __findClip(${JSON.stringify(clipId)}) || info;
        if (!info || !info.clip) return JSON.stringify({ success: false, error: "Clip not found after sequence activation" });
        info.clip.setSelected(1, 1);
        if (${linkedFlag} === 1) { seq.linkSelection(); } else { seq.unlinkSelection(); }
        return JSON.stringify({ success: true, message: ${JSON.stringify(linkedMessage)} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async applyAudioEffect(clipId: string, effectName: string, parameters?: any): Promise<any> {
    return await this.applyEffect(clipId, effectName, parameters);
  }

  // Nested Sequences
  private async createNestedSequence(_clipIds: string[], _name: string): Promise<any> {
    return {
      success: false,
      error: "create_nested_sequence: This feature requires selection and nesting APIs. Implementation pending.",
      note: "You can manually nest clips via right-click > Nest"
    };
  }

  private async unnestSequence(_nestedSequenceClipId: string): Promise<any> {
    return {
      success: false,
      error: "unnest_sequence: This feature is not available in Premiere Pro scripting API",
      note: "You can manually unnest via Edit > Paste Attributes"
    };
  }

  // Additional Clip Operations
  private async duplicateClip(clipId: string, offset?: number): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var projItem = clip.projectItem;
        var insertTime = clip.end.seconds + ${offset !== undefined ? offset : 0};
        info.track.overwriteClip(projItem, insertTime);
        return JSON.stringify({ success: true, message: "Clip duplicated at " + insertTime + "s" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async reverseClip(clipId: string, maintainAudioPitch?: boolean): Promise<any> {
    return await this.speedChange(clipId, -1, maintainAudioPitch !== false);
  }

  private async enableDisableClip(clipId: string, enabled: boolean): Promise<any> {
    const enabledFlag = this.coerceBooleanFlag(enabled, false);
    const enabledMessage = enabledFlag === 1 ? 'Clip enabled' : 'Clip disabled';
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var enabledValue = ${enabledFlag};
        info.clip.disabled = enabledValue === 1 ? false : true;
        return JSON.stringify({
          success: true,
          message: ${JSON.stringify(enabledMessage)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async replaceClip(clipId: string, newProjectItemId: string, preserveEffects = true): Promise<any> {
    const preserveEffectsFlag = this.coerceBooleanFlag(preserveEffects, true);
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var newItem = __findProjectItem(${JSON.stringify(newProjectItemId)});
        if (!newItem) return JSON.stringify({ success: false, error: "New project item not found" });
        var shouldPreserveEffects = ${preserveEffectsFlag} === 1;
        var preservedEffects = [];
        var reappliedEffects = [];
        var intrinsicComponentNames = {
          "Motion": true,
          "Opacity": true,
          "Time Remapping": true,
          "Volume": true,
          "Channel Volume": true,
          "Panner": true
        };
        if (shouldPreserveEffects && info.clip.components) {
          for (var componentIndex = 0; componentIndex < info.clip.components.numItems; componentIndex++) {
            var component = info.clip.components[componentIndex];
            if (intrinsicComponentNames[component.displayName]) {
              continue;
            }
            var componentProperties = [];
            if (component.properties) {
              for (var propertyIndex = 0; propertyIndex < component.properties.numItems; propertyIndex++) {
                var property = component.properties[propertyIndex];
                try {
                  var propertyValue = property.getValue();
                  var propertyType = typeof propertyValue;
                  if (propertyType === "string" || propertyType === "number" || propertyType === "boolean") {
                    componentProperties.push({
                      displayName: property.displayName,
                      value: propertyValue
                    });
                  }
                } catch (propertyError) {}
              }
            }
            preservedEffects.push({
              displayName: component.displayName,
              matchName: component.matchName,
              properties: componentProperties
            });
          }
        }
        var startTime = info.clip.start.seconds;
        info.clip.remove(false, true);
        info.track.overwriteClip(newItem, startTime);
        if (shouldPreserveEffects && preservedEffects.length > 0) {
          app.enableQE();
          var replacementClip = null;
          if (info.track.clips && info.clipIndex < info.track.clips.numItems) {
            replacementClip = info.track.clips[info.clipIndex];
          }
          if (!replacementClip && info.track.clips) {
            for (var replacementIndex = 0; replacementIndex < info.track.clips.numItems; replacementIndex++) {
              var candidateClip = info.track.clips[replacementIndex];
              if (Math.abs(candidateClip.start.seconds - startTime) < 0.001) {
                replacementClip = candidateClip;
                break;
              }
            }
          }
          var qeSeq = qe.project.getActiveSequence();
          if (replacementClip && qeSeq) {
            var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
            var qeClip = qeTrack ? qeTrack.getItemAt(info.clipIndex) : null;
            if (qeClip) {
              for (var effectIndex = 0; effectIndex < preservedEffects.length; effectIndex++) {
                var effectRecord = preservedEffects[effectIndex];
                var qeEffect = null;
                if (info.trackType === 'video') {
                  qeEffect = qe.project.getVideoEffectByName(effectRecord.matchName || effectRecord.displayName) || qe.project.getVideoEffectByName(effectRecord.displayName);
                } else {
                  qeEffect = qe.project.getAudioEffectByName(effectRecord.matchName || effectRecord.displayName) || qe.project.getAudioEffectByName(effectRecord.displayName);
                }
                if (!qeEffect) {
                  continue;
                }
                if (info.trackType === 'video') {
                  qeClip.addVideoEffect(qeEffect);
                } else {
                  qeClip.addAudioEffect(qeEffect);
                }
                var appliedComponent = null;
                for (var appliedIndex = replacementClip.components.numItems - 1; appliedIndex >= 0; appliedIndex--) {
                  var candidateComponent = replacementClip.components[appliedIndex];
                  if (
                    candidateComponent.displayName === effectRecord.displayName
                    || candidateComponent.matchName === effectRecord.matchName
                  ) {
                    appliedComponent = candidateComponent;
                    break;
                  }
                }
                if (!appliedComponent && replacementClip.components.numItems > 0) {
                  appliedComponent = replacementClip.components[replacementClip.components.numItems - 1];
                }
                if (appliedComponent && appliedComponent.properties) {
                  for (var effectPropertyIndex = 0; effectPropertyIndex < effectRecord.properties.length; effectPropertyIndex++) {
                    var propertyRecord = effectRecord.properties[effectPropertyIndex];
                    for (var appliedPropertyIndex = 0; appliedPropertyIndex < appliedComponent.properties.numItems; appliedPropertyIndex++) {
                      var targetProperty = appliedComponent.properties[appliedPropertyIndex];
                      if (targetProperty.displayName !== propertyRecord.displayName) {
                        continue;
                      }
                      try {
                        var targetValue = propertyRecord.value;
                        if (typeof targetValue === "boolean") {
                          targetValue = targetValue ? 1 : 0;
                        }
                        targetProperty.setValue(targetValue, 1);
                      } catch (applyPropertyError) {}
                    }
                  }
                }
                reappliedEffects.push(effectRecord.displayName || effectRecord.matchName);
              }
            }
          }
        }
        return JSON.stringify({
          success: true,
          message: "Clip replaced",
          preserveEffects: shouldPreserveEffects,
          preservedEffects: preservedEffects.length,
          reappliedEffects: reappliedEffects
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Project Settings
  private async getSequenceSettings(_sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(_sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        }
        var settings = sequence.getSettings();
        return JSON.stringify({
          success: true,
          settings: {
            name: sequence.name,
            sequenceID: sequence.sequenceID,
            width: settings.videoFrameWidth,
            height: settings.videoFrameHeight,
            timebase: sequence.timebase,
            videoDisplayFormat: settings.videoDisplayFormat,
            audioChannelType: settings.audioChannelType,
            audioSampleRate: settings.audioSampleRate
          }
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async setSequenceSettings(_sequenceId: string, _settings: any): Promise<any> {
    return {
      success: false,
      error: "set_sequence_settings: Sequence settings cannot be changed after creation in Premiere Pro",
      note: "Create a new sequence with desired settings instead"
    };
  }

  private async getClipProperties(clipId: string): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var sequence = __findSequence(info.sequenceId) || app.project.activeSequence;
        var resolved = {
          opacity: null,
          scale: null,
          rotation: null,
          position: null,
          hostPosition: null
        };
        for (var i = 0; i < clip.components.numItems; i++) {
          var component = clip.components[i];
          for (var j = 0; j < component.properties.numItems; j++) {
            var property = component.properties[j];
            try {
              if (property.displayName === "Opacity") resolved.opacity = property.getValue();
              if (property.displayName === "Scale") resolved.scale = property.getValue();
              if (property.displayName === "Rotation") resolved.rotation = property.getValue();
              if (property.displayName === "Position") {
                var valueInfo = __convertKeyframeValueForUserOutput(
                  sequence,
                  component.displayName,
                  property.displayName,
                  property.getValue()
                );
                resolved.position = valueInfo.displayValue;
                resolved.hostPosition = valueInfo.hostValue;
              }
            } catch (propertyReadError) {}
          }
        }
        return JSON.stringify({
          success: true,
          properties: {
            name: clip.name,
            start: clip.start.seconds,
            end: clip.end.seconds,
            duration: clip.duration.seconds,
            inPoint: clip.inPoint.seconds,
            outPoint: clip.outPoint.seconds,
            enabled: !clip.disabled,
            trackIndex: info.trackIndex,
            trackType: info.trackType,
            speed: clip.getSpeed(),
            opacity: resolved.opacity,
            scale: resolved.scale,
            rotation: resolved.rotation,
            position: resolved.position,
            hostPosition: resolved.hostPosition
          }
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async inspectClipComponents(
    trackIndex: number,
    clipIndex: number,
    trackType: 'video' | 'audio' = 'video',
  ): Promise<any> {
    const trackAccessor = trackType === 'audio' ? 'audioTracks' : 'videoTracks';
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({ success: false, error: "No active sequence" });
        }
        var track = sequence.${trackAccessor}[${trackIndex}];
        if (!track) {
          return JSON.stringify({
            success: false,
            error: "Track not found",
            trackType: ${JSON.stringify(trackType)},
            trackIndex: ${trackIndex}
          });
        }
        var clip = track.clips[${clipIndex}];
        if (!clip) {
          return JSON.stringify({
            success: false,
            error: "Clip not found",
            trackType: ${JSON.stringify(trackType)},
            trackIndex: ${trackIndex},
            clipIndex: ${clipIndex}
          });
        }
        var components = [];
        for (var componentIndex = 0; componentIndex < clip.components.numItems; componentIndex++) {
          var component = clip.components[componentIndex];
          var properties = [];
          if (component.properties) {
            for (var propertyIndex = 0; propertyIndex < component.properties.numItems; propertyIndex++) {
              properties.push(component.properties[propertyIndex].displayName || "");
            }
          }
          components.push({
            name: component.displayName || "",
            matchName: component.matchName || "",
            properties: properties
          });
        }
        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          trackType: ${JSON.stringify(trackType)},
          trackIndex: ${trackIndex},
          clipIndex: ${clipIndex},
          clipId: clip.nodeId || "",
          clipName: clip.name || "",
          components: components
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString(),
          trackType: ${JSON.stringify(trackType)},
          trackIndex: ${trackIndex},
          clipIndex: ${clipIndex}
        });
      }
    `;
    return await this.runScript(script);
  }

  private async getClipEffects(clipId: string): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var effects = [];
        for (var i = 0; i < clip.components.numItems; i++) {
          var component = clip.components[i];
          effects.push({
            name: component.displayName || "",
            matchName: component.matchName || ""
          });
        }
        return JSON.stringify({
          success: true,
          clipId: ${JSON.stringify(clipId)},
          effects: effects
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.runScript(script);
  }

  private async setClipProperties(clipId: string, properties: any): Promise<any> {
    const propCode = [
      properties?.opacity !== undefined ? `if (p.displayName === "Opacity") p.setValue(${properties.opacity}, true);` : '',
      properties?.scale !== undefined ? `if (p.displayName === "Scale") p.setValue(${properties.scale}, true);` : '',
      properties?.rotation !== undefined ? `if (p.displayName === "Rotation") p.setValue(${properties.rotation}, true);` : '',
    ].filter(Boolean).join('\n              ');

    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          for (var j = 0; j < comp.properties.numItems; j++) {
            var p = comp.properties[j];
            try {
              ${propCode}
            } catch (e2) {}
          }
        }
        return JSON.stringify({ success: true, message: "Clip properties updated" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Render Queue
  private async addToRenderQueue(sequenceId: string, outputPath: string, presetPath?: string, startImmediately = false): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found",
            sequenceId: ${JSON.stringify(sequenceId)}
          });
        }

        var encoder = app.encoder;
        if (!encoder) {
          return JSON.stringify({
            success: false,
            error: "Adobe Media Encoder integration is not available"
          });
        }

        if (typeof encoder.launchEncoder === "function") {
          try {
            encoder.launchEncoder();
          } catch (launchError) {}
        }

        var presetPathValue = ${JSON.stringify(presetPath ?? '')};
        var jobId = encoder.encodeSequence(
          sequence,
          ${JSON.stringify(outputPath)},
          presetPathValue,
          encoder.ENCODE_ENTIRE,
          false
        );

        var startedImmediately = false;
        if (${startImmediately ? 'true' : 'false'}) {
          if (typeof encoder.startBatch === "function") {
            encoder.startBatch();
            startedImmediately = true;
          } else {
            return JSON.stringify({
              success: false,
              error: "Adobe Media Encoder startBatch is not available",
              sequenceId: ${JSON.stringify(sequenceId)},
              outputPath: ${JSON.stringify(outputPath)},
              jobId: jobId
            });
          }
        }

        return JSON.stringify({
          success: true,
          message: startedImmediately ? "Sequence added to render queue and started" : "Sequence added to render queue",
          sequenceId: ${JSON.stringify(sequenceId)},
          outputPath: ${JSON.stringify(outputPath)},
          presetPath: presetPathValue || undefined,
          jobId: jobId,
          startedImmediately: startedImmediately
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString(),
          sequenceId: ${JSON.stringify(sequenceId)},
          outputPath: ${JSON.stringify(outputPath)}
        });
      }
    `;
    return await this.runScript(script);
  }

  private async getRenderQueueStatus(): Promise<any> {
    return {
      success: false,
      error: "get_render_queue_status: Render queue monitoring requires Adobe Media Encoder integration",
      note: "Check Adobe Media Encoder application for render status"
    };
  }

  // Playhead & Work Area Implementation
  private async getPlayheadPosition(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var pos = sequence.getPlayerPosition();
        return JSON.stringify({
          success: true,
          position: __ticksToSeconds(pos.ticks),
          ticks: pos.ticks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async setPlayheadPosition(sequenceId: string, time: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        sequence.setPlayerPosition(ticks);
        return JSON.stringify({
          success: true,
          message: "Playhead position set",
          time: ${time}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async getSelectedClips(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var selection = sequence.getSelection();
        var clips = [];
        for (var i = 0; i < selection.length; i++) {
          var clip = selection[i];
          clips.push({
            nodeId: clip.nodeId,
            name: clip.name,
            start: clip.start.seconds,
            end: clip.end.seconds,
            duration: clip.duration.seconds,
            mediaType: clip.mediaType
          });
        }
        return JSON.stringify({
          success: true,
          clips: clips,
          count: clips.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Effect & Transition Discovery Implementation
  private async listAvailableEffects(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getVideoEffectList();
        return JSON.stringify({
          success: true,
          effects: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async listAvailableTransitions(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getVideoTransitionList();
        return JSON.stringify({
          success: true,
          transitions: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async listAvailableAudioEffects(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getAudioEffectList();
        return JSON.stringify({
          success: true,
          effects: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async listAvailableAudioTransitions(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getAudioTransitionList();
        return JSON.stringify({
          success: true,
          transitions: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Keyframe Implementation
  private async addKeyframe(
    clipId: string,
    componentName: string,
    paramName: string,
    time: number,
    value: KeyframeValue,
    interpolation?: PremiereKeyframeInterpolation,
  ): Promise<any> {
    const serializedValue = JSON.stringify(value);
    const debugEchoArgs = process.env.PREMIERE_ADD_KEYFRAME_DEBUG === '1';
    const debugEchoLiteral = debugEchoArgs ? 'true' : 'false';
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const componentNameLiteral = this.toExtendScriptString(componentName);
    const paramNameLiteral = this.toExtendScriptString(paramName);
    const interpolationLiteral =
      interpolation === undefined ? 'null' : this.toExtendScriptString(interpolation);
    const script = `
      try {
        if (${debugEchoLiteral}) {
          return JSON.stringify({
            success: true,
            debug: {
              clipId: ${clipIdLiteral},
              componentName: ${componentNameLiteral},
              paramName: ${paramNameLiteral},
              time: ${time},
              value: ${serializedValue},
              interpolation: ${interpolationLiteral}
            }
          });
        }
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var sequence = __findSequence(info.sequenceId) || app.project.activeSequence;
        var param = __findComponentParam(clip, ${componentNameLiteral}, ${paramNameLiteral});
        if (!param) {
          return JSON.stringify({
            success: false,
            error: "Parameter " + ${paramNameLiteral} + " not found in component " + ${componentNameLiteral}
          });
        }
        var compAliases = ${JSON.stringify({ Opacity: ['不透明度','Opacity'], Motion: ['运动','Motion'] })};
        var paramAliases = ${JSON.stringify({ Opacity: ['不透明度','Opacity'], Scale: ['缩放','Scale'], Position: ['位置','Position'], Rotation: ['旋转','Rotation'], 'Anchor Point': ['锚点','Anchor Point'] })};
        compAliases = ${COMPONENT_ALIASES_LITERAL};
        paramAliases = ${PARAM_ALIASES_LITERAL};
        var compNames = compAliases[${componentNameLiteral}] || [${componentNameLiteral}];
        var paramNames = paramAliases[${paramNameLiteral}] || [${paramNameLiteral}];
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          var compMatch = false;
          for (var ci = 0; ci < compNames.length; ci++) { if (comp.displayName === compNames[ci]) { compMatch = true; break; } }
          if (compMatch) {
            for (var j = 0; j < comp.properties.numItems; j++) {
              for (var pi = 0; pi < paramNames.length; pi++) {
                if (comp.properties[j].displayName === paramNames[pi]) { param = comp.properties[j]; break; }
              }
              if (param) break;
            }
            if (param) break;
          }
        }
        var resolvedComponentName = ${componentNameLiteral};
        var resolvedParamName = ${paramNameLiteral};
        var clipDurationTicks = __resolveClipDurationTicks(clip);
        var keyTimeTicks = __secondsToTicks(${time});
        var keyTimeTicksNumber = parseInt(String(keyTimeTicks), 10);
        if (clipDurationTicks !== null && !isNaN(keyTimeTicksNumber)) {
          if (keyTimeTicksNumber < 0 || keyTimeTicksNumber > clipDurationTicks) {
            return JSON.stringify({
              success: false,
              error: "Time " + ${time} + "s is outside clip duration (" + __ticksToSeconds(clipDurationTicks).toFixed(2) + "s). Use clip-relative time, not sequence time.",
              componentName: ${componentNameLiteral},
              paramName: ${paramNameLiteral},
              time: ${time},
              ticks: keyTimeTicks,
              clipDurationSeconds: Number(__ticksToSeconds(clipDurationTicks).toFixed(6)),
              timeReference: "clip-relative"
            });
          }
        }
        var requestedInterpolation = ${interpolationLiteral};
        var interpolationMode = __resolveKeyframeInterpolationMode(requestedInterpolation);
        var hostInterpolation = __resolveHostKeyframeInterpolationName(requestedInterpolation);
        var interpolationApplied = null;
        var interpolationFallbackApplied = requestedInterpolation === 'continuous_bezier';
        var interpolationWarning = __buildKeyframeInterpolationWarning(requestedInterpolation);
        var requestedValue = ${serializedValue};
        var hostValueInfo = __prepareKeyframeValueForHost(
          sequence,
          resolvedComponentName,
          resolvedParamName,
          requestedValue
        );
        param.setTimeVarying(true);
        param.addKey(keyTimeTicks);
        param.setValueAtKey(keyTimeTicks, hostValueInfo.hostValue, true);
        if (!__keyExistsAtTicks(param, keyTimeTicks)) {
          return JSON.stringify({
            success: false,
            error: "Keyframe was not created at the requested clip-relative time.",
            componentName: ${componentNameLiteral},
            paramName: ${paramNameLiteral},
            time: ${time},
            ticks: keyTimeTicks
          });
        }
        if (interpolationMode !== null) {
          interpolationApplied = false;
          if (typeof param.setInterpolationTypeAtKey === "function") {
            try {
              param.setInterpolationTypeAtKey(keyTimeTicks, interpolationMode, true);
              interpolationApplied = true;
            } catch (interpolationError) {
              interpolationWarning = __mergeWarnings(interpolationWarning, interpolationError.toString());
            }
          } else {
            interpolationWarning = __mergeWarnings(
              interpolationWarning,
              "setInterpolationTypeAtKey is not available for this property."
            );
          }
        }
        var actualValueInfo = __convertKeyframeValueForUserOutput(
          sequence,
          resolvedComponentName,
          resolvedParamName,
          param.getValueAtKey(keyTimeTicks)
        );
        var displayValueMatches = __valuesRoughlyMatch(requestedValue, actualValueInfo.displayValue);
        var hostValueMatches = __valuesRoughlyMatch(hostValueInfo.hostValue, actualValueInfo.hostValue);
        if (!displayValueMatches && !hostValueMatches) {
          return JSON.stringify({
            success: false,
            error: "Keyframe added but value mismatch. Wrote: " + JSON.stringify(requestedValue) + ", Host wrote: " + JSON.stringify(hostValueInfo.hostValue) + ", Read back: " + JSON.stringify(actualValueInfo.displayValue) + ", Host read back: " + JSON.stringify(actualValueInfo.hostValue),
            componentName: ${componentNameLiteral},
            paramName: ${paramNameLiteral},
            time: ${time},
            ticks: keyTimeTicks,
            requestedValue: requestedValue,
            writtenValue: hostValueInfo.hostValue,
            hostValue: actualValueInfo.hostValue,
            value: actualValueInfo.displayValue,
            inputValueSpace: hostValueInfo.inputValueSpace,
            valueSpace: actualValueInfo.valueSpace,
            valueTransformApplied: hostValueInfo.valueTransformApplied,
            valueTransformWarning: hostValueInfo.warning
          });
        }
        return JSON.stringify({
          success: true,
          message: "Keyframe added",
          componentName: ${componentNameLiteral},
          paramName: ${paramNameLiteral},
          time: ${time},
          ticks: keyTimeTicks,
          requestedValue: requestedValue,
          writtenValue: hostValueInfo.hostValue,
          hostValue: actualValueInfo.hostValue,
          value: actualValueInfo.displayValue,
          inputValueSpace: hostValueInfo.inputValueSpace,
          valueSpace: actualValueInfo.valueSpace,
          valueTransformApplied: hostValueInfo.valueTransformApplied,
          valueTransformWarning: hostValueInfo.warning,
          interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation),
          hostInterpolation: hostInterpolation,
          interpolationApplied: interpolationApplied,
          interpolationFallbackApplied: interpolationFallbackApplied,
          interpolationWarning: interpolationWarning
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async setKeyframeInterpolation(
    clipId: string,
    componentName: string,
    paramName: string,
    time: number,
    interpolation: PremiereKeyframeInterpolation,
  ): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const componentNameLiteral = this.toExtendScriptString(componentName);
    const paramNameLiteral = this.toExtendScriptString(paramName);
    const interpolationLiteral = this.toExtendScriptString(interpolation);
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var param = __findComponentParam(clip, ${componentNameLiteral}, ${paramNameLiteral});
        if (!param) return JSON.stringify({ success: false, error: "Parameter " + ${paramNameLiteral} + " not found in component " + ${componentNameLiteral} });
        var keyTimeTicks = __secondsToTicks(${time});
        var requestedInterpolation = ${interpolationLiteral};
        var interpolationMode = __resolveKeyframeInterpolationMode(requestedInterpolation);
        if (interpolationMode === null) {
          return JSON.stringify({
            success: false,
            error: "Unsupported keyframe interpolation",
            interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation)
          });
        }
        if (!param.isTimeVarying || !param.isTimeVarying()) {
          return JSON.stringify({
            success: false,
            error: "Parameter is not time varying",
            interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation)
          });
        }
        if (!__keyExistsAtTicks(param, keyTimeTicks)) {
          return JSON.stringify({
            success: false,
            error: "Keyframe not found at time",
            time: ${time},
            ticks: keyTimeTicks,
            interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation)
          });
        }
        if (typeof param.setInterpolationTypeAtKey !== "function") {
          return JSON.stringify({
            success: false,
            error: "setInterpolationTypeAtKey is not available for this property.",
            time: ${time},
            ticks: keyTimeTicks,
            interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation)
          });
        }
        var interpolationWarning = __buildKeyframeInterpolationWarning(requestedInterpolation);
        try {
          param.setInterpolationTypeAtKey(keyTimeTicks, interpolationMode, true);
        } catch (interpolationError) {
          return JSON.stringify({
            success: false,
            error: interpolationError.toString(),
            time: ${time},
            ticks: keyTimeTicks,
            interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation),
            hostInterpolation: __resolveHostKeyframeInterpolationName(requestedInterpolation),
            interpolationFallbackApplied: requestedInterpolation === 'continuous_bezier',
            interpolationWarning: interpolationWarning
          });
        }
        return JSON.stringify({
          success: true,
          message: "Keyframe interpolation updated",
          componentName: ${componentNameLiteral},
          paramName: ${paramNameLiteral},
          time: ${time},
          ticks: keyTimeTicks,
          interpolation: __describeRequestedKeyframeInterpolation(requestedInterpolation),
          hostInterpolation: __resolveHostKeyframeInterpolationName(requestedInterpolation),
          interpolationApplied: true,
          interpolationFallbackApplied: requestedInterpolation === 'continuous_bezier',
          interpolationWarning: interpolationWarning
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async removeKeyframe(clipId: string, componentName: string, paramName: string, time: number): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const componentNameLiteral = this.toExtendScriptString(componentName);
    const paramNameLiteral = this.toExtendScriptString(paramName);
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var param = __findComponentParam(clip, ${componentNameLiteral}, ${paramNameLiteral});
        if (!param) return JSON.stringify({ success: false, error: "Parameter not found" });
        var keyTimeTicks = __secondsToTicks(${time});
        param.removeKey(keyTimeTicks);
        return JSON.stringify({
          success: true,
          message: "Keyframe removed",
          time: ${time},
          ticks: keyTimeTicks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async getKeyframes(clipId: string, componentName: string, paramName: string): Promise<any> {
    const clipIdLiteral = this.toExtendScriptString(clipId);
    const componentNameLiteral = this.toExtendScriptString(componentName);
    const paramNameLiteral = this.toExtendScriptString(paramName);
    const script = `
      try {
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var param = __findComponentParam(clip, ${componentNameLiteral}, ${paramNameLiteral});
        if (!param) return JSON.stringify({ success: false, error: "Parameter not found" });
        var sequence = __findSequence(info.sequenceId) || app.project.activeSequence;
        var isTimeVarying = param.isTimeVarying();
        if (!isTimeVarying) {
          var staticValueInfo = __convertKeyframeValueForUserOutput(
            sequence,
            ${componentNameLiteral},
            ${paramNameLiteral},
            param.getValue()
          );
          return JSON.stringify({
            success: true,
            isTimeVarying: false,
            keyframes: [],
            staticValue: staticValueInfo.displayValue,
            hostStaticValue: staticValueInfo.hostValue,
            valueSpace: staticValueInfo.valueSpace
          });
        }
        var keyCount = typeof param.getKeyCount === "function"
          ? param.getKeyCount()
          : (typeof param.getKeys === "function" ? param.getKeys().length : 0);
        var result = [];
        for (var k = 0; k < keyCount; k++) {
          var keyTicks = null;
          if (typeof param.getKeyTime === "function") {
            keyTicks = param.getKeyTime(k);
          } else if (typeof param.getKeys === "function") {
            var allKeys = param.getKeys();
            keyTicks = allKeys && allKeys.length > k ? allKeys[k] : null;
          }
          if (keyTicks === null) {
            continue;
          }
          var keyTimeTicks = __readKeyTicksValue(keyTicks);
          var keyTimeSeconds = __readKeySecondsValue(keyTicks);
          var interpolationRaw = null;
          var interpolation = null;
          if (typeof param.getInterpolationTypeAtKey === "function") {
            try {
              interpolationRaw = param.getInterpolationTypeAtKey(keyTicks);
              interpolation = __describeKeyframeInterpolationMode(interpolationRaw);
            } catch (interpolationError) {}
          }
          var valueInfo = __convertKeyframeValueForUserOutput(
            sequence,
            ${componentNameLiteral},
            ${paramNameLiteral},
            param.getValueAtKey(keyTicks)
          );
          result.push({
            time: keyTimeSeconds,
            ticks: keyTimeTicks,
            value: valueInfo.displayValue,
            hostValue: valueInfo.hostValue,
            valueSpace: valueInfo.valueSpace,
            interpolation: interpolation,
            interpolationRaw: interpolationRaw
          });
        }
        return JSON.stringify({
          success: true,
          isTimeVarying: true,
          keyframes: result,
          count: result.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Work Area Implementation
  private async setWorkArea(sequenceId: string, inPoint: number, outPoint: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        sequence.setWorkAreaInPoint(__secondsToTicks(${inPoint}));
        sequence.setWorkAreaOutPoint(__secondsToTicks(${outPoint}));
        return JSON.stringify({
          success: true,
          message: "Work area set",
          inPoint: ${inPoint},
          outPoint: ${outPoint}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async getWorkArea(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var inTime = sequence.getWorkAreaInPointAsTime();
        var outTime = sequence.getWorkAreaOutPointAsTime();
        return JSON.stringify({
          success: true,
          inPoint: inTime.seconds,
          outPoint: outTime.seconds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Batch Operations Implementation
  private async batchAddTransitions(
    sequenceId: string,
    trackIndex: number,
    transitionName: string,
    duration: number,
    trackType: 'video' | 'audio' = 'video',
  ): Promise<any> {
    const trackAccessor = trackType === 'audio' ? 'audioTracks' : 'videoTracks';
    const qeTrackAccessor = trackType === 'audio' ? 'getAudioTrackAt' : 'getVideoTrackAt';
    const transitionAccessor = trackType === 'audio' ? 'getAudioTransitionByName' : 'getVideoTransitionByName';
    const script = `
      try {
        app.enableQE();
        var baseContext = {
          sequenceId: ${JSON.stringify(sequenceId)},
          trackType: ${JSON.stringify(trackType)},
          trackIndex: ${trackIndex},
          transitionName: ${JSON.stringify(transitionName)},
          duration: ${duration}
        };
        var sequence = __openSequenceById(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence || !app.project.activeSequence || app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          return __buildTransitionFailure("sequence_activation_failed", "Sequence could not be activated for batch transition insertion", baseContext);
        }
        baseContext.sequenceId = sequence.sequenceID;
        baseContext.sequenceName = sequence.name;
        var track = sequence.${trackAccessor}[${trackIndex}];
        if (!track) return __buildTransitionFailure("track_not_found", "Track not found at index ${trackIndex}", baseContext);
        var clipCount = track.clips.numItems;
        if (clipCount < 2) return __buildTransitionFailure("insufficient_clips", "Need at least 2 clips to add transitions, found " + clipCount, __appendResultContext({
          totalClips: clipCount
        }, baseContext));
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return __buildTransitionFailure("qe_sequence_unavailable", "QE active sequence unavailable after activation", baseContext);
        var qeTrack = qeSeq.${qeTrackAccessor}(${trackIndex});
        if (!qeTrack) return __buildTransitionFailure("qe_track_unavailable", "QE track unavailable after activation", baseContext);
        var transition = qe.project.${transitionAccessor}(${JSON.stringify(transitionName)});
        if (!transition) return __buildTransitionFailure("transition_not_found", "Transition not found: " + ${JSON.stringify(transitionName)}, baseContext);
        var added = 0;
        var errors = [];
        var frames = __getDurationFramesForSequence(sequence, ${duration});
        if (frames === null) {
          return __buildTransitionFailure("sequence_timebase_unavailable", "Sequence timebase is unavailable, so transition duration could not be converted to frames", baseContext);
        }
        for (var i = 0; i < clipCount - 1; i++) {
          var currentClip = track.clips[i];
          var nextClip = track.clips[i + 1];
          var deltaToNext = nextClip.start.seconds - currentClip.end.seconds;
          var boundaryContext = __appendResultContext({
            clipIndex: i,
            clipIndex1: i,
            clipIndex2: i + 1,
            durationFrames: frames
          }, baseContext);
          if (deltaToNext > 0.05) {
            errors.push(__appendResultContext({
              stage: "invalid_clip_pair",
              error: "Clips leave a visible gap and cannot share a transition",
              gapAfterSec: deltaToNext
            }, boundaryContext));
            continue;
          }
          if (deltaToNext < -0.05) {
            errors.push(__appendResultContext({
              stage: "invalid_clip_pair",
              error: "Clips overlap on the timeline and do not expose a clean transition boundary",
              overlapAfterSec: Math.abs(deltaToNext)
            }, boundaryContext));
            continue;
          }
          try {
            var qeClip = qeTrack.getItemAt(i);
            if (!qeClip) {
              errors.push(__appendResultContext({
                stage: "qe_clip_unavailable",
                error: "QE clip unavailable at the requested transition boundary"
              }, boundaryContext));
              continue;
            }
            qeClip.addTransition(transition, true, String(frames), "0:00", 0.5, false, true);
            added++;
          } catch (e) {
            errors.push(__appendResultContext({
              stage: "qe_add_transition_failed",
              error: e.toString()
            }, boundaryContext));
          }
        }
        return JSON.stringify({
          success: errors.length === 0,
          partialSuccess: added > 0 && errors.length > 0,
          transitionsAdded: added,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          totalClips: clipCount,
          attemptedBoundaries: Math.max(clipCount - 1, 0),
          trackType: ${JSON.stringify(trackType)},
          trackIndex: ${trackIndex},
          durationFrames: frames,
          errors: errors
        });
      } catch (e) {
        return __buildTransitionFailure("qe_add_transition_failed", e.toString(), {
          sequenceId: ${JSON.stringify(sequenceId)},
          trackType: ${JSON.stringify(trackType)},
          trackIndex: ${trackIndex},
          transitionName: ${JSON.stringify(transitionName)},
          duration: ${duration}
        });
      }
    `;
    return await this.runScript(script);
  }

  private async batchApplyEffect(sequenceIds: string[], trackIndex: number, effectName: string, parameters?: Record<string, any>): Promise<any> {
    const seqList = await this.listSequences() as any;
    const allSeqs: Array<{sequenceID: string}> = seqList?.sequences ?? [];
    const targets = sequenceIds.includes('*') ? allSeqs.map((s) => s.sequenceID) : sequenceIds;
    const results: Array<Record<string, any>> = [];
    for (const seqId of targets) {
      const script = `
        try {
          var sequence = __findSequence(${JSON.stringify(seqId)});
          if (!sequence) return JSON.stringify({ success: false, error: 'Sequence not found', sequenceId: ${JSON.stringify(seqId)} });
          var track = sequence.videoTracks[${trackIndex}];
          if (!track) return JSON.stringify({ success: false, error: 'Track not found', sequenceId: ${JSON.stringify(seqId)} });
          var applied = 0;
          for (var i = 0; i < track.clips.numItems; i++) {
            var clip = track.clips[i];
            clip.components.addItem(${JSON.stringify(effectName)});
            applied++;
          }
          return JSON.stringify({ success: true, sequenceId: ${JSON.stringify(seqId)}, clipsProcessed: applied });
        } catch(e) { return JSON.stringify({ success: false, error: e.toString(), sequenceId: ${JSON.stringify(seqId)} }); }
      `;
      results.push(await this.runScript(script) as Record<string, any>);
    }
    return { success: true, results, totalSequences: targets.length };
  }

  private async batchExport(exports: Array<{sequenceId: string; outputPath: string; format?: string; presetPath?: string}>): Promise<any> {
    const results: Array<Record<string, any>> = [];
    for (const job of exports) {
      const result = await this.exportSequence(job.sequenceId, job.outputPath, job.presetPath, job.format);
      results.push({ sequenceId: job.sequenceId, outputPath: job.outputPath, ...result });
    }
    const succeeded = results.filter((r) => r.success).length;
    return { success: succeeded === exports.length, results, succeeded, total: exports.length };
  }

  private async batchColorCorrect(sequenceIds: string[], trackIndex: number, adjustments: Record<string, number>): Promise<any> {
    const seqList = await this.listSequences() as any;
    const allSeqs: Array<{sequenceID: string}> = seqList?.sequences ?? [];
    const targets = sequenceIds.includes('*') ? allSeqs.map((s) => s.sequenceID) : sequenceIds;
    const results: Array<Record<string, any>> = [];
    for (const seqId of targets) {
      const script = `
        try {
          var sequence = __findSequence(${JSON.stringify(seqId)});
          if (!sequence) return JSON.stringify({ success: false, error: 'Sequence not found', sequenceId: ${JSON.stringify(seqId)} });
          var track = sequence.videoTracks[${trackIndex}];
          if (!track) return JSON.stringify({ success: false, error: 'Track not found', sequenceId: ${JSON.stringify(seqId)} });
          var applied = 0;
          for (var i = 0; i < track.clips.numItems; i++) {
            var clip = track.clips[i];
            for (var c = 0; c < clip.components.numItems; c++) {
              var comp = clip.components[c];
              if (comp.displayName === 'Lumetri Color') {
                for (var p = 0; p < comp.properties.numItems; p++) {
                  var prop = comp.properties[p];
                  var adj = ${JSON.stringify(adjustments)};
                  if (adj[prop.displayName.toLowerCase()] !== undefined) prop.setValue(adj[prop.displayName.toLowerCase()], true);
                }
                applied++;
              }
            }
          }
          return JSON.stringify({ success: true, sequenceId: ${JSON.stringify(seqId)}, clipsProcessed: applied });
        } catch(e) { return JSON.stringify({ success: false, error: e.toString(), sequenceId: ${JSON.stringify(seqId)} }); }
      `;
      results.push(await this.runScript(script) as Record<string, any>);
    }
    return { success: true, results, totalSequences: targets.length };
  }

  // Project Item Discovery & Management Implementation
  private async findProjectItemByName(name: string, type?: string): Promise<any> {
    const filterType = type || 'any';
    const script = `
      try {
        var searchName = ${JSON.stringify(name)}.toLowerCase();
        var filterType = ${JSON.stringify(filterType)};
        var results = [];
        function walkItems(parent) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            var itemType = item.type === 2 ? "bin" : (item.isSequence() ? "sequence" : "footage");
            if (item.name.toLowerCase().indexOf(searchName) !== -1) {
              if (filterType === "any" || filterType === itemType) {
                var info = {
                  id: item.nodeId,
                  name: item.name,
                  type: itemType,
                  treePath: item.treePath
                };
                try { info.mediaPath = item.getMediaPath(); } catch(e) {}
                results.push(info);
              }
            }
            if (item.type === 2) {
              walkItems(item);
            }
          }
        }
        walkItems(app.project.rootItem);
        return JSON.stringify({
          success: true,
          items: results,
          count: results.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async moveItemToBin(projectItemId: string, targetBinId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var bin = __findProjectItem(${JSON.stringify(targetBinId)});
        if (!bin) return JSON.stringify({ success: false, error: "Target bin not found" });
        item.moveBin(bin);
        return JSON.stringify({
          success: true,
          message: "Item moved to bin",
          itemId: ${JSON.stringify(projectItemId)},
          targetBinId: ${JSON.stringify(targetBinId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Active Sequence Management Implementation
  private async setActiveSequence(sequenceId: string): Promise<any> {
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        app.project.openSequence(seq.sequenceID);
        return JSON.stringify({
          success: true,
          message: "Active sequence set",
          sequenceId: seq.sequenceID,
          name: seq.name
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async getActiveSequence(): Promise<any> {
    const script = `
      try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No active sequence" });
        return JSON.stringify({
          success: true,
          id: seq.sequenceID,
          name: seq.name,
          duration: __ticksToSeconds(seq.end),
          videoTrackCount: seq.videoTracks.numTracks,
          audioTrackCount: seq.audioTracks.numTracks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Clip Lookup Implementation
  private async getClipAtPosition(sequenceId: string, trackType: string, trackIndex: number, time: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var tracks = ${JSON.stringify(trackType)} === "video" ? sequence.videoTracks : sequence.audioTracks;
        if (${trackIndex} < 0 || ${trackIndex} >= tracks.numTracks) return JSON.stringify({ success: false, error: "Track index out of range" });
        var track = tracks[${trackIndex}];
        var targetTime = ${time};
        for (var i = 0; i < track.clips.numItems; i++) {
          var clip = track.clips[i];
          if (clip.start.seconds <= targetTime && clip.end.seconds > targetTime) {
            return JSON.stringify({
              success: true,
              clip: {
                nodeId: clip.nodeId,
                name: clip.name,
                start: clip.start.seconds,
                end: clip.end.seconds,
                duration: clip.duration.seconds,
                inPoint: clip.inPoint.seconds,
                outPoint: clip.outPoint.seconds,
                trackIndex: ${trackIndex},
                trackType: ${JSON.stringify(trackType)},
                clipIndex: i
              }
            });
          }
        }
        return JSON.stringify({
          success: true,
          clip: null,
          message: "No clip found at time " + targetTime + "s on " + ${JSON.stringify(trackType)} + " track " + ${trackIndex}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Auto Reframe Implementation
  private async autoReframeSequence(sequenceId: string, numerator: number, denominator: number, motionPreset?: string, newName?: string): Promise<any> {
    const preset = motionPreset || 'default';
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var reframedName = ${newName ? JSON.stringify(newName) : 'sequence.name + " Reframed"'};
        sequence.autoReframeSequence(${numerator}, ${denominator}, ${JSON.stringify(preset)}, reframedName, false);
        return JSON.stringify({
          success: true,
          message: "Sequence auto-reframed",
          aspectRatio: ${numerator} + ":" + ${denominator},
          motionPreset: ${JSON.stringify(preset)},
          newName: reframedName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Scene Edit Detection Implementation
  private async detectSceneEdits(sequenceId: string, action?: string, applyCutsToLinkedAudio?: boolean, sensitivity?: string): Promise<any> {
    const actionVal = action || 'CreateMarkers';
    const applyCutsToLinkedAudioFlag = this.coerceBooleanFlag(applyCutsToLinkedAudio, true);
    const sensitivityVal = sensitivity || 'Medium';
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        sequence.performSceneEditDetectionOnSelection(${JSON.stringify(actionVal)}, ${applyCutsToLinkedAudioFlag}, ${JSON.stringify(sensitivityVal)});
        return JSON.stringify({
          success: true,
          message: "Scene edit detection performed",
          action: ${JSON.stringify(actionVal)},
          applyCutsToLinkedAudio: ${applyCutsToLinkedAudioFlag} === 1,
          sensitivity: ${JSON.stringify(sensitivityVal)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Caption Track Implementation
  private async generateSubtitlesTool(args: {
    audioPath: string;
    sequenceId?: string;
    language?: string;
    outputSrtPath?: string;
    captionFormat?: string;
    backend?: 'auto' | 'openai' | 'faster-whisper';
    fasterWhisperModel?: string;
    apiKey?: string;
  }): Promise<any> {
    let result;
    try {
      result = await generateSubtitles({
        audioPath: args.audioPath,
        language: args.language,
        apiKey: args.apiKey,
        outputSrtPath: args.outputSrtPath,
        backend: args.backend,
        fasterWhisperModel: args.fasterWhisperModel,
      });
    } catch (e: any) {
      return { success: false, error: e.message ?? String(e) };
    }
    const importResult = await this.importMedia(result.srtPath) as any;
    if (!importResult?.success) {
      return { success: false, error: 'Failed to import SRT into project', srtPath: result.srtPath, subtitles: result };
    }
    const projectItemId = importResult.projectItemId ?? importResult.nodeId;
    let captionTrack = null;
    if (args.sequenceId && projectItemId) {
      captionTrack = await this.createCaptionTrack(args.sequenceId, projectItemId, 0, args.captionFormat ?? 'Subtitle Default');
    }
    return {
      success: true,
      srtPath: result.srtPath,
      language: result.language,
      durationSec: result.durationSec,
      backend: result.backend,
      warnings: result.warnings,
      entryCount: result.entries.length,
      projectItemId,
      captionTrack,
    };
  }

  private async createCaptionTrack(sequenceId: string, projectItemId: string, startTime?: number, captionFormat?: string): Promise<any> {
    const startTimeVal = startTime || 0;
    const formatVal = captionFormat || 'Subtitle Default';
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var projectItem = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!projectItem) return JSON.stringify({ success: false, error: "Caption project item not found" });
        var startAtTime = ${startTimeVal};
        sequence.createCaptionTrack(projectItem, startAtTime, ${JSON.stringify(formatVal)});
        return JSON.stringify({
          success: true,
          message: "Caption track created",
          captionFormat: ${JSON.stringify(formatVal)},
          startTime: ${startTimeVal}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Subclip Implementation
  private async createSubclip(projectItemId: string, name: string, startTime: number, endTime: number, hasHardBoundaries?: boolean, takeAudio?: boolean, takeVideo?: boolean): Promise<any> {
    const hardBounds = hasHardBoundaries ? 1 : 0;
    const audio = takeAudio !== false ? 1 : 0;
    const video = takeVideo !== false ? 1 : 0;
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var startTicks = __secondsToTicks(${startTime});
        var endTicks = __secondsToTicks(${endTime});
        item.createSubClip(${JSON.stringify(name)}, startTicks, endTicks, ${hardBounds}, ${audio}, ${video});
        return JSON.stringify({
          success: true,
          message: "Subclip created",
          name: ${JSON.stringify(name)},
          startTime: ${startTime},
          endTime: ${endTime}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Relink Media Implementation
  private async relinkMedia(projectItemId: string, newFilePath: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        if (item.canChangeMediaPath()) {
          item.changeMediaPath(${JSON.stringify(newFilePath)}, true);
          return JSON.stringify({
            success: true,
            message: "Media relinked successfully",
            projectItemId: ${JSON.stringify(projectItemId)},
            newFilePath: ${JSON.stringify(newFilePath)}
          });
        } else {
          return JSON.stringify({ success: false, error: "Cannot change media path for this item" });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private async deleteProjectItem(projectItemId: string, allowReferenced = false): Promise<any> {
    const script = `
      try {
        function __collectProjectItemReferences(nodeId) {
          var refs = [];
          if (!app.project || !app.project.sequences) return refs;
          for (var sequenceIndex = 0; sequenceIndex < app.project.sequences.numSequences; sequenceIndex++) {
            var sequence = app.project.sequences[sequenceIndex];
            if (!sequence) continue;
            for (var videoTrackIndex = 0; videoTrackIndex < sequence.videoTracks.numTracks; videoTrackIndex++) {
              var videoTrack = sequence.videoTracks[videoTrackIndex];
              for (var videoClipIndex = 0; videoClipIndex < videoTrack.clips.numItems; videoClipIndex++) {
                var videoClip = videoTrack.clips[videoClipIndex];
                if (!videoClip || !videoClip.projectItem) continue;
                if (String(videoClip.projectItem.nodeId || "") === String(nodeId || "")) {
                  refs.push({
                    sequenceId: String(sequence.sequenceID || ""),
                    sequenceName: String(sequence.name || ""),
                    trackType: "video",
                    trackIndex: videoTrackIndex,
                    clipIndex: videoClipIndex
                  });
                }
              }
            }
            for (var audioTrackIndex = 0; audioTrackIndex < sequence.audioTracks.numTracks; audioTrackIndex++) {
              var audioTrack = sequence.audioTracks[audioTrackIndex];
              for (var audioClipIndex = 0; audioClipIndex < audioTrack.clips.numItems; audioClipIndex++) {
                var audioClip = audioTrack.clips[audioClipIndex];
                if (!audioClip || !audioClip.projectItem) continue;
                if (String(audioClip.projectItem.nodeId || "") === String(nodeId || "")) {
                  refs.push({
                    sequenceId: String(sequence.sequenceID || ""),
                    sequenceName: String(sequence.name || ""),
                    trackType: "audio",
                    trackIndex: audioTrackIndex,
                    clipIndex: audioClipIndex
                  });
                }
              }
            }
          }
          return refs;
        }
        function __findSequenceByProjectItemId(nodeId) {
          if (!app.project || !app.project.sequences) return null;
          for (var sequenceIndex = 0; sequenceIndex < app.project.sequences.numSequences; sequenceIndex++) {
            var sequence = app.project.sequences[sequenceIndex];
            if (
              sequence &&
              sequence.projectItem &&
              String(sequence.projectItem.nodeId || "") === String(nodeId || "")
            ) {
              return sequence;
            }
          }
          return null;
        }
        function __resolveProjectViewIdForCurrentProject() {
          if (!app || typeof app.getProjectViewIDs !== "function") return null;
          var viewIds = app.getProjectViewIDs();
          if (!viewIds || viewIds.length === undefined) return null;
          var activeDocumentId = "";
          try {
            activeDocumentId = String(app.project.documentID || "");
          } catch (_activeDocumentError) {}
          for (var viewIndex = 0; viewIndex < viewIds.length; viewIndex++) {
            var viewId = String(viewIds[viewIndex] || "");
            if (!viewId) continue;
            if (typeof app.getProjectFromViewID !== "function") return viewId;
            try {
              var projectForView = app.getProjectFromViewID(viewId);
              if (!projectForView) continue;
              var projectDocumentId = "";
              try {
                projectDocumentId = String(projectForView.documentID || "");
              } catch (_projectDocumentError) {}
              if (!activeDocumentId || !projectDocumentId || projectDocumentId === activeDocumentId) {
                return viewId;
              }
            } catch (_projectViewError) {}
          }
          return null;
        }

        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) {
          return JSON.stringify({
            success: false,
            error: "Project item not found",
            projectItemId: ${JSON.stringify(projectItemId)}
          });
        }

        var isSequence = false;
        try {
          isSequence = !!(item.isSequence && item.isSequence());
        } catch (_isSequenceError) {}

        var itemType = item.type === 2 ? "bin" : (isSequence ? "sequence" : "footage");
        var selectionMode = "none";
        var references = __collectProjectItemReferences(${JSON.stringify(projectItemId)});
        if (references.length && ${allowReferenced ? 'false' : 'true'}) {
          return JSON.stringify({
            success: false,
            error: "Project item is still referenced by clips in the project",
            projectItemId: ${JSON.stringify(projectItemId)},
            itemType: itemType,
            referenceCount: references.length,
            references: references
          });
        }

        if (itemType === "bin") {
          item.deleteBin();
        } else if (itemType === "sequence") {
          var sequence = __findSequenceByProjectItemId(${JSON.stringify(projectItemId)});
          if (!sequence) {
            return JSON.stringify({
              success: false,
              error: "Sequence object not found for project item",
              projectItemId: ${JSON.stringify(projectItemId)},
              itemType: itemType
            });
          }
          app.project.deleteSequence(sequence);
        } else {
          if (!app.project || typeof app.project.deleteAsset !== "function") {
            return JSON.stringify({
              success: false,
              error: "Project.deleteAsset is not available in this Premiere host",
              projectItemId: ${JSON.stringify(projectItemId)},
              itemType: itemType
            });
          }
          var projectViewId = __resolveProjectViewIdForCurrentProject();
          if (
            projectViewId &&
            typeof app.setProjectViewSelection === "function"
          ) {
            try {
              app.setProjectViewSelection([item], projectViewId);
              selectionMode = "project_view";
            } catch (_setSelectionError) {}
          }
          if (selectionMode === "none") {
            if (!item.select || typeof item.select !== "function") {
              return JSON.stringify({
                success: false,
                error: "Project item selection is not available in this Premiere host",
                projectItemId: ${JSON.stringify(projectItemId)},
                itemType: itemType
              });
            }
            item.select();
            selectionMode = "project_item_select";
          }
          app.project.deleteAsset();
        }

        var remaining = __findProjectItem(${JSON.stringify(projectItemId)});
        return JSON.stringify({
          success: !remaining,
          deleted: !remaining,
          existsAfterDelete: !!remaining,
          projectItemId: ${JSON.stringify(projectItemId)},
          itemType: itemType,
          selectionMode: selectionMode,
          allowReferenced: ${allowReferenced ? 'true' : 'false'},
          referenceCount: references.length,
          references: references,
          error: remaining ? "Project item still exists after delete attempt" : undefined
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Set Color Label Implementation
  private async setColorLabel(projectItemId: string, colorIndex: number): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        item.setColorLabel(${colorIndex});
        return JSON.stringify({
          success: true,
          message: "Color label set",
          projectItemId: ${JSON.stringify(projectItemId)},
          colorIndex: ${colorIndex}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Get Color Label Implementation
  private async getColorLabel(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var colorLabel = item.getColorLabel();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          colorLabel: colorLabel
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Get Metadata Implementation
  private async getMetadata(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var projectMetadata = item.getProjectMetadata();
        var xmpMetadata = item.getXMPMetadata();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          projectMetadata: projectMetadata,
          xmpMetadata: xmpMetadata
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Set Metadata Implementation
  private async setMetadata(projectItemId: string, key: string, value: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var schema = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
        var fullKey = schema + ${JSON.stringify(key)};
        item.setProjectMetadata(${JSON.stringify(value)}, [fullKey]);
        return JSON.stringify({
          success: true,
          message: "Metadata set",
          projectItemId: ${JSON.stringify(projectItemId)},
          key: ${JSON.stringify(key)},
          value: ${JSON.stringify(value)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Get Footage Interpretation Implementation
  private async getFootageInterpretation(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var interp = item.getFootageInterpretation();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          frameRate: interp.frameRate,
          pixelAspectRatio: interp.pixelAspectRatio,
          fieldType: interp.fieldType,
          removePulldown: interp.removePulldown,
          alphaUsage: interp.alphaUsage
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Set Footage Interpretation Implementation
  private async setFootageInterpretation(projectItemId: string, frameRate?: number, pixelAspectRatio?: number): Promise<any> {
    const setFrameRate = frameRate !== undefined;
    const setPar = pixelAspectRatio !== undefined;
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var interp = item.getFootageInterpretation();
        ${setFrameRate ? 'interp.frameRate = ' + frameRate + ';' : ''}
        ${setPar ? 'interp.pixelAspectRatio = ' + pixelAspectRatio + ';' : ''}
        item.setFootageInterpretation(interp);
        return JSON.stringify({
          success: true,
          message: "Footage interpretation updated",
          projectItemId: ${JSON.stringify(projectItemId)},
          frameRate: interp.frameRate,
          pixelAspectRatio: interp.pixelAspectRatio
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Check Offline Media Implementation
  private async checkOfflineMedia(): Promise<any> {
    const script = `
      try {
        var offlineItems = [];
        function walkForOffline(parent) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            if (item.type === 2) {
              walkForOffline(item);
            } else {
              if (item.isOffline()) {
                offlineItems.push({
                  nodeId: item.nodeId,
                  name: item.name,
                  treePath: item.treePath
                });
              }
            }
          }
        }
        walkForOffline(app.project.rootItem);
        return JSON.stringify({
          success: true,
          offlineCount: offlineItems.length,
          offlineItems: offlineItems
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Export as FCP XML Implementation
  private async exportAsFcpXml(sequenceId: string, outputPath: string): Promise<any> {
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        seq.exportAsFinalCutProXML(${JSON.stringify(outputPath)});
        return JSON.stringify({
          success: true,
          message: "Exported as Final Cut Pro XML",
          sequenceId: ${JSON.stringify(sequenceId)},
          outputPath: ${JSON.stringify(outputPath)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Undo Implementation
  private async undo(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        qe.project.undo();
        return JSON.stringify({
          success: true,
          message: "Undo performed"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Set Sequence In/Out Points Implementation
  private async setSequenceInOutPoints(sequenceId: string, inPoint?: number, outPoint?: number): Promise<any> {
    const setIn = inPoint !== undefined;
    const setOut = outPoint !== undefined;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        ${setIn ? 'seq.setInPoint(__secondsToTicks(' + inPoint + '));' : ''}
        ${setOut ? 'seq.setOutPoint(__secondsToTicks(' + outPoint + '));' : ''}
        return JSON.stringify({
          success: true,
          message: "Sequence in/out points set",
          sequenceId: ${JSON.stringify(sequenceId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Get Sequence In/Out Points Implementation
  private async getSequenceInOutPoints(sequenceId: string): Promise<any> {
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var inTime = seq.getInPointAsTime();
        var outTime = seq.getOutPointAsTime();
        return JSON.stringify({
          success: true,
          sequenceId: ${JSON.stringify(sequenceId)},
          inPoint: inTime.seconds,
          outPoint: outTime.seconds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Export AAF Implementation
  private async exportAaf(sequenceId: string, outputPath: string, mixDownVideo?: boolean, explodeToMono?: boolean, sampleRate?: number, bitsPerSample?: number): Promise<any> {
    const mixDown = mixDownVideo !== false ? 1 : 0;
    const explode = explodeToMono ? 1 : 0;
    const rate = sampleRate || 48000;
    const bits = bitsPerSample || 16;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        app.project.exportAAF(seq, ${JSON.stringify(outputPath)}, ${mixDown}, ${explode}, ${rate}, ${bits}, 0, 0, 1, 0);
        return JSON.stringify({
          success: true,
          message: "Exported as AAF",
          sequenceId: ${JSON.stringify(sequenceId)},
          outputPath: ${JSON.stringify(outputPath)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Consolidate Duplicates Implementation
  private async consolidateDuplicates(): Promise<any> {
    const script = `
      try {
        app.project.consolidateDuplicates();
        return JSON.stringify({
          success: true,
          message: "Duplicates consolidated"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Refresh Media Implementation
  private async refreshMedia(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        item.refreshMedia();
        return JSON.stringify({
          success: true,
          message: "Media refreshed",
          projectItemId: ${JSON.stringify(projectItemId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Import Sequences From Project Implementation
  private async importSequencesFromProject(projectPath: string, sequenceIds: string[]): Promise<any> {
    const script = `
      try {
        var seqIds = ${JSON.stringify(sequenceIds)};
        app.project.importSequences(${JSON.stringify(projectPath)}, seqIds);
        return JSON.stringify({
          success: true,
          message: "Sequences imported from project",
          projectPath: ${JSON.stringify(projectPath)},
          sequenceIds: seqIds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Create Subsequence Implementation
  private async createSubsequence(sequenceId: string, ignoreTrackTargeting?: boolean): Promise<any> {
    const ignoreTargeting = ignoreTrackTargeting ? 'true' : 'false';
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var subseq = seq.createSubsequence(${ignoreTargeting});
        return JSON.stringify({
          success: true,
          message: "Subsequence created",
          sequenceId: subseq.sequenceID,
          name: subseq.name
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Import MOGRT Implementation
  private async importMogrt(sequenceId: string, mogrtPath: string, time: number, videoTrackIndex?: number, audioTrackIndex?: number): Promise<any> {
    const vidTrack = videoTrackIndex || 0;
    const audTrack = audioTrackIndex || 0;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        var clip = seq.importMGT(${JSON.stringify(mogrtPath)}, ticks, ${vidTrack}, ${audTrack});
        var clipId = "";
        if (clip && clip.nodeId) clipId = clip.nodeId;
        return JSON.stringify({
          success: true,
          message: "MOGRT imported",
          clipId: clipId
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  // Import MOGRT From Library Implementation
  private async importMogrtFromLibrary(sequenceId: string, libraryName: string, mogrtName: string, time: number, videoTrackIndex?: number, audioTrackIndex?: number): Promise<any> {
    const vidTrack = videoTrackIndex || 0;
    const audTrack = audioTrackIndex || 0;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        var clip = seq.importMGTFromLibrary(${JSON.stringify(libraryName)}, ${JSON.stringify(mogrtName)}, ticks, ${vidTrack}, ${audTrack});
        var clipId = "";
        if (clip && clip.nodeId) clipId = clip.nodeId;
        return JSON.stringify({
          success: true,
          message: "MOGRT imported from library",
          clipId: clipId
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }

  private resolvePluginRegistry(): PluginRegistry {
    const bridgeDir = resolvePluginRegistryDir(process.env, this.bridge.getBridgeDirectory());
    return new PluginRegistry(bridgeDir);
  }

  private async listPlugins(): Promise<any> {
    const plugins = await this.resolvePluginRegistry().load();
    return {
      success: true,
      plugins,
    };
  }

  private async registerPlugin(manifest: unknown): Promise<any> {
    const plugin = await this.resolvePluginRegistry().register(manifest);
    return {
      success: true,
      plugin,
    };
  }

  private async setPluginEnabled(id: string, enabled: boolean): Promise<any> {
    const registry = this.resolvePluginRegistry();
    await registry.setEnabled(id, enabled);
    const plugins = await registry.load();
    const plugin = plugins.find((entry) => entry.id === id) || null;
    return {
      success: true,
      plugin,
    };
  }

  private async callPlugin(pluginId: string, method: string, params: Record<string, unknown>): Promise<any> {
    const plugins = await this.resolvePluginRegistry().load();
    const plugin = plugins.find((entry) => entry.id === pluginId);
    if (!plugin) {
      return {
        success: false,
        error: `Plugin not found: ${pluginId}`,
      };
    }
    if (!plugin.enabled) {
      return {
        success: false,
        error: `Plugin is disabled: ${pluginId}`,
      };
    }
    if (!plugin.methods.includes(method)) {
      return {
        success: false,
        error: `Method not registered: ${method}`,
      };
    }
    const entryValidation = validatePluginEntryPath(
      plugin.entry,
      resolvePluginRegistryDir(process.env, this.bridge.getBridgeDirectory()),
    );
    if (!entryValidation.valid) {
      return {
        success: false,
        error: `Invalid plugin entry path: ${entryValidation.error}`,
      };
    }

    const script = `
      (function(){
        try{
          var __pluginFile = ${this.toExtendScriptString(entryValidation.normalized || plugin.entry)};
          var __pluginMethod = ${this.toExtendScriptString(method)};
          var __pluginParams = ${JSON.stringify(params || {})};
          $.evalFile(__pluginFile);
          if (typeof __pluginDispatch !== 'function') {
            throw new Error('plugin_dispatch_missing');
          }
          return JSON.stringify({
            success: true,
            result: __pluginDispatch(__pluginMethod, __pluginParams)
          });
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: String(error)
          });
        }
      })();
    `;

    return await this.runScript(script);
  }

  // Manage Proxies Implementation
  private async manageProxies(projectItemId: string, action: string, proxyPath?: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var actionType = ${JSON.stringify(action)};
        if (actionType === "check") {
          return JSON.stringify({
            success: true,
            projectItemId: ${JSON.stringify(projectItemId)},
            hasProxy: item.hasProxy(),
            canProxy: item.canProxy()
          });
        } else if (actionType === "attach") {
          var pPath = ${JSON.stringify(proxyPath || '')};
          if (!pPath || pPath === "") return JSON.stringify({ success: false, error: "proxyPath is required for attach action" });
          item.attachProxy(pPath, 0);
          return JSON.stringify({
            success: true,
            message: "Proxy attached",
            projectItemId: ${JSON.stringify(projectItemId)},
            proxyPath: pPath
          });
        } else if (actionType === "get_path") {
          return JSON.stringify({
            success: true,
            projectItemId: ${JSON.stringify(projectItemId)},
            proxyPath: item.getProxyPath()
          });
        } else {
          return JSON.stringify({ success: false, error: "Unknown action: " + actionType });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.runScript(script);
  }
}
