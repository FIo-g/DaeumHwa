import { describe, expect, it } from 'vitest'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import { DRAFT_EXPAND_SYSTEM } from '@/ai/tasks/draft-expand'
import { DRAFT_REPAIR_SYSTEM } from '@/ai/tasks/draft-repair'
import { SCENE_REWRITE_SYSTEM } from '@/ai/tasks/scene-rewrite'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'

// Stage 2 (review fix 4): each writing system prompt says what to do with <author_requests>,
// on a line before TAG_DATA_RULE, since TAG_DATA_RULE treats tag content as data.

const RULES: [string, string, string][] = [
  [
    'DRAFT_SYSTEM',
    DRAFT_SYSTEM,
    '- <author_requests>는 작가가 계속 지켜 달라고 한 요청이다. 모든 장면에서 지키고, 이번 화 지시(<instructions>)와 부딪치면 지시를 따른다.',
  ],
  [
    'DRAFT_EXPAND_SYSTEM',
    DRAFT_EXPAND_SYSTEM,
    '- <author_requests>가 있으면 늘려 쓰는 문장도 그 요청을 지킨다.',
  ],
  [
    'DRAFT_REPAIR_SYSTEM',
    DRAFT_REPAIR_SYSTEM,
    '- <author_requests>가 있으면 고쳐 쓰는 문장도 그 요청을 지킨다.',
  ],
  [
    'SCENE_REWRITE_SYSTEM',
    SCENE_REWRITE_SYSTEM,
    '- <author_requests>가 있으면 다시 쓰는 장면도 그 요청을 지킨다.',
  ],
]

describe('writing system prompts name the author requests rule', () => {
  for (const [name, system, line] of RULES) {
    it(`${name} has the rule line before TAG_DATA_RULE`, () => {
      const at = system.indexOf(line)
      expect(at).toBeGreaterThan(-1)
      expect(system.indexOf(TAG_DATA_RULE)).toBeGreaterThan(at)
      expect(system.split(line)).toHaveLength(2)
    })
  }
})
