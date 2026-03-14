import { escapeForExtendScript } from '../../utils/escape-for-extendscript.js';

describe('escapeForExtendScript', () => {
  it('converts non-ASCII characters into ExtendScript-safe unicode escapes', () => {
    expect(escapeForExtendScript('"运动"')).toBe('"\\u8fd0\\u52a8"');
    expect(escapeForExtendScript('"缩放"')).toBe('"\\u7f29\\u653e"');
    expect(escapeForExtendScript('"不透明度"')).toBe('"\\u4e0d\\u900f\\u660e\\u5ea6"');
  });
});
