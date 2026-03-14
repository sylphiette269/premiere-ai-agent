import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_FRAME_RATE = 30;
const DEFAULT_TRANSITION_DURATION_SEC = 0.5;
const STILL_IMAGE_DURATION_FRAMES = 86400;
const STILL_IMAGE_EXTENSIONS = new Set([
  '.bmp',
  '.gif',
  '.heic',
  '.jpeg',
  '.jpg',
  '.png',
  '.psd',
  '.tif',
  '.tiff',
  '.webp',
]);

export interface FcpXmlClip {
  path: string;
  name: string;
  durationSec: number;
  sourceWidth?: number;
  sourceHeight?: number;
  scalePercent?: number;
  zoomFrom?: number;
  zoomTo?: number;
  centerFrom?: [number, number];
  centerTo?: [number, number];
  rotationFrom?: number;
  rotationTo?: number;
}

export interface FcpXmlOptions {
  sequenceName: string;
  frameRate?: number;
  frameWidth?: number;
  frameHeight?: number;
  clips: FcpXmlClip[];
  transitionDurationSec?: number;
  audioPath?: string;
  audioDurationSec?: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildRateXml(frameRate: number): string {
  return `<rate><timebase>${frameRate}</timebase><ntsc>FALSE</ntsc></rate>`;
}

function toFrameCount(seconds: number, label: string, minimum = 0): number {
  const numericValue = Number(seconds);
  if (!Number.isFinite(numericValue) || numericValue < minimum) {
    throw new Error(`Invalid ${label}: ${seconds}`);
  }
  return Math.max(0, Math.round(numericValue));
}

function secondsToFrames(seconds: number, frameRate: number, label: string, minimum = 0): number {
  return toFrameCount(seconds * frameRate, label, minimum);
}

function isStillImagePath(filePath: string): boolean {
  return STILL_IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function normalizeScaleValue(value: number, label: string): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Math.round(numericValue * 10000) / 10000;
}

function normalizeNumericValue(value: number, label: string): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Math.round(numericValue * 10000) / 10000;
}

function formatNumericValue(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)));
}

function formatPathUrl(filePath: string): string {
  const encodedUrl = pathToFileURL(filePath).href;
  const windowsDriveMatch = /^file:\/\/\/([A-Za-z]):\/(.*)$/.exec(encodedUrl);
  if (!windowsDriveMatch) {
    return encodedUrl;
  }

  const [, driveLetter, restPath] = windowsDriveMatch;
  return `file://localhost/${driveLetter}%3A/${restPath}`;
}

function renderSampleCharacteristics(
  frameRate: number,
  width: number,
  height: number,
  indent: string,
): string {
  return `${indent}<samplecharacteristics>
${indent}  ${buildRateXml(frameRate)}
${indent}  <width>${width}</width>
${indent}  <height>${height}</height>
${indent}  <anamorphic>FALSE</anamorphic>
${indent}  <pixelaspectratio>square</pixelaspectratio>
${indent}  <fielddominance>none</fielddominance>
${indent}</samplecharacteristics>`;
}

type NormalizedClip = {
  id: string;
  fileId: string;
  name: string;
  path: string;
  pathUrl: string;
  sourceWidth?: number;
  sourceHeight?: number;
  start: number;
  end: number;
  inFrame: number;
  outFrame: number;
  durationFrames: number;
  fileDurationFrames: number;
  scalePercent?: number;
  zoomFrom?: number;
  zoomTo?: number;
  centerFrom?: [number, number];
  centerTo?: [number, number];
  rotationFrom?: number;
  rotationTo?: number;
};

