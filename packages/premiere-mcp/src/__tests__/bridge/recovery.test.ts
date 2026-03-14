import { parseSessionContext } from '../../bridge/recovery.js';

describe('parseSessionContext', () => {
  it('returns null when the persisted session context is malformed JSON', () => {
    expect(parseSessionContext('{"projectPath":')).toBeNull();
  });
});
