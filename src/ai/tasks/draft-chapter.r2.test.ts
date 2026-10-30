import { describe, expect, it } from 'vitest'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import {
  buildContinuationPrompt,
  buildDraftPrompt,
  DRAFT_SYSTEM,
  type DraftPromptInput,
} from '@/ai/tasks/draft-chapter'
import { DRAFT_BEATS_SYSTEM } from '@/ai/tasks/draft-beats'
import { SCENE_REWRITE_SYSTEM } from '@/ai/tasks/scene-rewrite'
import { DRAFT_REPAIR_SYSTEM } from '@/ai/tasks/draft-repair'

const RHYTHM = '- 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.'
const lines = DRAFT_SYSTEM.split('\n')
const at = lines.indexOf(RHYTHM)

const OPENING_PREFIX = '- <draft_so_far>가 없으면 첫 장면의 앞부분에서 인물의 목표나 갈등을 보인다.'
const INTRO_PREFIX = '- 이 작품에서 처음 나오는 인물과 고유 용어'

const PRE_P4_LINES = [
  '당신은 웹소설 작가의 초안 작성을 돕는 보조 작가다. 작가의 지시와 설정 위키, 문체 카드를 따라 회차 초안을 쓴다.',
  '규칙:',
  '- 작가의 지시(<instructions>)에 있는 사건만 쓴다. 위키에 없는 중요한 설정(새 능력, 새 관계, 죽음 등)을 지어내지 않는다.',
  '- 위키의 사실과 어긋나지 않게 쓰고, 표기 규칙을 지킨다.',
  '- 인물 대사는 그 인물의 문체 카드(말투, 규칙, 예시)를 따른다. 인물마다 목소리가 구분되게 한다.',
  '- 서술은 작품 문체 카드를 따른다.',
  '- 견본은 어조만 참고하고, 문장과 이미지를 베껴 쓰지 않는다.',
  '- 웹소설 문단 호흡(짧은 문단, 대사 중심)으로 쓴다.',
  '- <target_length>의 최소 분량 이상 쓰고 최대 분량은 넘기지 않는다. 분량이 모자라면 사건을 늘리지 말고 장면 묘사와 대사를 더 쓴다. <scene_budget>이 있으면 장면마다 그 분량을 채운다.',
  '- <draft_so_far>가 있으면 그 글 바로 뒤에서 이어 쓴다. 앞부분을 다시 쓰거나 요약하지 않고 이어 쓸 부분만 출력한다. <continue_length>의 분량을 지킨다.',
  TAG_DATA_RULE,
  '- 제목이나 설명 없이 본문만 출력한다.',
]

function isSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0
  for (const line of haystack) {
    if (i < needle.length && line === needle[i]) i++
  }
  return i === needle.length
}

const promptInput: DraftPromptInput = {
  instructions: '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.',
  targetChars: 5500,
  styleCards: [
    { name: '작품 문체', entryName: null, tone: '담백하다.', rules: '짧은 문단.', examples: '' },
  ],
  packText: '현재 회차: 4화\n\n<entries>\n(없음)\n</entries>',
  previousSummary: '3화: 서윤이 도시를 떠난다.',
  previousTail: '마지막 문장표식 문이 닫혔다.',
  chapterLabel: '4화 (새 회차)',
}

describe('P4 draft rules (Korean system prompt)', () => {
  it('puts the opening rule and the introduction rule right after the paragraph-rhythm rule', () => {
    expect(at).toBeGreaterThanOrEqual(0)
    expect(lines[at + 1].startsWith(OPENING_PREFIX)).toBe(true)
    expect(lines[at + 2].startsWith(INTRO_PREFIX)).toBe(true)
  })

  it('states the opening rule only for a first call', () => {
    const opening = lines[at + 1]
    expect(opening).toContain('<draft_so_far>가 없으면')
    expect(opening).toContain('이동이나 날씨 묘사만으로 회차를 열지 않는다')
    expect(opening).toContain('목표와 갈등은 작가의 지시와 위키에 있는 것만 쓴다')
    expect(lines.filter((l) => l.includes('목표나 갈등'))).toHaveLength(1)
  })

  it('limits the introduction rule to what the wiki and the instructions say, once, shown not told', () => {
    const intro = lines[at + 2]
    expect(intro).toContain('작가의 지시와 위키에 있는 내용만')
    expect(intro).toContain('한 번')
    expect(intro).toContain('행동이나 대사로')
    expect(intro).toContain('설명문으로 늘어놓지 않는다')
  })

  it('does not re-introduce what the chapter context or the draft so far already showed', () => {
    const intro = lines[at + 2]
    expect(intro).toContain('<previous_summary>')
    expect(intro).toContain('<previous_tail>')
    expect(intro).toContain('<draft_so_far>')
    expect(intro).toContain('다시 소개하지 않는다')
  })

  it('keeps every earlier rule line, in order', () => {
    expect(isSubsequence(PRE_P4_LINES, lines)).toBe(true)
  })

  it('adds exactly two new rule lines', () => {
    const added = lines.filter(
      (l) => l.includes('목표나 갈등') || l.includes('처음 나오는 인물과 고유 용어'),
    )
    expect(added).toHaveLength(2)
  })

  it('leaves the user prompts unchanged', () => {
    const draft = buildDraftPrompt(promptInput)
    const cont = buildContinuationPrompt(promptInput, '가'.repeat(3000))
    for (const prompt of [draft, cont]) {
      expect(prompt).not.toContain('목표나 갈등')
      expect(prompt).not.toContain('처음 나오는 인물')
    }
  })

  it('does not put the rules in the other draft-side prompts', () => {
    for (const system of [DRAFT_BEATS_SYSTEM, SCENE_REWRITE_SYSTEM, DRAFT_REPAIR_SYSTEM]) {
      expect(system).not.toContain('목표나 갈등')
      expect(system).not.toContain('처음 나오는 인물')
    }
  })
})
