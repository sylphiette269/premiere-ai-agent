import {
  buildDisabledToolPayload,
  DISABLED_TOOLS,
  normalizeToolFailure,
} from '../../mcp-runtime.js';

describe('disabled tool interception', () => {
  it('marks build_timeline_from_xml as disabled', () => {
    expect(DISABLED_TOOLS.build_timeline_from_xml).toBeDefined();
  });

  it('returns TOOL_DISABLED payload for build_timeline_from_xml', () => {
    const payload = buildDisabledToolPayload('build_timeline_from_xml');

    expect(payload).not.toBeNull();
    expect(payload?.ok).toBe(false);
    expect(payload?.error_code).toBe('TOOL_DISABLED');
    expect(payload?.retryable).toBe(false);
    expect(payload?.fallback).toContain('plan_edit_from_request');
  });

  it('does not mark other tools as disabled', () => {
    expect(buildDisabledToolPayload('list_project_items')).toBeNull();
  });

  it('normalizes generic tool failures without forcing TOOL_DISABLED', () => {
    const error = normalizeToolFailure('list_project_items', {
      success: false,
      error: 'Request timed out after 30s',
    });

    expect(error.error_code).toBe('BRIDGE_TIMEOUT');
    expect(error.retryable).toBe(true);
  });
});
