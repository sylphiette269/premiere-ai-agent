import { z } from 'zod';

export const beatMethodSchema = z.enum(['default', 'onset', 'plp']);
export const analysisSensitivitySchema = z.enum(['low', 'medium', 'high']);

export const energyPeakSchema = z.object({
  time: z.number().nonnegative(),
  strength: z.number().nonnegative(),
});

export const musicBeatAnalysisSchema = z.object({
  sourceAudioPath: z.string().min(1),
  duration: z.number().nonnegative(),
  tempo: z.number().nonnegative(),
  bpm: z.number().nonnegative(),
  beatTimes: z.array(z.number().nonnegative()),
  beatCount: z.number().int().nonnegative(),
  onsetTimes: z.array(z.number().nonnegative()),
  onsetCount: z.number().int().nonnegative(),
  energyPeaks: z.array(energyPeakSchema),
  method: beatMethodSchema,
  sensitivity: analysisSensitivitySchema,
  minGapSec: z.number().nonnegative(),
});

export const editingStyleSchema = z.enum([
  'marker_only',
  'beat_markers_and_scale',
  'drum_punch',
  'cut_on_beat',
]);

export const markerPlanItemSchema = z.object({
  timeSec: z.number().nonnegative(),
  name: z.string().min(1),
  color: z.enum(['green', 'red', 'blue']),
  comment: z.string().optional(),
  source: z.enum(['beat', 'onset', 'downbeat', 'cut']),
});

export const animationKeyframeStepSchema = z.object({
  offsetSec: z.number(),
  value: z.number(),
  interpolation: z.enum(['linear', 'bezier', 'hold']),
});

export const animationPlanItemSchema = z.object({
  triggerTimeSec: z.number().nonnegative(),
  property: z.literal('Scale'),
  label: z.literal('scale_pulse'),
  intensity: z.enum(['normal', 'strong']),
  steps: z.array(animationKeyframeStepSchema).min(1),
});

export const premiereEditPlanSchema = z.object({
  style: editingStyleSchema,
  bpm: z.number().nonnegative(),
  beatCount: z.number().int().nonnegative(),
  onsetCount: z.number().int().nonnegative(),
  cutPoints: z.array(z.number().nonnegative()),
  markerPlan: z.array(markerPlanItemSchema),
  animationPlan: z.array(animationPlanItemSchema),
  notes: z.array(z.string()),
});

export const analyzeMusicBeatsInputSchema = z.object({
  audioPath: z.string().min(1).describe('Local audio or video path.'),
  method: beatMethodSchema.default('default').describe('Beat detection method.'),
  sensitivity: analysisSensitivitySchema
    .default('medium')
    .describe('Transient extraction sensitivity. Higher values keep more hits.'),
  minGapSec: z
    .number()
    .positive()
    .max(2)
    .optional()
    .describe('Minimum spacing between adjacent beat or onset timestamps.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(120000)
    .default(30000)
    .describe('Analyzer timeout in milliseconds.'),
});

export const planPremiereEditingInputSchema = z.object({
  beatData: musicBeatAnalysisSchema.describe('Structured output from analyze_music_beats.'),
  editingStyle: editingStyleSchema
    .default('beat_markers_and_scale')
    .describe('Editing style preset.'),
  beatsPerBar: z
    .number()
    .int()
    .positive()
    .max(16)
    .default(4)
    .describe('Beats per bar used to infer downbeats.'),
  pulseDurationSec: z
    .number()
    .positive()
    .max(2)
    .default(0.2)
    .describe('Total duration of one scale pulse.'),
  baseScale: z.number().positive().default(100).describe('Base Scale value.'),
  normalPulseScale: z.number().positive().default(105).describe('Peak Scale for a normal beat.'),
  strongPulseScale: z.number().positive().default(112).describe('Peak Scale for a strong beat.'),
});

export const generatePremiereCommandsInputSchema = z.object({
  sequenceId: z.string().min(1).describe('Premiere sequence id.'),
  editingPlan: premiereEditPlanSchema.describe('Structured output from plan_pr_editing.'),
  clipId: z
    .string()
    .min(1)
    .optional()
    .describe('Timeline clip id. Required only for keyframe writes.'),
  clipStartSec: z
    .number()
    .nonnegative()
    .optional()
    .describe('Sequence start time of the target clip, in seconds.'),
  componentName: z.string().default('Motion').describe('Premiere component name.'),
  paramName: z.string().default('Scale').describe('Premiere parameter name.'),
  markerDurationSec: z.number().nonnegative().default(0).describe('Marker duration in seconds.'),
  separateInterpolationWrites: z
    .boolean()
    .default(false)
    .describe('Also emit set_keyframe_interpolation calls after add_keyframe.'),
});
