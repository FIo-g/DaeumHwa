import { describe, expect, it } from 'vitest'
import { acceptExpansion, expansionRejection } from '@/ai/tasks/draft-expand'

/** Sentences that differ from each other by their number, so none repeats. */
function uniqueSentences(from: number, count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `서윤은 ${from + i}번째 계단을 오르며 난간의 차가운 쇠를 손끝으로 더듬었다.`,
  ).join(' ')
}

// A note to the author that is about the expansion itself (stage 1b review F3): the echoed input
// tags, a preface that announces the text and a bare length note must not reach the stored draft.
describe('acceptExpansion notes to the author (F3)', () => {
  const scene = uniqueSentences(1, 37)
  const grown = `${scene} ${uniqueSentences(400, 19)}`

  it('accepts the plain expansion', () => {
    expect(acceptExpansion(scene, grown)).toBe(true)
  })

  it('rejects an expansion wrapped in the scene tags', () => {
    expect(acceptExpansion(scene, `<scene>\n${grown}\n</scene>`)).toBe(false)
    expect(expansionRejection(scene, `<scene>\n${grown}\n</scene>`)).toBe('note')
  })

  it.each(['scene', 'before', 'after', 'length', 'style_cards', 'instructions'])(
    'rejects an echoed <%s> tag',
    (tag) => {
      expect(acceptExpansion(scene, `${grown}\n\n<${tag}>\n${uniqueSentences(900, 2)}`)).toBe(false)
      expect(acceptExpansion(scene, `${grown}\n\n</${tag}>`)).toBe(false)
    },
  )

  it('rejects a preface that announces the text', () => {
    expect(acceptExpansion(scene, `다음은 분량을 늘린 장면입니다.\n\n${grown}`)).toBe(false)
    expect(acceptExpansion(scene, `아래는 늘려 쓴 본문이다:\n\n${grown}`)).toBe(false)
    expect(acceptExpansion(scene, `여기 늘린 장면입니다.\n\n${grown}`)).toBe(false)
  })

  it('rejects a bare length note', () => {
    expect(acceptExpansion(scene, `${grown}\n\n(공백 포함 약 2,000자)`)).toBe(false)
    expect(acceptExpansion(scene, `${grown}\n\n약 2000자`)).toBe(false)
    expect(acceptExpansion(scene, `${grown} (공백 포함 약 2,000자)`)).toBe(false)
  })

  it('rejects the English forms', () => {
    expect(acceptExpansion(scene, `Here is the expanded scene:\n\n${grown}`)).toBe(false)
    expect(acceptExpansion(scene, `Here's the rewritten scene.\n\n${grown}`)).toBe(false)
    expect(acceptExpansion(scene, `${grown}\n\n(about 2,000 characters)`)).toBe(false)
    expect(acceptExpansion(scene, `${grown}\n\n~2000 chars`)).toBe(false)
  })

  it('does not reject quoted dialogue that says the same words', () => {
    expect(acceptExpansion(scene, `${grown} "다음은 네 차례다."`)).toBe(true)
    expect(acceptExpansion(scene, `${grown} 그가 말했다. "여기 <scene> 태그가 있어."`)).toBe(true)
    expect(acceptExpansion(scene, `${grown} “다음은 분량을 늘린 장면입니다. 가자.”`)).toBe(true)
  })

  it('does not reject ordinary narration that mentions characters or numbers', () => {
    expect(acceptExpansion(scene, `${grown} 서윤은 3자 면담을 떠올렸다.`)).toBe(true)
    expect(acceptExpansion(scene, `${grown}\n\n그날 밤 종이 2,000번 울렸다.`)).toBe(true)
  })

  it('does not check a note-like sentence that the original already had', () => {
    const withNote = `${uniqueSentences(1, 20)}\n\n다음은 분량을 늘린 장면입니다.\n\n${uniqueSentences(50, 3)}`
    const expanded = `${withNote}\n\n${uniqueSentences(500, 8)}`
    expect(acceptExpansion(withNote, expanded)).toBe(true)
  })
})
