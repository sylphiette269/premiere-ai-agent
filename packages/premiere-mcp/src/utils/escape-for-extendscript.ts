/**
 * 把非 ASCII 字符转成 ExtendScript 可直接解析的 \uXXXX 源码片段。
 * 这里接收的是“待嵌入脚本文本”的内容，而不是最终运行时字符串值。
 */
export function escapeForExtendScript(source: string): string {
  return source.replace(/[^\x20-\x7E]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}
