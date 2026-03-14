import { getAgentGuideContent } from '../../resources/index.js';

describe('agent guide v2 content', () => {
  const guideContent = getAgentGuideContent();

  it('includes hard stop rules', () => {
    expect(guideContent).toContain('blocked');
    expect(guideContent).toContain('verification.confirmed=false');
  });

  it('includes style safety rules', () => {
    expect(guideContent).toContain('cross dissolve');
    expect(guideContent).toContain('30%');
  });

  it('includes tool availability guidance', () => {
    expect(guideContent).toContain('build_timeline_from_xml');
    expect(guideContent).toContain('DISABLED');
  });

  it('includes scenario playbooks', () => {
    expect(guideContent).toContain('viral_style');
    expect(guideContent).toContain('Research Gate');
  });

  it('includes external research handoff guidance', () => {
    expect(guideContent).toContain('video-research-mcp');
    expect(guideContent).toContain('assemble_product_spot_closed_loop');
    expect(guideContent).toContain('EditingBlueprint generation');
  });

  it('includes idempotency rules', () => {
    expect(guideContent).toContain('build_timeline_from_xml');
  });

  it('places viral_style research steps before assembly', () => {
    expect(guideContent).toMatch(
      /collect_reference_videos[\s\S]*?extract_editing_blueprint[\s\S]*?assemble_product_spot/,
    );
  });
});
