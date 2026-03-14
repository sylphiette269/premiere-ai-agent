import { PremiereProPrompts } from '../../prompts/index.js';

describe('operate_premiere_mcp prompt rules', () => {
  it('包含强制执行规则与外部 research 路由提示', async () => {
    const prompts = new PremiereProPrompts();
    const prompt = await prompts.getPrompt('operate_premiere_mcp', {
      objective: '做一个抖音爆款视频',
      sequence_name: 'Main Sequence',
      delivery_target: 'vertical reel',
    });

    const combinedMessages = prompt.messages.map((message) => message.content.text).join('\n');

    expect(combinedMessages).toContain('premiere://mcp/agent-guide');
    expect(combinedMessages).toContain('build_timeline_from_xml');
    expect(combinedMessages).toContain('critic_edit_result');
    expect(combinedMessages).toContain('successCriteria');
    expect(combinedMessages).toContain('video-research-mcp');
    expect(combinedMessages).toContain('assemble_product_spot_closed_loop');
  });
});