function normalizePointValue(
  value: [number, number],
  label: string,
): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`Invalid ${label}: expected [x, y]`);
  }

  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid ${label}: expected finite numeric coordinates`);
  }

  return [
    Math.round(x * 10000) / 10000,
    Math.round(y * 10000) / 10000,
  ];
}

function renderScalarParameterXml(options: {
  parameterId: string;
  name: string;
  value: number;
  min?: number;
  max?: number;
  startFrame?: number;
  startValue?: number;
  endFrame?: number;
  endValue?: number;
}): string {
  const keyframes =
    options.startFrame !== undefined
      && options.startValue !== undefined
      && options.endFrame !== undefined
      && options.endValue !== undefined
      ? `
                  <keyframe><when>${options.startFrame}</when><value>${formatNumericValue(options.startValue)}</value></keyframe>
                  <keyframe><when>${options.endFrame}</when><value>${formatNumericValue(options.endValue)}</value></keyframe>`
      : '';

  return `
                <parameter>
                  <parameterid>${options.parameterId}</parameterid>
                  <name>${options.name}</name>
                  <valuemin>${formatNumericValue(options.min ?? 0)}</valuemin>
                  <valuemax>${formatNumericValue(options.max ?? 1000)}</valuemax>
                  <value>${formatNumericValue(options.value)}</value>${keyframes}
                </parameter>`;
}

function renderPointValueXml(value: [number, number]): string {
  return `<value><horiz>${formatNumericValue(value[0])}</horiz><vert>${formatNumericValue(value[1])}</vert></value>`;
}

function renderPointParameterXml(options: {
  parameterId: string;
  name: string;
  value: [number, number];
  startFrame?: number;
  startValue?: [number, number];
  endFrame?: number;
  endValue?: [number, number];
}): string {
  const keyframes =
    options.startFrame !== undefined
      && options.startValue !== undefined
      && options.endFrame !== undefined
      && options.endValue !== undefined
      ? `
                  <keyframe><when>${options.startFrame}</when>${renderPointValueXml(options.startValue)}</keyframe>
                  <keyframe><when>${options.endFrame}</when>${renderPointValueXml(options.endValue)}</keyframe>`
      : '';

  return `
                <parameter>
                  <parameterid>${options.parameterId}</parameterid>
                  <name>${options.name}</name>
                  ${renderPointValueXml(options.value)}${keyframes}
                </parameter>`;
}

function renderVideoClipItem(clip: NormalizedClip, frameRate: number): string {
  const animatedScale = clip.zoomFrom !== undefined || clip.zoomTo !== undefined;
  const startScale = clip.zoomFrom ?? clip.zoomTo ?? clip.scalePercent;
  const endScale = clip.zoomTo ?? clip.zoomFrom ?? clip.scalePercent;
  const animatedCenter = clip.centerFrom !== undefined || clip.centerTo !== undefined;
  const startCenter = clip.centerFrom ?? clip.centerTo;
  const endCenter = clip.centerTo ?? clip.centerFrom;
  const animatedRotation = clip.rotationFrom !== undefined || clip.rotationTo !== undefined;
  const startRotation = clip.rotationFrom ?? clip.rotationTo;
  const endRotation = clip.rotationTo ?? clip.rotationFrom;
  const motionParameters: string[] = [];

  if (startScale !== undefined) {
    motionParameters.push(
      renderScalarParameterXml({
        parameterId: 'scale',
        name: 'Scale',
        min: 0,
        max: 1000,
        value: startScale,
        startFrame:
          animatedScale && endScale !== undefined
            ? clip.inFrame
            : undefined,
        startValue:
          animatedScale && endScale !== undefined
            ? startScale
            : undefined,
        endFrame:
          animatedScale && endScale !== undefined
            ? clip.outFrame
            : undefined,
        endValue:
          animatedScale && endScale !== undefined
            ? endScale
            : undefined,
      }),
    );
  }

  if (startCenter !== undefined) {
    motionParameters.push(
      renderPointParameterXml({
        parameterId: 'center',
        name: 'Center',
        value: startCenter,
        startFrame:
          animatedCenter && endCenter !== undefined
            ? clip.inFrame
            : undefined,
        startValue:
          animatedCenter && endCenter !== undefined
            ? startCenter
            : undefined,
        endFrame:
          animatedCenter && endCenter !== undefined
            ? clip.outFrame
            : undefined,
        endValue:
          animatedCenter && endCenter !== undefined
            ? endCenter
            : undefined,
      }),
    );
  }

  if (startRotation !== undefined) {
    motionParameters.push(
      renderScalarParameterXml({
        parameterId: 'rotation',
        name: 'Rotation',
        min: -360,
        max: 360,
        value: startRotation,
        startFrame:
          animatedRotation && endRotation !== undefined
            ? clip.inFrame
            : undefined,
        startValue:
          animatedRotation && endRotation !== undefined
            ? startRotation
            : undefined,
        endFrame:
          animatedRotation && endRotation !== undefined
            ? clip.outFrame
            : undefined,
        endValue:
          animatedRotation && endRotation !== undefined
            ? endRotation
            : undefined,
      }),
    );
  }

  const motionFilter = motionParameters.length > 0
    ? `
            <filter>
              <effect>
                <name>Basic Motion</name>
                <effectid>basic</effectid>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>${motionParameters.join('')}
              </effect>
            </filter>`
    : '';
  const sourceSampleCharacteristics = clip.sourceWidth !== undefined && clip.sourceHeight !== undefined
    ? `
                  ${renderSampleCharacteristics(frameRate, clip.sourceWidth, clip.sourceHeight, '                  ')}`
    : '';

  return `          <clipitem id="${clip.id}">
            <name>${escapeXml(clip.name)}</name>
            <duration>${clip.durationFrames}</duration>
            ${buildRateXml(frameRate)}
            <start>${clip.start}</start>
            <end>${clip.end}</end>
            <enabled>TRUE</enabled>
            <in>${clip.inFrame}</in>
            <out>${clip.outFrame}</out>
            <file id="${clip.fileId}">
              <name>${escapeXml(clip.name)}</name>
              <pathurl>${escapeXml(clip.pathUrl)}</pathurl>
              ${buildRateXml(frameRate)}
              <duration>${clip.fileDurationFrames}</duration>
              <media><video><duration>${clip.fileDurationFrames}</duration>${sourceSampleCharacteristics}
              </video></media>
            </file>${motionFilter}
          </clipitem>`;
}

function renderTransitionItem(
  frameRate: number,
  cutPoint: number,
  transitionDurationFrames: number,
): string {
  const leadingFrames = Math.floor(transitionDurationFrames / 2);
  const trailingFrames = transitionDurationFrames - leadingFrames;
  return `          <transitionitem>
            ${buildRateXml(frameRate)}
            <start>${cutPoint - leadingFrames}</start>
            <end>${cutPoint + trailingFrames}</end>
            <alignment>center</alignment>
            <cutPointTicks>0</cutPointTicks>
            <effect>
              <name>Cross Dissolve</name>
              <effectid>dissolve</effectid>
              <effecttype>transition</effecttype>
              <mediatype>video</mediatype>
            </effect>
          </transitionitem>`;
}

function renderAudioClipItem(
  audioPath: string,
  frameRate: number,
  durationFrames: number,
): string {
  const audioName = basename(audioPath);
  return `          <clipitem id="audioitem-1">
            <name>${escapeXml(audioName)}</name>
            <duration>${durationFrames}</duration>
            ${buildRateXml(frameRate)}
            <start>0</start>
            <end>${durationFrames}</end>
            <enabled>TRUE</enabled>
            <in>0</in>
            <out>${durationFrames}</out>
            <file id="audiofile-1">
              <name>${escapeXml(audioName)}</name>
              <pathurl>${escapeXml(formatPathUrl(audioPath))}</pathurl>
              ${buildRateXml(frameRate)}
              <duration>${durationFrames}</duration>
              <media><audio><duration>${durationFrames}</duration></audio></media>
            </file>
          </clipitem>`;
}

export function buildFcpXml(options: FcpXmlOptions): string {
  const frameRate = toFrameCount(
    options.frameRate ?? DEFAULT_FRAME_RATE,
    'frameRate',
    1,
  );
  const frameWidth = options.frameWidth !== undefined
    ? toFrameCount(options.frameWidth, 'frameWidth', 1)
    : undefined;
  const frameHeight = options.frameHeight !== undefined
    ? toFrameCount(options.frameHeight, 'frameHeight', 1)
    : undefined;
  const clips = options.clips ?? [];
  if (!options.sequenceName?.trim()) {
    throw new Error('sequenceName is required');
  }
  if (clips.length === 0) {
    throw new Error('At least one clip is required');
  }
  if ((frameWidth === undefined) !== (frameHeight === undefined)) {
    throw new Error('frameWidth and frameHeight must be provided together');
  }

  const transitionDurationFrames = secondsToFrames(
    options.transitionDurationSec ?? DEFAULT_TRANSITION_DURATION_SEC,
    frameRate,
    'transitionDurationSec',
    0,
  );

  let cursor = 0;
  const normalizedClips = clips.map((clip, index) => {
    if (!clip.path?.trim()) {
      throw new Error(`Clip ${index + 1} is missing a path`);
    }
    if (!clip.name?.trim()) {
      throw new Error(`Clip ${index + 1} is missing a name`);
    }

    const durationFrames = secondsToFrames(
      clip.durationSec,
      frameRate,
      `clips[${index}].durationSec`,
      Number.EPSILON,
    );
    const start = cursor;
    const end = start + durationFrames;
    cursor = end;
    const sourceWidth = clip.sourceWidth !== undefined
      ? toFrameCount(clip.sourceWidth, `clips[${index}].sourceWidth`, 1)
      : undefined;
    const sourceHeight = clip.sourceHeight !== undefined
      ? toFrameCount(clip.sourceHeight, `clips[${index}].sourceHeight`, 1)
      : undefined;
    if ((sourceWidth === undefined) !== (sourceHeight === undefined)) {
      throw new Error(`Clip ${index + 1} sourceWidth and sourceHeight must be provided together`);
    }

    return {
      id: `clipitem-${index + 1}`,
      fileId: `file-${index + 1}`,
      name: clip.name,
      path: clip.path,
      pathUrl: formatPathUrl(clip.path),
      sourceWidth,
      sourceHeight,
      start,
      end,
      inFrame: 0,
      outFrame: durationFrames,
      durationFrames,
      fileDurationFrames: isStillImagePath(clip.path)
        ? STILL_IMAGE_DURATION_FRAMES
        : durationFrames,
      scalePercent: clip.scalePercent !== undefined
        ? normalizeScaleValue(clip.scalePercent, `clips[${index}].scalePercent`)
        : undefined,
      zoomFrom: clip.zoomFrom !== undefined
        ? normalizeScaleValue(clip.zoomFrom, `clips[${index}].zoomFrom`)
        : undefined,
      zoomTo: clip.zoomTo !== undefined
        ? normalizeScaleValue(clip.zoomTo, `clips[${index}].zoomTo`)
        : undefined,
      centerFrom: clip.centerFrom !== undefined
        ? normalizePointValue(clip.centerFrom, `clips[${index}].centerFrom`)
        : undefined,
      centerTo: clip.centerTo !== undefined
        ? normalizePointValue(clip.centerTo, `clips[${index}].centerTo`)
        : undefined,
      rotationFrom: clip.rotationFrom !== undefined
        ? normalizeNumericValue(clip.rotationFrom, `clips[${index}].rotationFrom`)
        : undefined,
      rotationTo: clip.rotationTo !== undefined
        ? normalizeNumericValue(clip.rotationTo, `clips[${index}].rotationTo`)
        : undefined,
    } satisfies NormalizedClip;
  });

  const audioDurationFrames = options.audioPath
    ? secondsToFrames(
      options.audioDurationSec ?? cursor / frameRate,
      frameRate,
      'audioDurationSec',
      Number.EPSILON,
    )
    : 0;
  const videoFormatSection = frameWidth !== undefined && frameHeight !== undefined
    ? `
        <format>
${renderSampleCharacteristics(frameRate, frameWidth, frameHeight, '          ')}
        </format>`
    : '';

  const videoTrackItems: string[] = [];
  normalizedClips.forEach((clip, index) => {
    videoTrackItems.push(renderVideoClipItem(clip, frameRate));
    if (transitionDurationFrames > 0 && index < normalizedClips.length - 1) {
      videoTrackItems.push(
        renderTransitionItem(frameRate, clip.end, transitionDurationFrames),
      );
    }
  });

  const audioSection = options.audioPath
    ? `
      <audio>
        <track>
${renderAudioClipItem(options.audioPath, frameRate, audioDurationFrames)}
        </track>
      </audio>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${escapeXml(options.sequenceName)}</name>
    <duration>${cursor}</duration>
    ${buildRateXml(frameRate)}
    <media>
      <video>
${videoFormatSection}
        <track>
${videoTrackItems.join('\n')}
        </track>
      </video>${audioSection}
    </media>
  </sequence>
</xmeml>
`;
}
