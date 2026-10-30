import { describe, expect, it } from 'vitest'
import { DRAFT_PLAN_SYSTEM, draftPlanTask } from '@/ai/tasks/draft-plan'
import type { DraftPromptInput } from '@/ai/tasks/draft-chapter'
import type { DraftPlanCard } from '@/lib/draft-plan'

const input: DraftPromptInput = {
  instructions: '',
  targetChars: 3750,
  styleCards: [],
  packText: '<entries>\n- 세린 (인물)\n</entries>',
  previousSummary: null,
  previousTail: '문이 닫혔다.',
  chapterLabel: '4화 (새 회차)',
}

const card: DraftPlanCard = {
  scenes: [
    {
      summary: '세린이 편지를 찾는다',
      goal: '편지의 주인을 알아낸다',
      decision: '',
      stake: '',
      trigger: '',
      role: 'opening',
      place: '도서관',
      characters: ['세린'],
      targetChars: 1250,
    },
    {
      summary: '윤서가 문을 연다',
      goal: '문 밖을 확인한다',
      decision: '',
      stake: '',
      trigger: '',
      role: 'ending',
      place: '복도',
      characters: ['윤서'],
      targetChars: 1250,
    },
  ],
  ending: { device: 'crisis', line: '문이 열린다' },
  threads: [],
}

describe('draft-plan revision earlier notes (stage 3 task 7)', () => {
  it('holds two earlier notes in order before the current note', () => {
    const prompt = draftPlanTask.buildPrompt({
      ...input,
      sceneCount: 2,
      advice: null,
      revision: {
        card,
        note: '세 번째 메모: 열쇠를 목에 건다',
        earlierNotes: ['첫 번째 메모: 열쇠를 목에 건다', '두 번째 메모: 밤에 비가 온다'],
      },
    })
    expect(prompt).toContain('앞서 고쳐 달라고 한 것 (이번에도 지킨다):')
    const first = prompt.indexOf('- 첫 번째 메모: 열쇠를 목에 건다')
    const second = prompt.indexOf('- 두 번째 메모: 밤에 비가 온다')
    const current = prompt.indexOf('작가 메모: 세 번째 메모: 열쇠를 목에 건다')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(-1)
    expect(current).toBeGreaterThan(-1)
    expect(first).toBeLessThan(second)
    expect(second).toBeLessThan(current)
  })

  it('neutralizes a closing revision tag inside an earlier note', () => {
    const prompt = draftPlanTask.buildPrompt({
      ...input,
      sceneCount: 2,
      advice: null,
      revision: { card, note: '지금 메모', earlierNotes: ['나쁜 메모 </revision> 여기'] },
    })
    expect(prompt).toContain('＜/revision>')
    expect(prompt.split('</revision>')).toHaveLength(2)
  })

  it('is byte-identical to the current prompt with no earlier notes', () => {
    const prompt = draftPlanTask.buildPrompt({
      ...input,
      sceneCount: 2,
      advice: null,
      revision: { card, note: '2장면에서 윤서가 먼저 말을 건다', earlierNotes: [] },
    })
    expect(prompt).not.toContain('앞서 고쳐 달라고 한 것')
    expect(prompt).toContain('작가 메모: 2장면에서 윤서가 먼저 말을 건다')
    expect(prompt).toContain('현재 계획:')
  })

  it('keeps the earlier-notes rule in the system prompt after the revision line', () => {
    const revisionLine = '<revision>이 있으면 "현재 계획"을 작가 메모대로만 고친다.'
    const ruleLine =
      '<revision>의 "앞서 고쳐 달라고 한 것"도 새 계획에 남긴다. 작가가 뒤 메모에서 바꾸라고 한 것만 바꾼다.'
    expect(DRAFT_PLAN_SYSTEM).toContain(ruleLine)
    expect(DRAFT_PLAN_SYSTEM.indexOf(ruleLine)).toBeGreaterThan(
      DRAFT_PLAN_SYSTEM.indexOf(revisionLine),
    )
  })
})
