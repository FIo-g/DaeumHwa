import { describe, expect, it } from 'vitest'
import { EN_SYSTEMS } from './en-systems'

// Stage 2 (review fix 4): the English twins carry the author-requests rule lines.

const RULES: [keyof typeof EN_SYSTEMS, string][] = [
  [
    'draft-chapter',
    "- <author_requests> are requests the author asked to keep. Keep them in every scene; if one conflicts with this chapter's instructions (<instructions>), follow the instructions.",
  ],
  [
    'draft-expand',
    '- If <author_requests> is given, the sentences you add keep those requests too.',
  ],
  [
    'draft-repair',
    '- If <author_requests> is given, the sentences you rewrite keep those requests too.',
  ],
  [
    'scene-rewrite',
    '- If <author_requests> is given, the rewritten scene keeps those requests too.',
  ],
]

describe('English systems carry the author-requests rule', () => {
  for (const [task, line] of RULES) {
    it(`${task} has its rule line exactly once`, () => {
      expect(EN_SYSTEMS[task].split(line)).toHaveLength(2)
    })
  }

  it('the draft-continue and draft-scene systems share the draft-chapter rule', () => {
    expect(EN_SYSTEMS['draft-continue']).toContain(RULES[0][1])
    expect(EN_SYSTEMS['draft-scene']).toContain(RULES[0][1])
  })
})
