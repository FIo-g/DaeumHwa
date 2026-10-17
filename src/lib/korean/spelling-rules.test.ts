import { describe, expect, it } from 'vitest'
import { ruleBasedSpellcheck, type RuleSuggestion } from '@/lib/korean/spelling-rules'

function applySuggestions(text: string, suggestions: RuleSuggestion[]): string {
  let out = ''
  let cursor = 0
  for (const s of suggestions) {
    out += text.slice(cursor, s.start) + s.replacement
    cursor = s.end
  }
  return out + text.slice(cursor)
}

const cases: [string, string][] = [
  ['안 되요.', '안 돼요.'],
  ['잘 됬다.', '잘 됐다.'],
  ['되서 기뻤다.', '돼서 기뻤다.'],
  ['늦어도 되도 괜찮아.', '늦어도 돼도 괜찮아.'],
  ['그건 안돼.', '그건 안 돼.'],
  ['그러면 않되.', '그러면 안 돼.'],
  ['그러면 않돼.', '그러면 안 돼.'],
  ['왠만하면 와.', '웬만하면 와.'],
  ['웬지 슬펐다.', '왠지 슬펐다.'],
  ['왠 사람이야?', '웬 사람이야?'],
  ['왠일이야.', '웬일이야.'],
  ['몇일 뒤에.', '며칠 뒤에.'],
  ['몇 일 뒤에.', '며칠 뒤에.'],
  ['어떻해!', '어떡해!'],
  ['어떻하지', '어떡하지'],
  ['금새 사라졌다.', '금세 사라졌다.'],
  ['오랫만이야.', '오랜만이야.'],
  ['희안하네.', '희한하네.'],
  ['설겆이를 했다.', '설거지를 했다.'],
  ['역활을 맡았다.', '역할을 맡았다.'],
  ['내가 할께.', '내가 할게.'],
  ['말할껄.', '말할걸.'],
  ['어의없다.', '어이없다.'],
  ['구지 왜?', '굳이 왜?'],
  ['할려고 했다.', '하려고 했다.'],
  ['물을 건냈다.', '물을 건넸다.'],
  ['깨끗히 씻어.', '깨끗이 씻어.'],
  ['틈틈히 읽었다.', '틈틈이 읽었다.'],
  ['일일히 셌다.', '일일이 셌다.'],
  ['설레임이 컸다.', '설렘이 컸다.'],
  ['그건 내 거에요.', '그건 내 거예요.'],
  ['않되면 어떡해.', '안 되면 어떡해.'],
  ['그건 않되는데.', '그건 안 되는데.'],
  ['그건 않되요.', '그건 안 돼요.'],
  ['그러면 않되서 못 갔다.', '그러면 안 돼서 못 갔다.'],
  ['그러면 않되야 한다.', '그러면 안 돼야 한다.'],
]

describe('ruleBasedSpellcheck', () => {
  it.each(cases)('corrects %s', (input, expected) => {
    const suggestions = ruleBasedSpellcheck(input)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(applySuggestions(input, suggestions)).toBe(expected)
  })

  it('keeps correct spellings untouched', () => {
    expect(ruleBasedSpellcheck('되도록 빨리 왔다.')).toEqual([])
    expect(ruleBasedSpellcheck('왠지 이상했다.')).toEqual([])
  })

  it('returns suggestions sorted by start and non-overlapping', () => {
    const suggestions = ruleBasedSpellcheck('되서 잘 됬다. 역활은 구지 했다.')
    expect(suggestions.map((s) => s.start)).toEqual(
      [...suggestions.map((s) => s.start)].sort((a, b) => a - b),
    )
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].start).toBeGreaterThanOrEqual(suggestions[i - 1].end)
    }
    expect(suggestions.every((s) => s.quote.length > 0 && s.reason.length > 0)).toBe(true)
  })

  it('does not flag 껄껄 (a laugh sound) or 서울께서', () => {
    expect(ruleBasedSpellcheck('그는 껄껄 웃었다.')).toEqual([])
    expect(ruleBasedSpellcheck('서울께서 오셨다.')).toEqual([])
  })

  // 이였 is a correct spelling after many vowel- or 이-ending nouns, so no rule flags it.
  it.each(['그는 어린 아이였다.', '검은 고양이였다.', '둘은 사이였다.', '그는 멍청이였다.'])(
    'does not flag the noun copula in %s',
    (text) => {
      expect(ruleBasedSpellcheck(text)).toEqual([])
    },
  )

  // 구지 is a misspelling of 굳이 only as a standalone word, not inside a name.
  it.each(['구지현이 왔다.', '구지훈이 말했다.', '김구지가 웃었다.'])(
    'does not flag 구지 inside a name: %s',
    (text) => {
      expect(ruleBasedSpellcheck(text)).toEqual([])
    },
  )
})
