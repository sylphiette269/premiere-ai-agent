import assert from 'node:assert/strict';
import test from 'node:test';

import { searchBingHtmlResults } from '../src/search/bing-html.js';

test('searchBingHtmlResults parses bilibili and douyin candidates from Bing HTML', () => {
  const html = `
    <html>
      <body>
        <li class="b_algo">
          <h2>
            <a href="https://www.bilibili.com/video/BV1xx411c7mD">高燃漫剪模板</a>
          </h2>
          <div class="b_caption"><p>10秒高能漫剪，字幕居中，快切</p></div>
        </li>
        <li class="b_algo">
          <h2>
            <a href="https://www.douyin.com/video/7469999999999999999">抖音卡点短视频</a>
          </h2>
          <div class="b_caption"><p>前3秒 hook 明显，结尾 CTA 强</p></div>
        </li>
      </body>
    </html>
  `;

  const candidates = searchBingHtmlResults({
    html,
    platform: 'bilibili',
    query: '高燃漫剪',
    limit: 5,
  });

  assert.equal(candidates[0]?.platform, 'bilibili');
  assert.equal(candidates[0]?.title, '高燃漫剪模板');
  assert.equal(candidates[0]?.snippet, '10秒高能漫剪，字幕居中，快切');

  const mixedCandidates = searchBingHtmlResults({
    html,
    platform: 'all',
    query: '高燃漫剪',
    limit: 5,
  });

  assert.equal(mixedCandidates.length, 2);
  assert.equal(mixedCandidates[1]?.platform, 'douyin');
  assert.equal(mixedCandidates[1]?.searchRank, 2);
});
