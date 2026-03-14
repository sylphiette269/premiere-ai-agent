import { jest } from '@jest/globals';

import { PremiereBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';
import {
  buildPresetPlan,
  buildKeyframeAnimationPlan,
  parseKeyframeAnimationRequest,
} from '../../keyframe-animation-planner.js';
import { escapeForExtendScript } from '../../utils/escape-for-extendscript.js';

jest.mock('../../bridge/index.js');
jest.mock('../../keyframe-animation-planner.js', () => {
  const actual = jest.requireActual('../../keyframe-animation-planner.js');
  return {
    ...actual,
    parseKeyframeAnimationRequest: jest.fn(),
    buildKeyframeAnimationPlan: jest.fn(),
    buildPresetPlan: jest.fn(),
  };
});

const mockParseKeyframeAnimationRequest = jest.mocked(parseKeyframeAnimationRequest);
const mockBuildKeyframeAnimationPlan = jest.mocked(buildKeyframeAnimationPlan);
const mockBuildPresetPlan = jest.mocked(buildPresetPlan);

describe('Premiere keyframe tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereBridge>;

  beforeEach(() => {
    mockBridge = new PremiereBridge() as jest.Mocked<PremiereBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('advertises the keyframe planning and execution tools', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toContain('parse_keyframe_request');
    expect(toolNames).toContain('plan_keyframe_animation');
    expect(toolNames).toContain('apply_keyframe_animation');
    expect(toolNames).toContain('set_keyframe_interpolation');
  });

  it('parses a keyframe request through the MCP tool wrapper', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'fade in and zoom in',
      fadeIn: true,
      fadeOut: false,
      zoomDirection: 'in',
      slideDirection: null,
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 3,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });

    const result = await tools.executeTool('parse_keyframe_request', {
      prompt: 'fade in and zoom in',
    });

    expect(result.success).toBe(true);
    expect(result.intent.fadeIn).toBe(true);
    expect(mockParseKeyframeAnimationRequest).toHaveBeenCalledWith({
      prompt: 'fade in and zoom in',
      durationSec: undefined,
    });
  });

  it('returns a structured keyframe plan through the MCP tool wrapper', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'fade in',
      fadeIn: true,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: null,
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 2,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'fade in',
      startTimeSec: 0,
      durationSec: 2,
      propertyPlans: [
        {
          componentName: 'Opacity',
          paramName: 'Opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 1, value: 100, easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });

    const result = await tools.executeTool('plan_keyframe_animation', {
      prompt: 'fade in',
      target: 'clip-1',
      startTimeSec: 0,
      durationSec: 2,
    });

    expect(result.success).toBe(true);
    expect(result.plan.propertyPlans).toHaveLength(1);
    expect(mockBuildKeyframeAnimationPlan).toHaveBeenCalled();
  });

  it('normalizes Motion.Position pixel inputs before writing a low-level keyframe', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('add_keyframe', {
      clipId: 'clip-1',
      componentName: 'Motion',
      paramName: 'Position',
      time: 1.25,
      value: [960, 540],
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('var requestedValue = [960,540];');
    expect(generatedScript).toContain('var hostValueInfo = __prepareKeyframeValueForHost(');
    expect(generatedScript).toContain('param.setValueAtKey(keyTimeTicks, hostValueInfo.hostValue, true);');
    expect(generatedScript).toContain('writtenValue: hostValueInfo.hostValue');
    expect(generatedScript).toContain('valueTransformWarning: hostValueInfo.warning');
  });

  it('can echo add_keyframe arguments through an env-gated debug short circuit', async () => {
    const previousDebug = process.env.PREMIERE_ADD_KEYFRAME_DEBUG;
    process.env.PREMIERE_ADD_KEYFRAME_DEBUG = '1';
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      debug: {},
    });

    try {
      const result = await tools.executeTool('add_keyframe', {
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Scale',
        time: 1.25,
        value: 110,
        interpolation: 'bezier',
      });

      expect(result.success).toBe(true);
      const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
      expect(generatedScript).toContain('if (true) {');
      expect(generatedScript).toContain('debug: {');
      expect(generatedScript).toContain('clipId: "clip-1"');
      expect(generatedScript).toContain('componentName: "Motion"');
      expect(generatedScript).toContain('paramName: "Scale"');
      expect(generatedScript).toContain('time: 1.25');
      expect(generatedScript).toContain('value: 110');
      expect(generatedScript).toContain('interpolation: "bezier"');
    } finally {
      if (previousDebug === undefined) {
        delete process.env.PREMIERE_ADD_KEYFRAME_DEBUG;
      } else {
        process.env.PREMIERE_ADD_KEYFRAME_DEBUG = previousDebug;
      }
    }
  });

  it('escapes non-ASCII keyframe component and parameter names before embedding ExtendScript', async () => {
    const componentLiteral = escapeForExtendScript(JSON.stringify('运动'));
    const paramLiteral = escapeForExtendScript(JSON.stringify('缩放'));

    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    await tools.executeTool('add_keyframe', {
      clipId: 'clip-1',
      componentName: '运动',
      paramName: '缩放',
      time: 0.5,
      value: 80,
    });

    let generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain(`__findComponentParam(clip, ${componentLiteral}, ${paramLiteral})`);
    expect(generatedScript).toContain(`componentName: ${componentLiteral}`);
    expect(generatedScript).toContain(`paramName: ${paramLiteral}`);

    mockBridge.executeScript.mockClear();
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe interpolation updated',
    });

    await tools.executeTool('set_keyframe_interpolation', {
      clipId: 'clip-1',
      componentName: '运动',
      paramName: '缩放',
      time: 0.5,
      interpolation: 'bezier',
    });

    generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain(`__findComponentParam(clip, ${componentLiteral}, ${paramLiteral})`);
    expect(generatedScript).toContain(`componentName: ${componentLiteral}`);
    expect(generatedScript).toContain(`paramName: ${paramLiteral}`);

    mockBridge.executeScript.mockClear();
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe removed',
    });

    await tools.executeTool('remove_keyframe', {
      clipId: 'clip-1',
      componentName: '运动',
      paramName: '缩放',
      time: 0.5,
    });

    generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain(`__findComponentParam(clip, ${componentLiteral}, ${paramLiteral})`);

    mockBridge.executeScript.mockClear();
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      isTimeVarying: true,
      keyframes: [],
    });

    await tools.executeTool('get_keyframes', {
      clipId: 'clip-1',
      componentName: '运动',
      paramName: '缩放',
    });

    generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain(`__findComponentParam(clip, ${componentLiteral}, ${paramLiteral})`);
    expect(generatedScript).toContain(`__convertKeyframeValueForUserOutput(\n            sequence,\n            ${componentLiteral},\n            ${paramLiteral},`);
  });

  it('guards add_keyframe against sequence-time values outside the clip duration', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('add_keyframe', {
      clipId: 'clip-1',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 18,
      value: 115,
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('var clipDurationTicks = __resolveClipDurationTicks(clip);');
    expect(generatedScript).toContain('clipDurationSeconds');
    expect(generatedScript).toContain('Use clip-relative time, not sequence time.');
    expect(generatedScript).toContain('timeReference: "clip-relative"');
  });

  it('verifies keyframe existence and read-back value after writing', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('add_keyframe', {
      clipId: 'clip-1',
      componentName: 'Motion',
      paramName: 'Position',
      time: 0,
      value: [480, 810],
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('if (!__keyExistsAtTicks(param, keyTimeTicks)) {');
    expect(generatedScript).toContain('Keyframe was not created at the requested clip-relative time.');
    expect(generatedScript).toContain('var displayValueMatches = __valuesRoughlyMatch(requestedValue, actualValueInfo.displayValue);');
    expect(generatedScript).toContain('var hostValueMatches = __valuesRoughlyMatch(hostValueInfo.hostValue, actualValueInfo.hostValue);');
    expect(generatedScript).toContain('Keyframe added but value mismatch.');
    expect(generatedScript.indexOf('param.setValueAtKey(keyTimeTicks, hostValueInfo.hostValue, true);')).toBeLessThan(
      generatedScript.indexOf('if (!__keyExistsAtTicks(param, keyTimeTicks)) {'),
    );
  });

  it('passes requested interpolation through the low-level keyframe tool', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('add_keyframe', {
      clipId: 'clip-1',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 2,
      value: 115,
      interpolation: 'bezier',
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('setInterpolationTypeAtKey');
    expect(generatedScript).toContain('bezier');
  });

  it('supports continuous_bezier requests by falling back to host bezier mode metadata', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('add_keyframe', {
      clipId: 'clip-1',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 2,
      value: 115,
      interpolation: 'continuous_bezier',
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain(`requestedInterpolation = ${JSON.stringify('continuous_bezier')}`);
    expect(generatedScript).toContain("requestedInterpolation === 'continuous_bezier'");
    expect(generatedScript).toContain("__resolveHostKeyframeInterpolationName(requestedInterpolation)");
    expect(generatedScript).toContain('__buildKeyframeInterpolationWarning(requestedInterpolation)');
  });

  it('updates interpolation for an existing keyframe without rewriting the value', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe interpolation updated',
    });

    const result = await tools.executeTool('set_keyframe_interpolation', {
      clipId: 'clip-1',
      componentName: 'Motion',
      paramName: 'Scale',
      time: 2,
      interpolation: 'time',
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('__keyExistsAtTicks(param, keyTimeTicks)');
    expect(generatedScript).toContain('var keyTicks = __readKeyTicksValue(keys[keyIndex]);');
    expect(generatedScript).toContain('var nearestKeyTicks = __readKeyTicksValue(nearestKey);');
    expect(generatedScript).toContain('param.setInterpolationTypeAtKey(keyTimeTicks, interpolationMode, true);');
    expect(generatedScript).not.toContain('param.setValueAtKey(');
  });

  it('applies a planned keyframe animation through the high-level tool', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'fade in and slide in',
      fadeIn: true,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: 'left',
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 1,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'fade in and slide in',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Opacity',
          paramName: 'Opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 1, value: 100, easing: 'ease_out' },
          ],
        },
        {
          componentName: 'Motion',
          paramName: 'Position',
          keyframes: [
            { time: 0, value: [-960, 540], easing: 'ease_out' },
            { time: 1, value: [960, 540], easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('apply_keyframe_animation', {
      clipId: 'clip-1',
      prompt: 'fade in and slide in',
      startTimeSec: 0,
      durationSec: 1,
      frameWidth: 1920,
      frameHeight: 1080,
    });

    expect(result.success).toBe(true);
    expect(result.appliedKeyframes).toHaveLength(4);
    expect(mockBridge.executeScript).toHaveBeenCalledTimes(5);
    const combinedScripts = mockBridge.executeScript.mock.calls
      .map(([script]) => script as string)
      .join('\n---\n');
    expect(combinedScripts).toContain('projectItem.getMediaPath');
  });

  it('resolves frame size from the clip sequence when applying a position animation without explicit geometry', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'slide in from the left',
      fadeIn: false,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: 'left',
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 1,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'slide in from the left',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Motion',
          paramName: 'Position',
          keyframes: [
            { time: 0, value: [-1920, 1080], easing: 'ease_out' },
            { time: 1, value: [1920, 1080], easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript
      .mockResolvedValueOnce({
        success: true,
        sequenceId: 'seq-4k',
        frameWidth: 3840,
        frameHeight: 2160,
      })
      .mockResolvedValue({
        success: true,
        message: 'Keyframe added',
      });

    const result = await tools.executeTool('apply_keyframe_animation', {
      clipId: 'clip-1',
      prompt: 'slide in from the left',
      startTimeSec: 0,
      durationSec: 1,
    });

    expect(result.success).toBe(true);
    expect(mockBuildKeyframeAnimationPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        target: 'clip-1',
        startTimeSec: 0,
        durationSec: 1,
        frameWidth: 3840,
        frameHeight: 2160,
      }),
    );
  });

  it('prefers Transform effect for still-image Motion.Position animations', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'slide in from the left',
      fadeIn: false,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: 'left',
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 1,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'slide in from the left',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Motion',
          paramName: 'Position',
          keyframes: [
            { time: 0, value: [-960, 540], easing: 'ease_out' },
            { time: 1, value: [960, 540], easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript
      .mockResolvedValueOnce({
        success: true,
        isStillImage: true,
        mediaPath: 'C:/assets/still.png',
        trackType: 'video',
      })
      .mockResolvedValueOnce({
        success: true,
        componentDisplayName: 'Transform',
        componentMatchName: 'ADBE Transform',
        alreadyPresent: false,
      })
      .mockResolvedValue({
        success: true,
        message: 'Keyframe added',
      });

    const result = await tools.executeTool('apply_keyframe_animation', {
      clipId: 'clip-1',
      prompt: 'slide in from the left',
      startTimeSec: 0,
      durationSec: 1,
      frameWidth: 1920,
      frameHeight: 1080,
    });

    expect(result.success).toBe(true);
    expect(mockBridge.executeScript).toHaveBeenCalledTimes(4);
    const ensureTransformScript = mockBridge.executeScript.mock.calls[1]?.[0] as string;
    const combinedScripts = mockBridge.executeScript.mock.calls
      .map(([script]) => script as string)
      .join('\n---\n');
    expect(combinedScripts).toContain('projectItem.getMediaPath');
    expect(ensureTransformScript).toContain('getVideoEffectByName(candidates[effectIndex])');
    expect(ensureTransformScript).toContain('qeClip.addVideoEffect(effect);');
    expect(combinedScripts).toContain('__findComponentParam(clip, "Transform", "Position")');
  });

  it('maps planned easing to host interpolation when applying a keyframe animation', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'fade in',
      fadeIn: true,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: null,
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 1,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'fade in',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Opacity',
          paramName: 'Opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 1, value: 100, easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      message: 'Keyframe added',
    });

    const result = await tools.executeTool('apply_keyframe_animation', {
      clipId: 'clip-1',
      prompt: 'fade in',
      startTimeSec: 0,
      durationSec: 1,
    });

    expect(result.success).toBe(true);
    const combinedScripts = mockBridge.executeScript.mock.calls
      .map(([script]) => script as string)
      .join('\n---\n');
    expect(combinedScripts).toContain('setInterpolationTypeAtKey');
    expect(combinedScripts).toContain('bezier');
  });

  it('surfaces per-keyframe failures instead of collapsing apply_keyframe_animation errors', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'fade in',
      fadeIn: true,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: null,
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 1,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'fade in',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Opacity',
          paramName: 'Opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 1, value: 100, easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript
      .mockResolvedValueOnce({
        success: false,
        error: 'Parameter not found',
        message: 'Parameter Opacity not found in component Opacity',
        valueTransformWarning: 'host warning',
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'Keyframe added',
      });

    const result = await tools.executeTool('apply_keyframe_animation', {
      clipId: 'clip-1',
      prompt: 'fade in',
      startTimeSec: 0,
      durationSec: 1,
    });

    expect(result.success).toBe(false);
    expect(result.appliedKeyframeCount).toBe(1);
    expect(result.expectedKeyframeCount).toBe(2);
    expect(result.appliedKeyframes).toHaveLength(1);
    expect(result.failedKeyframes).toHaveLength(1);
    expect(result.failedKeyframes[0]).toMatchObject({
      componentName: 'Opacity',
      paramName: 'Opacity',
      time: 0,
      value: 0,
      interpolation: 'linear',
      error: 'Parameter not found',
      message: 'Parameter Opacity not found in component Opacity',
      valueTransformWarning: 'host warning',
      toolResult: {
        success: false,
        error: 'Parameter not found',
      },
    });
    expect(result.missingKeyframes).toEqual([
      expect.objectContaining({
        componentName: 'Opacity',
        paramName: 'Opacity',
        time: 0,
        value: 0,
      }),
    ]);
    expect(mockBridge.executeScript).toHaveBeenCalledTimes(2);
  });

  it('marks apply_animation_preset as failed when fewer keyframes are written than planned', async () => {
    mockBuildPresetPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'fade_in',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Opacity',
          paramName: 'Opacity',
          keyframes: [
            { time: 0, value: 0, easing: 'linear' },
            { time: 1, value: 100, easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript
      .mockResolvedValueOnce({
        success: true,
        message: 'Keyframe added',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'time outside clip duration',
        message: 'Rejected keyframe',
      });

    const result = await tools.executeTool('apply_animation_preset', {
      clipId: 'clip-1',
      preset: 'fade_in',
      startTimeSec: 0,
      durationSec: 1,
    });

    expect(result.success).toBe(false);
    expect(result.expectedKeyframeCount).toBe(2);
    expect(result.appliedKeyframeCount).toBe(1);
    expect(result.appliedKeyframes).toHaveLength(1);
    expect(result.failedKeyframes).toHaveLength(1);
    expect(result.failedKeyframes[0]).toMatchObject({
      componentName: 'Opacity',
      paramName: 'Opacity',
      time: 1,
      value: 100,
      interpolation: 'bezier',
      error: 'time outside clip duration',
      message: 'Rejected keyframe',
      toolResult: {
        success: false,
        error: 'time outside clip duration',
      },
    });
    expect(result.missingKeyframes).toEqual([
      expect.objectContaining({
        componentName: 'Opacity',
        paramName: 'Opacity',
        time: 1,
        value: 100,
      }),
    ]);
  });

  it('resolves frame size from the clip sequence before building slide presets', async () => {
    mockBuildPresetPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'slide_left',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Motion',
          paramName: 'Position',
          keyframes: [
            { time: 0, value: [-1920, 1080], easing: 'ease_out' },
            { time: 1, value: [1920, 1080], easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript
      .mockResolvedValueOnce({
        success: true,
        sequenceId: 'seq-4k',
        frameWidth: 3840,
        frameHeight: 2160,
      })
      .mockResolvedValue({
        success: true,
        message: 'Keyframe added',
      });

    const result = await tools.executeTool('apply_animation_preset', {
      clipId: 'clip-1',
      preset: 'slide_left',
      startTimeSec: 0,
      durationSec: 1,
    });

    expect(result.success).toBe(true);
    expect(mockBuildPresetPlan).toHaveBeenCalledWith(
      'slide_left',
      expect.objectContaining({
        target: 'clip-1',
        startTimeSec: 0,
        durationSec: 1,
        frameWidth: 3840,
        frameHeight: 2160,
      }),
    );
  });

  it('prefers Transform effect for still-image slide presets', async () => {
    mockBuildPresetPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'slide_left',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [
        {
          componentName: 'Motion',
          paramName: 'Position',
          keyframes: [
            { time: 0, value: [-960, 540], easing: 'ease_out' },
            { time: 1, value: [960, 540], easing: 'ease_out' },
          ],
        },
      ],
      assumptions: [],
      unresolved: [],
    });
    mockBridge.executeScript
      .mockResolvedValueOnce({
        success: true,
        isStillImage: true,
        mediaPath: 'C:/assets/still.jpg',
        trackType: 'video',
      })
      .mockResolvedValueOnce({
        success: true,
        componentDisplayName: 'Transform',
        componentMatchName: 'ADBE Transform',
        alreadyPresent: true,
      })
      .mockResolvedValue({
        success: true,
        message: 'Keyframe added',
      });

    const result = await tools.executeTool('apply_animation_preset', {
      clipId: 'clip-1',
      preset: 'slide_left',
      startTimeSec: 0,
      durationSec: 1,
      frameWidth: 1920,
      frameHeight: 1080,
    });

    expect(result.success).toBe(true);
    expect(mockBridge.executeScript).toHaveBeenCalledTimes(4);
    const combinedScripts = mockBridge.executeScript.mock.calls
      .map(([script]) => script as string)
      .join('\n---\n');
    expect(combinedScripts).toContain('projectItem.getMediaPath');
    expect(combinedScripts).toContain('__findComponentParam(clip, "Transform", "Position")');
  });

  it('reads host interpolation metadata when listing keyframes', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      isTimeVarying: true,
      keyframes: [],
      count: 0,
    });

    const result = await tools.executeTool('get_keyframes', {
      clipId: 'clip-1',
      componentName: 'Opacity',
      paramName: 'Opacity',
    });

    expect(result.success).toBe(true);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('getInterpolationTypeAtKey');
  });

  it('blocks high-level keyframe application when the plan is unresolved', async () => {
    mockParseKeyframeAnimationRequest.mockReturnValue({
      rawPrompt: 'slide in from the left',
      fadeIn: false,
      fadeOut: false,
      zoomDirection: null,
      slideDirection: 'left',
      rotationTurns: 0,
      hold: false,
      primaryDurationSec: 1,
      holdDurationSec: 0.5,
      easing: 'ease_out',
    });
    mockBuildKeyframeAnimationPlan.mockReturnValue({
      target: 'clip-1',
      sourcePrompt: 'slide in from the left',
      startTimeSec: 0,
      durationSec: 1,
      propertyPlans: [],
      assumptions: [],
      unresolved: ['Need frame size'],
    });

    const result = await tools.executeTool('apply_keyframe_animation', {
      clipId: 'clip-1',
      prompt: 'slide in from the left',
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
    const generatedScript = mockBridge.executeScript.mock.calls[0]?.[0] as string;
    expect(generatedScript).toContain('var info = __findClip("clip-1");');
    expect(generatedScript).not.toContain('param.setValueAtKey(');
  });
});
