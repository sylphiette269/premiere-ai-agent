import {
  buildKeyframeAnimationPlan,
  parseKeyframeAnimationRequest,
} from '../../keyframe-animation-planner.js';

describe('parseKeyframeAnimationRequest', () => {
  it('parses fade, slight zoom, hold, and easing cues from a Chinese request', () => {
    const intent = parseKeyframeAnimationRequest({
      prompt:
        '\u5f00\u5934\u5148\u6de1\u5165\uff0c\u540c\u65f6\u8f7b\u5fae\u653e\u5927\uff0c3\u79d2\u540e\u505c\u4f4f\uff0c\u81ea\u7136\u505c\u4e0b',
    });

    expect(intent.fadeIn).toBe(true);
    expect(intent.zoomDirection).toBe('in');
    expect(intent.hold).toBe(true);
    expect(intent.primaryDurationSec).toBe(3);
    expect(intent.easing).toBe('ease_out');
  });

  it('parses a left slide-in request from English wording', () => {
    const intent = parseKeyframeAnimationRequest({
      prompt: 'Slide the title in from the left and let it ease out',
    });

    expect(intent.slideDirection).toBe('left');
    expect(intent.easing).toBe('ease_out');
  });
});

describe('buildKeyframeAnimationPlan', () => {
  it('builds opacity and scale keyframes with an explicit hold segment', () => {
    const intent = parseKeyframeAnimationRequest({
      prompt:
        '\u5f00\u5934\u5148\u6de1\u5165\uff0c\u540c\u65f6\u8f7b\u5fae\u653e\u5927\uff0c3\u79d2\u540e\u505c\u4f4f',
    });

    const plan = buildKeyframeAnimationPlan(intent, {
      target: 'image_clip',
      startTimeSec: 0,
    });

    const opacityPlan = plan.propertyPlans.find((entry) => entry.paramName === 'Opacity');
    const scalePlan = plan.propertyPlans.find((entry) => entry.paramName === 'Scale');

    expect(opacityPlan?.componentName).toBe('Opacity');
    expect(opacityPlan?.keyframes).toEqual([
      { time: 0, value: 0, easing: 'linear' },
      { time: 1, value: 100, easing: 'ease_out' },
    ]);
    expect(scalePlan?.componentName).toBe('Motion');
    expect(scalePlan?.keyframes).toEqual([
      { time: 0, value: 100, easing: 'linear' },
      { time: 3, value: 115, easing: 'ease_out' },
      { time: 3.5, value: 115, easing: 'linear' },
    ]);
    expect(plan.unresolved).toEqual([]);
  });

  it('builds a position plan for a slide-in request when frame size is known', () => {
    const intent = parseKeyframeAnimationRequest({
      prompt:
        '\u8ba9\u5b57\u5e55\u4ece\u5de6\u8fb9\u6ed1\u8fdb\u5230\u4e2d\u95f4',
    });

    const plan = buildKeyframeAnimationPlan(intent, {
      target: 'title_clip',
      startTimeSec: 0,
      frameWidth: 1920,
      frameHeight: 1080,
    });

    const positionPlan = plan.propertyPlans.find((entry) => entry.paramName === 'Position');

    expect(positionPlan?.componentName).toBe('Motion');
    expect(positionPlan?.keyframes).toEqual([
      { time: 0, value: [-960, 540], easing: 'ease_out' },
      { time: 1, value: [960, 540], easing: 'ease_out' },
    ]);
    expect(plan.unresolved).toEqual([]);
  });

  it('marks slide requests unresolved when frame size is unknown', () => {
    const intent = parseKeyframeAnimationRequest({
      prompt: 'Slide the title in from the left',
    });

    const plan = buildKeyframeAnimationPlan(intent, {
      target: 'title_clip',
      startTimeSec: 0,
    });

    expect(plan.propertyPlans.find((entry) => entry.paramName === 'Position')).toBeUndefined();
    expect(plan.unresolved).toContain(
      'Position animation requires frameWidth and frameHeight to resolve off-screen and center coordinates.',
    );
  });
});
