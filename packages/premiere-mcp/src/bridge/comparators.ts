import type { VerificationResult } from './types.js';

export interface WriteVerificationSpec {
  readBackTool: string;
  extractReadBackArgs: (
    writeArgs: Record<string, unknown>,
    writeResult: Record<string, unknown>,
  ) => Record<string, unknown>;
  compare: (
    writeArgs: Record<string, unknown>,
    writeResult: Record<string, unknown>,
    readBackResult: unknown,
  ) => VerificationResult;
}

function pushMismatchField(
  fields: NonNullable<VerificationResult['mismatchFields']>,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  fields.push({ field, expected, actual });
}

function valuesRoughlyMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(actual - expected) <= 0.01;
  }

  if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length) {
    return expected.every((entry, index) => {
      const candidate = actual[index];
      if (typeof entry === 'number' && typeof candidate === 'number') {
        return Math.abs(candidate - entry) <= 0.05;
      }
      return JSON.stringify(candidate) === JSON.stringify(entry);
    });
  }

  return JSON.stringify(actual) === JSON.stringify(expected);
}

export const WRITE_VERIFICATION_MAP: Record<string, WriteVerificationSpec> = {
  add_to_timeline: {
    readBackTool: 'list_sequence_tracks',
    extractReadBackArgs: (writeArgs, writeResult) => ({
      sequenceId: writeArgs.sequenceId ?? writeResult.sequenceId,
    }),
    compare: (writeArgs, writeResult, readBackResult) => {
      const payload = readBackResult as {
        videoTracks?: Array<{ clips?: Array<Record<string, unknown>> }>;
        audioTracks?: Array<{ clips?: Array<Record<string, unknown>> }>;
      };
      const clips = [
        ...(payload.videoTracks ?? []).flatMap((track) => track.clips ?? []),
        ...(payload.audioTracks ?? []).flatMap((track) => track.clips ?? []),
      ];
      const addedClipId = String(
        (writeResult as { id?: unknown; clipId?: unknown }).id ??
          (writeResult as { clipId?: unknown }).clipId ??
          '',
      );
      const found = clips.find((clip) => String(clip.id ?? '') === addedClipId);

      if (!found) {
        return {
          confirmed: false,
          verificationLevel: 'missing',
          mismatch: `Clip ${addedClipId} not found in sequence after add_to_timeline`,
          readBackTool: 'list_sequence_tracks',
          readBackResult,
          expected: { clipId: addedClipId },
        };
      }

      const mismatchFields: NonNullable<VerificationResult['mismatchFields']> = [];
      if (
        writeArgs.trackIndex !== undefined &&
        Number(found.trackIndex) !== Number(writeArgs.trackIndex)
      ) {
        pushMismatchField(
          mismatchFields,
          'trackIndex',
          writeArgs.trackIndex,
          found.trackIndex,
        );
      }
      if (writeArgs.time !== undefined) {
        const diff = Math.abs(Number(found.startTime) - Number(writeArgs.time));
        if (diff > 0.1) {
          pushMismatchField(
            mismatchFields,
            'startTime',
            writeArgs.time,
            found.startTime,
          );
        }
      }

      if (mismatchFields.length > 0) {
        return {
          confirmed: false,
          verificationLevel: 'partial',
          mismatch: `Clip found but ${mismatchFields.length} field(s) mismatch`,
          mismatchFields,
          readBackTool: 'list_sequence_tracks',
          readBackResult,
          expected: writeArgs,
        };
      }

      return {
        confirmed: true,
        verificationLevel: 'matched',
        readBackTool: 'list_sequence_tracks',
        readBackResult,
      };
    },
  },
  apply_effect: {
    readBackTool: 'get_clip_effects',
    extractReadBackArgs: (writeArgs) => ({
      clipId: writeArgs.clipId,
      effectName: writeArgs.effectName,
    }),
    compare: (writeArgs, _writeResult, readBackResult) => {
      const effects =
        ((readBackResult as {
          effects?: Array<{ name?: string; matchName?: string }>;
        })?.effects ?? []);
      const effectName = String(writeArgs.effectName ?? '');
      const found = effects.find(
        (effect) => effect.name === effectName || effect.matchName === effectName,
      );

      if (!found) {
        return {
          confirmed: false,
          verificationLevel: 'missing',
          mismatch: `Effect "${effectName}" not found on clip after apply_effect`,
          readBackTool: 'get_clip_effects',
          readBackResult,
          expected: { effectName },
        };
      }

      return {
        confirmed: true,
        verificationLevel: 'matched',
        readBackTool: 'get_clip_effects',
        readBackResult,
      };
    },
  },
  add_keyframe: {
    readBackTool: 'get_keyframes',
    extractReadBackArgs: (writeArgs) => ({
      clipId: writeArgs.clipId,
      componentName: writeArgs.componentName,
      paramName: writeArgs.paramName,
    }),
    compare: (writeArgs, _writeResult, readBackResult) => {
      const keyframes =
        ((readBackResult as {
          keyframes?: Array<{ time?: number; value?: unknown; hostValue?: unknown }>;
        })?.keyframes ?? []);
      const targetTime = Number(writeArgs.time);
      const targetValue = writeArgs.value;
      const nearby = keyframes.find(
        (keyframe) => Math.abs(Number(keyframe.time) - targetTime) < 0.05,
      );

      if (!nearby) {
        return {
          confirmed: false,
          verificationLevel: 'missing',
          mismatch: `No keyframe found at time ${targetTime}`,
          readBackTool: 'get_keyframes',
          readBackResult,
          expected: { time: targetTime, value: targetValue },
        };
      }

      const visibleValueMatches = valuesRoughlyMatch(targetValue, nearby.value);
      const hostValueMatches = valuesRoughlyMatch(targetValue, nearby.hostValue);
      if (!visibleValueMatches && !hostValueMatches) {
        return {
          confirmed: false,
          verificationLevel: 'partial',
          mismatch: 'Keyframe value mismatch',
          mismatchFields: [
            {
              field: 'value',
              expected: targetValue,
              actual: nearby.hostValue !== undefined
                ? { value: nearby.value, hostValue: nearby.hostValue }
                : nearby.value,
            },
          ],
          readBackTool: 'get_keyframes',
          readBackResult,
        };
      }

      return {
        confirmed: true,
        verificationLevel: 'matched',
        readBackTool: 'get_keyframes',
        readBackResult,
      };
    },
  },
  set_clip_properties: {
    readBackTool: 'get_clip_properties',
    extractReadBackArgs: (writeArgs) => ({
      clipId: writeArgs.clipId,
    }),
    compare: (writeArgs, _writeResult, readBackResult) => {
      const properties = (readBackResult as { properties?: Record<string, unknown> })
        ?.properties;
      if (!properties) {
        return {
          confirmed: false,
          verificationLevel: 'missing',
          mismatch: 'Could not read clip properties after set_clip_properties',
          readBackTool: 'get_clip_properties',
          readBackResult,
        };
      }

      const expectedProperties = (writeArgs.properties ?? {}) as Record<string, unknown>;
      const mismatchFields: NonNullable<VerificationResult['mismatchFields']> = [];
      for (const [key, expectedValue] of Object.entries(expectedProperties)) {
        const actualValue = properties[key];
        if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
          pushMismatchField(mismatchFields, key, expectedValue, actualValue);
        }
      }

      if (mismatchFields.length > 0) {
        return {
          confirmed: false,
          verificationLevel: 'partial',
          mismatch: 'Clip property value mismatch',
          mismatchFields,
          readBackTool: 'get_clip_properties',
          readBackResult,
        };
      }

      return {
        confirmed: true,
        verificationLevel: 'matched',
        readBackTool: 'get_clip_properties',
        readBackResult,
      };
    },
  },
};
