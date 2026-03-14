export type KeyframeEasing = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
export type KeyframeValue = number | [number, number] | [number, number, number, number];
export type KeyframeSlideDirection = 'left' | 'right' | 'top' | 'bottom' | null;
export type KeyframeZoomDirection = 'in' | 'out' | null;

export interface ParseKeyframeAnimationRequestOptions {
  prompt: string;
  durationSec?: number;
}

export interface ParsedKeyframeAnimationIntent {
  rawPrompt: string;
  fadeIn: boolean;
  fadeOut: boolean;
  zoomDirection: KeyframeZoomDirection;
  slideDirection: KeyframeSlideDirection;
  rotationTurns: number;
  hold: boolean;
  primaryDurationSec: number;
  holdDurationSec: number;
  easing: KeyframeEasing;
}

export interface KeyframePoint {
  time: number;
  value: KeyframeValue;
  easing: KeyframeEasing;
}

export interface KeyframePropertyPlan {
  componentName: 'Motion' | 'Opacity';
  paramName: 'Position' | 'Scale' | 'Rotation' | 'Opacity' | 'Anchor Point';
  keyframes: KeyframePoint[];
}

export interface BuildKeyframeAnimationPlanOptions {
  target: string;
  startTimeSec?: number;
  durationSec?: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface KeyframeAnimationPlan {
  target: string;
  sourcePrompt: string;
  startTimeSec: number;
  durationSec: number;
  propertyPlans: KeyframePropertyPlan[];
  assumptions: string[];
  unresolved: string[];
}

const DEFAULT_ANIMATION_DURATION_SEC = 3;
const DEFAULT_FADE_DURATION_SEC = 1;
const DEFAULT_HOLD_DURATION_SEC = 0.5;
const SECOND_PATTERN = /(\d+(?:\.\d+)?)\s*(?:\u79d2|s|sec|secs|second|seconds)/i;
const MINUTE_PATTERN = /(\d+(?:\.\d+)?)\s*(?:\u5206(?:\u949f)?|min|mins|minute|minutes)/i;
const DEGREE_PATTERN = /(-?\d+(?:\.\d+)?)\s*(?:\u00b0|deg|degree|degrees)/i;

function containsKeyword(source: string, keywords: string[]): boolean {
  return keywords.some((keyword) => source.includes(keyword));
}

function roundTime(value: number): number {
  return Number(value.toFixed(3));
}

function extractDurationSec(prompt: string): number | undefined {
  const minuteMatch = prompt.match(MINUTE_PATTERN);
  if (minuteMatch) {
    return roundTime(Number.parseFloat(minuteMatch[1] ?? '0') * 60);
  }

  const secondMatch = prompt.match(SECOND_PATTERN);
  if (secondMatch) {
    return roundTime(Number.parseFloat(secondMatch[1] ?? '0'));
  }

  return undefined;
}

function detectRotationTurns(prompt: string, normalizedPrompt: string): number {
  const degreeMatch = prompt.match(DEGREE_PATTERN);
  if (degreeMatch) {
    return roundTime(Number.parseFloat(degreeMatch[1] ?? '0') / 360);
  }

  if (
    containsKeyword(normalizedPrompt, [
      'rotate',
      'spin',
      '\u65cb\u8f6c',
      '\u8f6c\u52a8',
      '\u8f6c\u4e00\u5708',
    ])
  ) {
    return 1;
  }

  return 0;
}

function detectSlideDirection(normalizedPrompt: string): KeyframeSlideDirection {
  const hasSlide = containsKeyword(normalizedPrompt, [
    'slide',
    'move in',
    'move out',
    '\u6ed1\u5165',
    '\u6ed1\u8fdb',
    '\u6ed1\u51fa',
    '\u79fb\u52a8',
  ]);

  if (!hasSlide) {
    return null;
  }

  if (containsKeyword(normalizedPrompt, ['left', '\u5de6'])) {
    return 'left';
  }
  if (containsKeyword(normalizedPrompt, ['right', '\u53f3'])) {
    return 'right';
  }
  if (containsKeyword(normalizedPrompt, ['top', 'up', '\u4e0a'])) {
    return 'top';
  }
  if (containsKeyword(normalizedPrompt, ['bottom', 'down', '\u4e0b'])) {
    return 'bottom';
  }

  return null;
}

function detectEasing(normalizedPrompt: string): KeyframeEasing {
  if (
    containsKeyword(normalizedPrompt, [
      'ease in out',
      'ease-in-out',
      'smooth',
      '\u7f13\u5165\u7f13\u51fa',
      '\u66f4\u81ea\u7136',
    ])
  ) {
    return 'ease_in_out';
  }

  if (
    containsKeyword(normalizedPrompt, [
      'ease out',
      'ease-out',
      'natural stop',
      'soft landing',
      '\u5148\u5feb\u540e\u6162',
      '\u81ea\u7136\u505c\u4e0b',
      '\u81ea\u7136\u505c\u4f4f',
    ])
  ) {
    return 'ease_out';
  }

  if (
    containsKeyword(normalizedPrompt, [
      'ease in',
      'ease-in',
      '\u6162\u6162\u5f00\u59cb',
      '\u9010\u6e10\u52a0\u901f',
    ])
  ) {
    return 'ease_in';
  }

  if (
    containsKeyword(normalizedPrompt, [
      'linear',
      'steady',
      '\u5300\u901f',
      '\u673a\u68b0\u611f',
    ])
  ) {
    return 'linear';
  }

  return 'linear';
}

export function parseKeyframeAnimationRequest(
  options: ParseKeyframeAnimationRequestOptions,
): ParsedKeyframeAnimationIntent {
  const prompt = options.prompt ?? '';
  const normalizedPrompt = prompt.trim().toLowerCase();
  const explicitDurationSec = extractDurationSec(prompt);

  return {
    rawPrompt: prompt,
    fadeIn: containsKeyword(normalizedPrompt, ['fade in', 'fade-in', '\u6de1\u5165']),
    fadeOut: containsKeyword(normalizedPrompt, ['fade out', 'fade-out', '\u6de1\u51fa']),
    zoomDirection: containsKeyword(normalizedPrompt, [
      'zoom in',
      'push in',
      'ken burns',
      '\u653e\u5927',
      '\u63a8\u8fdb',
    ])
      ? 'in'
      : containsKeyword(normalizedPrompt, [
            'zoom out',
            'pull out',
            'pull back',
            '\u7f29\u5c0f',
            '\u62c9\u8fdc',
          ])
        ? 'out'
        : null,
    slideDirection: detectSlideDirection(normalizedPrompt),
    rotationTurns: detectRotationTurns(prompt, normalizedPrompt),
    hold: containsKeyword(normalizedPrompt, [
      'hold',
      'pause',
      'stay',
      '\u505c\u4f4f',
      '\u505c\u4e00\u4e0b',
    ]),
    primaryDurationSec:
      options.durationSec ?? explicitDurationSec ?? DEFAULT_ANIMATION_DURATION_SEC,
    holdDurationSec: DEFAULT_HOLD_DURATION_SEC,
    easing: detectEasing(normalizedPrompt),
  };
}

function buildPositionEndpoints(
  direction: Exclude<KeyframeSlideDirection, null>,
  frameWidth: number,
  frameHeight: number,
): {
  start: [number, number];
  end: [number, number];
} {
  const center: [number, number] = [roundTime(frameWidth / 2), roundTime(frameHeight / 2)];

  if (direction === 'left') {
    return {
      start: [-roundTime(frameWidth / 2), center[1]],
      end: center,
    };
  }

  if (direction === 'right') {
    return {
      start: [roundTime(frameWidth * 1.5), center[1]],
      end: center,
    };
  }

  if (direction === 'top') {
    return {
      start: [center[0], -roundTime(frameHeight / 2)],
      end: center,
    };
  }

  return {
    start: [center[0], roundTime(frameHeight * 1.5)],
    end: center,
  };
}

export function buildKeyframeAnimationPlan(
  intent: ParsedKeyframeAnimationIntent,
  options: BuildKeyframeAnimationPlanOptions,
): KeyframeAnimationPlan {
  const startTimeSec = options.startTimeSec ?? 0;
  const durationSec = options.durationSec ?? intent.primaryDurationSec;
  const endTimeSec = roundTime(startTimeSec + durationSec);
  const assumptions: string[] = [];
  const unresolved: string[] = [];
  const propertyPlans: KeyframePropertyPlan[] = [];

  if (intent.primaryDurationSec === DEFAULT_ANIMATION_DURATION_SEC && options.durationSec === undefined) {
    assumptions.push('Using the default animation duration of 3 seconds.');
  }

  if (intent.fadeIn) {
    propertyPlans.push({
      componentName: 'Opacity',
      paramName: 'Opacity',
      keyframes: [
        { time: roundTime(startTimeSec), value: 0, easing: 'linear' },
        {
          time: roundTime(startTimeSec + Math.min(DEFAULT_FADE_DURATION_SEC, durationSec)),
          value: 100,
          easing: intent.easing === 'ease_in' ? 'ease_in' : 'ease_out',
        },
      ],
    });
  }

  if (intent.fadeOut) {
    propertyPlans.push({
      componentName: 'Opacity',
      paramName: 'Opacity',
      keyframes: [
        {
          time: roundTime(endTimeSec - Math.min(DEFAULT_FADE_DURATION_SEC, durationSec)),
          value: 100,
          easing: 'linear',
        },
        { time: endTimeSec, value: 0, easing: intent.easing },
      ],
    });
  }

  if (intent.zoomDirection === 'in') {
    assumptions.push('Using a slight zoom-in scale target of 115.');
    propertyPlans.push({
      componentName: 'Motion',
      paramName: 'Scale',
      keyframes: [
        { time: roundTime(startTimeSec), value: 100, easing: 'linear' },
        { time: endTimeSec, value: 115, easing: intent.easing === 'linear' ? 'ease_out' : intent.easing },
      ],
    });
  } else if (intent.zoomDirection === 'out') {
    assumptions.push('Using a slight zoom-out starting scale of 108.');
    propertyPlans.push({
      componentName: 'Motion',
      paramName: 'Scale',
      keyframes: [
        { time: roundTime(startTimeSec), value: 108, easing: 'linear' },
        { time: endTimeSec, value: 100, easing: intent.easing === 'linear' ? 'ease_out' : intent.easing },
      ],
    });
  }

  if (intent.slideDirection !== null) {
    if (
      typeof options.frameWidth === 'number' &&
      Number.isFinite(options.frameWidth) &&
      typeof options.frameHeight === 'number' &&
      Number.isFinite(options.frameHeight)
    ) {
      const endpoints = buildPositionEndpoints(
        intent.slideDirection,
        options.frameWidth,
        options.frameHeight,
      );
      propertyPlans.push({
        componentName: 'Motion',
        paramName: 'Position',
        keyframes: [
          { time: roundTime(startTimeSec), value: endpoints.start, easing: intent.easing === 'linear' ? 'ease_out' : intent.easing },
          {
            time: roundTime(startTimeSec + Math.min(1, durationSec)),
            value: endpoints.end,
            easing: intent.easing === 'linear' ? 'ease_out' : intent.easing,
          },
        ],
      });
    } else {
      unresolved.push(
        'Position animation requires frameWidth and frameHeight to resolve off-screen and center coordinates.',
      );
    }
  }

  if (intent.rotationTurns !== 0) {
    propertyPlans.push({
      componentName: 'Motion',
      paramName: 'Rotation',
      keyframes: [
        { time: roundTime(startTimeSec), value: 0, easing: 'linear' },
        {
          time: endTimeSec,
          value: roundTime(intent.rotationTurns * 360),
          easing: intent.easing === 'linear' ? 'ease_out' : intent.easing,
        },
      ],
    });
  }

  if (intent.hold) {
    const holdEndTime = roundTime(endTimeSec + intent.holdDurationSec);
    for (const propertyPlan of propertyPlans) {
      const lastKeyframe = propertyPlan.keyframes[propertyPlan.keyframes.length - 1];
      if (lastKeyframe && lastKeyframe.time === endTimeSec) {
        propertyPlan.keyframes.push({
          time: holdEndTime,
          value: lastKeyframe.value,
          easing: 'linear',
        });
      }
    }
  }

  if (propertyPlans.length === 0 && unresolved.length === 0) {
    unresolved.push(
      'The prompt did not map to a supported keyframe animation pattern.',
    );
  }

  return {
    target: options.target,
    sourcePrompt: intent.rawPrompt,
    startTimeSec: roundTime(startTimeSec),
    durationSec: roundTime(durationSec),
    propertyPlans,
    assumptions,
    unresolved,
  };
}

// Premiere Pro component/param name aliases (EN -> ZH for Chinese locale)
const COMPONENT_ALIASES: Record<string, string[]> = {
  'Opacity':   ['不透明度', 'Opacity'],
  'Motion':    ['运动', 'Motion'],
};
const PARAM_ALIASES: Record<string, string[]> = {
  'Opacity':   ['不透明度', 'Opacity'],
  'Scale':     ['缩放', 'Scale'],
  'Position':  ['位置', 'Position'],
  'Rotation':  ['旋转', 'Rotation'],
  'Anchor Point': ['锚点', 'Anchor Point'],
};

export function resolveComponentName(name: string): string { return name; }
export function resolveParamName(name: string): string { return name; }
export { COMPONENT_ALIASES, PARAM_ALIASES };

export type AnimationPresetName =
  | 'fade_in' | 'fade_out' | 'fade_in_out'
  | 'zoom_in' | 'zoom_out'
  | 'slide_left' | 'slide_right' | 'slide_top' | 'slide_bottom'
  | 'bounce_in' | 'shake' | 'spin_in';

export const ANIMATION_PRESET_NAMES: AnimationPresetName[] = [
  'fade_in', 'fade_out', 'fade_in_out',
  'zoom_in', 'zoom_out',
  'slide_left', 'slide_right', 'slide_top', 'slide_bottom',
  'bounce_in', 'shake', 'spin_in',
];

export function buildPresetPlan(
  preset: AnimationPresetName,
  options: BuildKeyframeAnimationPlanOptions,
): KeyframeAnimationPlan {
  const s = options.startTimeSec ?? 0;
  const d = options.durationSec ?? DEFAULT_ANIMATION_DURATION_SEC;
  const e = roundTime(s + d);
  const t = options.target;
  const props: KeyframePropertyPlan[] = [];

  if (preset === 'fade_in' || preset === 'fade_in_out') {
    props.push({ componentName: 'Opacity', paramName: 'Opacity', keyframes: [
      { time: roundTime(s), value: 0, easing: 'linear' },
      { time: roundTime(s + Math.min(DEFAULT_FADE_DURATION_SEC, d)), value: 100, easing: 'ease_out' },
    ]});
  }
  if (preset === 'fade_out' || preset === 'fade_in_out') {
    props.push({ componentName: 'Opacity', paramName: 'Opacity', keyframes: [
      { time: roundTime(e - Math.min(DEFAULT_FADE_DURATION_SEC, d)), value: 100, easing: 'linear' },
      { time: roundTime(e), value: 0, easing: 'ease_in' },
    ]});
  }
  if (preset === 'zoom_in') {
    props.push({ componentName: 'Motion', paramName: 'Scale', keyframes: [
      { time: roundTime(s), value: 100, easing: 'linear' },
      { time: roundTime(e), value: 115, easing: 'ease_out' },
    ]});
  }
  if (preset === 'zoom_out') {
    props.push({ componentName: 'Motion', paramName: 'Scale', keyframes: [
      { time: roundTime(s), value: 108, easing: 'linear' },
      { time: roundTime(e), value: 100, easing: 'ease_out' },
    ]});
  }
  const fw = options.frameWidth ?? 1920;
  const fh = options.frameHeight ?? 1080;
  const cx = roundTime(fw / 2);
  const cy = roundTime(fh / 2);
  const slideMap: Partial<Record<AnimationPresetName, [number,number]>> = {
    slide_left:   [-roundTime(fw / 2), cy],
    slide_right:  [roundTime(fw * 1.5), cy],
    slide_top:    [cx, -roundTime(fh / 2)],
    slide_bottom: [cx, roundTime(fh * 1.5)],
  };
  const slideStart = slideMap[preset];
  if (slideStart) {
    props.push({ componentName: 'Motion', paramName: 'Position', keyframes: [
      { time: roundTime(s), value: slideStart, easing: 'ease_out' },
      { time: roundTime(s + Math.min(1, d)), value: [cx, cy], easing: 'ease_out' },
    ]});
  }
  if (preset === 'bounce_in') {
    props.push({ componentName: 'Motion', paramName: 'Scale', keyframes: [
      { time: roundTime(s), value: 0, easing: 'ease_out' },
      { time: roundTime(s + d * 0.6), value: 110, easing: 'ease_in_out' },
      { time: roundTime(s + d * 0.8), value: 95, easing: 'ease_in_out' },
      { time: roundTime(e), value: 100, easing: 'ease_out' },
    ]});
  }
  if (preset === 'shake') {
    props.push({ componentName: 'Motion', paramName: 'Position', keyframes: [
      { time: roundTime(s), value: [cx, cy], easing: 'linear' },
      { time: roundTime(s + d * 0.2), value: [cx + 20, cy], easing: 'linear' },
      { time: roundTime(s + d * 0.4), value: [cx - 20, cy], easing: 'linear' },
      { time: roundTime(s + d * 0.6), value: [cx + 10, cy], easing: 'linear' },
      { time: roundTime(s + d * 0.8), value: [cx - 10, cy], easing: 'linear' },
      { time: roundTime(e), value: [cx, cy], easing: 'linear' },
    ]});
  }
  if (preset === 'spin_in') {
    props.push({ componentName: 'Motion', paramName: 'Rotation', keyframes: [
      { time: roundTime(s), value: -360, easing: 'ease_out' },
      { time: roundTime(e), value: 0, easing: 'ease_out' },
    ]});
    props.push({ componentName: 'Opacity', paramName: 'Opacity', keyframes: [
      { time: roundTime(s), value: 0, easing: 'linear' },
      { time: roundTime(s + Math.min(DEFAULT_FADE_DURATION_SEC, d)), value: 100, easing: 'ease_out' },
    ]});
  }
  return { target: t ?? preset, sourcePrompt: preset, startTimeSec: roundTime(s), durationSec: roundTime(d), propertyPlans: props, assumptions: [], unresolved: props.length === 0 ? ['Unknown preset: ' + preset] : [] };
}
