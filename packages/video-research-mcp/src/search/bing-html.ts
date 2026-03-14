import crypto from 'node:crypto';

import { parse } from 'node-html-parser';

import type {
  ReferenceCandidate,
  ResearchPlatform,
  SearchBingHtmlResultsInput,
} from '../types.js';

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function platformFromUrl(url: string): ResearchPlatform | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes('bilibili.com')) {
      return 'bilibili';
    }
    if (hostname.includes('douyin.com')) {
      return 'douyin';
    }
    return null;
  } catch {
    return null;
  }
}

function buildCandidateId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
}

export function searchBingHtmlResults(input: SearchBingHtmlResultsInput): ReferenceCandidate[] {
  const root = parse(input.html);
  const items = root.querySelectorAll('li.b_algo');
  const candidates: ReferenceCandidate[] = [];

  for (const item of items) {
    const anchor = item.querySelector('h2 a');
    if (!anchor) {
      continue;
    }
    const url = anchor.getAttribute('href');
    if (!url) {
      continue;
    }

    const platform = platformFromUrl(url);
    if (!platform) {
      continue;
    }
    if (input.platform !== 'all' && platform !== input.platform) {
      continue;
    }

    const title = stripHtml(anchor.innerHTML);
    const snippetNode = item.querySelector('.b_caption p');
    const snippet = snippetNode ? stripHtml(snippetNode.innerHTML) : undefined;

    candidates.push({
      id: buildCandidateId(url),
      platform,
      title,
      url,
      snippet,
      searchQuery: input.query,
      searchRank: candidates.length + 1,
    });

    if (candidates.length >= input.limit) {
      break;
    }
  }

  return candidates;
}
