import { existsSync, rmSync } from 'fs';
import { normalize } from 'path';
import { RateLimiter, createSecureTempDir, validateFilePath } from '../../utils/security.js';

describe('validateFilePath', () => {
  it('rejects Windows system paths regardless of drive-letter casing', () => {
    const result = validateFilePath('c:\\windows\\system32\\cmd.exe');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('forbidden');
  });
});

describe('createSecureTempDir', () => {
  const originalTemp = process.env.TEMP;

  afterEach(() => {
    if (originalTemp === undefined) {
      delete process.env.TEMP;
      return;
    }

    process.env.TEMP = originalTemp;
  });

  it('returns a session-specific temp path without creating the directory', () => {
    process.env.TEMP = normalize('C:/bridge-temp-root');
    const sessionId = `jest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const dir = createSecureTempDir(sessionId);

    try {
      expect(dir).toBe(normalize(`C:/bridge-temp-root/premiere-bridge-${sessionId}`));
      expect(existsSync(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('RateLimiter', () => {
  it('cleans up expired identifiers deterministically when the rate window advances', () => {
    const limiter = new RateLimiter(5, 1000);
    const nowSpy = jest.spyOn(Date, 'now');
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    nowSpy.mockReturnValueOnce(0);
    expect(limiter.check('first')).toBe(true);

    nowSpy.mockReturnValueOnce(500);
    expect(limiter.check('second')).toBe(true);

    nowSpy.mockReturnValueOnce(1500);
    expect(limiter.check('third')).toBe(true);

    expect((limiter as any).requests.has('first')).toBe(false);

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });
});
