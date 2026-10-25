import { describe, expect, it } from 'vitest'
import { applyAuthorEdits } from './learn-edits'
import { checkDirectives } from './directives'

// Task 6 Step 1: applyAuthorEdits makes the four probe edits and is idempotent.
const KO_BEFORE = [
  '안개가 짙게 깔렸다. 세린은 고개를 끄덕였다.',
  '도윤서가 말했다. "먼저 들어가거라."',
  '입꼬리가 살짝 올라갔다.',
  '밤은 깊었고 종소리는 들리지 않았다.',
].join('\n\n')

const EN_BEFORE = [
  'The fog was thick. She nodded.',
  'Do Yunseo said. "Go inside first."',
  'She waited for a moment, listening.',
  'The night was deep and no bell rang.',
].join('\n\n')

function keptAll(text: string, lang: 'ko' | 'en'): boolean {
  return checkDirectives(text, lang).every((r) => r.status === 'kept')
}

describe('applyAuthorEdits ko', () => {
  it('makes each of the four edits', () => {
    const after = applyAuthorEdits(KO_BEFORE, 'ko')
    expect(after).not.toContain('끄덕')
    expect(after).toContain('눈짓')
    expect(after).not.toContain('입꼬리')
    expect(after).toContain('웃었다')
    expect(after).toContain('조심하십시오')
    // Ends on dialogue.
    const last =
      after
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .at(-1) ?? ''
    expect(last.startsWith('"') || last.startsWith('“')).toBe(true)
  })

  it('is idempotent', () => {
    const once = applyAuthorEdits(KO_BEFORE, 'ko')
    expect(applyAuthorEdits(once, 'ko')).toBe(once)
  })

  it('reports kept for all four probes after the edits', () => {
    expect(keptAll(applyAuthorEdits(KO_BEFORE, 'ko'), 'ko')).toBe(true)
  })
})

describe('applyAuthorEdits en', () => {
  it('makes each of the four edits', () => {
    const after = applyAuthorEdits(EN_BEFORE, 'en')
    expect(after).not.toMatch(/\bnodded\b/i)
    expect(after).toMatch(/looked up/i)
    expect(after).not.toMatch(/for a moment/i)
    expect(after).toContain('Watch your step.')
    const last =
      after
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .at(-1) ?? ''
    expect(last.startsWith('"') || last.startsWith('“')).toBe(true)
  })

  it('is idempotent', () => {
    const once = applyAuthorEdits(EN_BEFORE, 'en')
    expect(applyAuthorEdits(once, 'en')).toBe(once)
  })

  it('reports kept for all four probes after the edits', () => {
    expect(keptAll(applyAuthorEdits(EN_BEFORE, 'en'), 'en')).toBe(true)
  })
})
