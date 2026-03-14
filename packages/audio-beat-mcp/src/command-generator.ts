import type { PremiereCommandBatch, PremiereEditPlan, PremiereToolCall } from './types.js';

export interface GeneratePremiereCommandsOptions {
  sequenceId: string;
  editingPlan: PremiereEditPlan;
  clipId?: string;
  clipStartSec?: number;
  componentName?: string;
  paramName?: string;
  markerDurationSec?: number;
  separateInterpolationWrites?: boolean;
}

function roundTime(value: number): number {
  return Number(value.toFixed(6));
}

export function generatePremiereCommands(
  options: GeneratePremiereCommandsOptions,
): PremiereCommandBatch {
  const toolCalls: PremiereToolCall[] = [];
  const warnings: string[] = [];
  const componentName = options.componentName ?? 'Motion';
  const paramName = options.paramName ?? 'Scale';
  const markerDurationSec = options.markerDurationSec ?? 0;
  const separateInterpolationWrites = options.separateInterpolationWrites ?? false;

  for (const marker of options.editingPlan.markerPlan) {
    toolCalls.push({
      toolName: 'add_marker',
      arguments: {
        sequenceId: options.sequenceId,
        time: marker.timeSec,
        name: marker.name,
        comment: marker.comment,
        color: marker.color,
        duration: markerDurationSec,
      },
      reason: `${marker.source} marker at ${marker.timeSec}s`,
    });
  }

  let keyframes = 0;
  let interpolations = 0;

  if (options.editingPlan.animationPlan.length > 0) {
    if (!options.clipId || options.clipStartSec === undefined) {
      warnings.push(
        'Animation steps exist, but clipId or clipStartSec is missing. Generated marker calls only.',
      );
    } else {
      for (const animation of options.editingPlan.animationPlan) {
        const baseRelative = animation.triggerTimeSec - options.clipStartSec;
        for (const step of animation.steps) {
          const clipRelativeTime = roundTime(baseRelative + step.offsetSec);
          if (clipRelativeTime < 0) {
            warnings.push(
              `Skipped animation at ${animation.triggerTimeSec}s because clip-relative time became ${clipRelativeTime}s.`,
            );
            continue;
          }

          toolCalls.push({
            toolName: 'add_keyframe',
            arguments: {
              clipId: options.clipId,
              componentName,
              paramName,
              time: clipRelativeTime,
              value: step.value,
              interpolation: step.interpolation,
            },
            reason: `${animation.label} ${animation.intensity} at ${animation.triggerTimeSec}s`,
          });
          keyframes += 1;

          if (separateInterpolationWrites) {
            toolCalls.push({
              toolName: 'set_keyframe_interpolation',
              arguments: {
                clipId: options.clipId,
                componentName,
                paramName,
                time: clipRelativeTime,
                interpolation: step.interpolation,
              },
              reason: `Interpolation sync for ${animation.label} at ${clipRelativeTime}s`,
            });
            interpolations += 1;
          }
        }
      }
    }
  }

  return {
    sequenceId: options.sequenceId,
    clipId: options.clipId,
    toolCalls,
    counts: {
      markers: options.editingPlan.markerPlan.length,
      keyframes,
      interpolations,
    },
    warnings,
  };
}
