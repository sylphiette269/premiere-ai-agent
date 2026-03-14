import {
  buildAgentError,
  classifyError,
} from '../../utils/errors.js';

describe('error protocol helpers', () => {
  describe('buildAgentError', () => {
    it('builds BRIDGE_TIMEOUT errors', () => {
      const error = buildAgentError('BRIDGE_TIMEOUT', 'Request timed out');

      expect(error.ok).toBe(false);
      expect(error.error_code).toBe('BRIDGE_TIMEOUT');
      expect(error.retryable).toBe(true);
      expect(error.category).toBe('bridge');
    });

    it('builds VERIFICATION_FAILED errors', () => {
      const error = buildAgentError(
        'VERIFICATION_FAILED',
        'Clip not found after write',
      );

      expect(error.retryable).toBe(false);
      expect(error.category).toBe('validation');
    });

    it('builds STYLE_MISMATCH errors', () => {
      const error = buildAgentError(
        'STYLE_MISMATCH',
        'Too many cross dissolves',
      );

      expect(error.retryable).toBe(false);
      expect(error.category).toBe('style');
    });
  });

  describe('classifyError', () => {
    it('maps timeout messages to BRIDGE_TIMEOUT', () => {
      expect(classifyError('Request timed out after 30s')).toBe('BRIDGE_TIMEOUT');
    });

    it('maps script errors to PREMIERE_SCRIPT_ERR', () => {
      expect(
        classifyError('ExtendScript error: undefined is not a function'),
      ).toBe('PREMIERE_SCRIPT_ERR');
    });

    it('maps clip not found to INVALID_CLIP_ID', () => {
      expect(classifyError('clip not found: xyz')).toBe('INVALID_CLIP_ID');
    });

    it('falls back to UNKNOWN', () => {
      expect(classifyError('something weird happened')).toBe('UNKNOWN');
    });
  });
});
