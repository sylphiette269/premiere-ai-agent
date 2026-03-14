import { PremiereProPrompts } from '../../prompts/index.js';

describe('operate_premiere_mcp forced rules', () => {
  it('appends forced execution rules and external research routing hints', async () => {
    const prompts = new PremiereProPrompts();
    const result = await prompts.getPrompt('operate_premiere_mcp', {
      objective: '做一个抖音风格的产品视频',
      sequence_name: 'Agent Demo',
      delivery_target: 'vertical reel',
    });

    const forcedRulesMessage = result.messages.find(
      (message) =>
        message.role === 'user' &&
        message.content.text.includes('premiere://mcp/agent-guide'),
    );
    const combinedMessages = result.messages.map((message) => message.content.text).join('\n');

    expect(forcedRulesMessage).toBeDefined();
    expect(combinedMessages).toContain('build_timeline_from_xml');
    expect(combinedMessages).toContain('critic_edit_result');
    expect(combinedMessages).toContain('successCriteria');
    expect(combinedMessages).toContain('video-research-mcp');
    expect(combinedMessages).toContain('assemble_product_spot_closed_loop');
  });
});
