import { jongseongIndex } from '@/lib/korean/josa'

export type SpellingRule = {
  id: string
  pattern: RegExp
  replace: (match: RegExpExecArray) => string
  /** Short Korean explanation shown with the suggestion. */
  reason: string
}

export type RuleSuggestion = {
  ruleId: string
  quote: string
  replacement: string
  reason: string
  start: number
  end: number
}

const RIEUL_BATCHIM = 8 // ㄹ

/**
 * Built-in spelling rules for common mistakes. A match whose replacement equals the
 * matched text is ignored, so a rule can use `replace` to decline a match.
 */
export const SPELLING_RULES: SpellingRule[] = [
  { id: 'doeyo', pattern: /되요/g, replace: () => '돼요', reason: "'되어요'의 준말은 '돼요'입니다." },
  { id: 'dwaet', pattern: /됬/g, replace: () => '됐', reason: "'되었다'의 준말은 '됐다'입니다." },
  { id: 'doeseo', pattern: /되서/g, replace: () => '돼서', reason: "'되어서'의 준말은 '돼서'입니다." },
  {
    id: 'doedo',
    pattern: /되도(?!록)/g,
    replace: () => '돼도',
    reason: "'되어도'의 준말은 '돼도'입니다. ('되도록'은 맞습니다.)",
  },
  { id: 'andwae', pattern: /안돼/g, replace: () => '안 돼', reason: "'안'은 뒤따르는 말과 띄어 씁니다." },
  { id: 'anhdoe', pattern: /않되/g, replace: () => '안 돼', reason: "'아니하다'의 줄임은 '안'이고, '되다'는 '돼'입니다." },
  { id: 'anhdwae', pattern: /않돼/g, replace: () => '안 돼', reason: "'아니하다'의 줄임은 '안'이고, '되다'는 '돼'입니다." },
  { id: 'wenman', pattern: /왠만/g, replace: () => '웬만', reason: "'웬만하다'가 맞는 표기입니다." },
  { id: 'wenji', pattern: /웬지/g, replace: () => '왠지', reason: "'왠지'가 맞는 표기입니다." },
  {
    id: 'wen',
    pattern: /왠(?=[\s.,!?…"'”’)」』]|$)/g,
    replace: () => '웬',
    reason: "'웬'은 '어떠한'의 뜻을 가진 관형사입니다.",
  },
  { id: 'wenil', pattern: /왠일/g, replace: () => '웬일', reason: "'웬일'이 맞는 표기입니다." },
  { id: 'myeochil', pattern: /몇 ?일/g, replace: () => '며칠', reason: "'며칠'이 맞는 표기입니다." },
  {
    id: 'eotteokhae',
    pattern: /어떻([해하])/g,
    replace: (m) => `어떡${m[1]}`,
    reason: "'어떡하다'가 맞는 표기입니다.",
  },
  { id: 'geumse', pattern: /금새/g, replace: () => '금세', reason: "'금세'가 맞는 표기입니다." },
  { id: 'oraenman', pattern: /오랫만/g, replace: () => '오랜만', reason: "'오랜만'이 맞는 표기입니다." },
  { id: 'heehan', pattern: /희안/g, replace: () => '희한', reason: "'희한하다'가 맞는 표기입니다." },
  { id: 'seolgeoji', pattern: /설겆이/g, replace: () => '설거지', reason: "'설거지'가 맞는 표기입니다." },
  { id: 'yeokhal', pattern: /역활/g, replace: () => '역할', reason: "'역할'이 맞는 표기입니다." },
  {
    id: 'lge',
    pattern: /([가-힣])께(?![가-힣])/g,
    replace: (m) => (jongseongIndex(m[1]) === RIEUL_BATCHIM ? `${m[1]}게` : m[0]),
    reason: "'-ㄹ게'가 맞는 어미입니다.",
  },
  {
    id: 'lgeol',
    pattern: /([가-힣])껄/g,
    // 껄 itself ends in ㄹ, so exclude it to keep the 껄껄 laugh sound.
    replace: (m) =>
      m[1] !== '껄' && jongseongIndex(m[1]) === RIEUL_BATCHIM ? `${m[1]}걸` : m[0],
    reason: "'-ㄹ걸'이 맞는 어미입니다.",
  },
  { id: 'eoi', pattern: /어의없/g, replace: () => '어이없', reason: "'어이없다'가 맞는 표기입니다." },
  { id: 'guji', pattern: /구지/g, replace: () => '굳이', reason: "'굳이'가 맞는 표기입니다." },
  { id: 'hallyeogo', pattern: /할려/g, replace: () => '하려', reason: "'하려고'가 맞는 표기입니다." },
  {
    id: 'geonne',
    pattern: /건(내|냈)/g,
    replace: (m) => (m[1] === '내' ? '건네' : '건넸'),
    reason: "'건네다'의 활용형은 '건네', '건넸'입니다.",
  },
  { id: 'kkaekkeusi', pattern: /깨끗히/g, replace: () => '깨끗이', reason: "'깨끗이'가 맞는 표기입니다." },
  { id: 'teumteumi', pattern: /틈틈히/g, replace: () => '틈틈이', reason: "'틈틈이'가 맞는 표기입니다." },
  { id: 'ilili', pattern: /일일히/g, replace: () => '일일이', reason: "'일일이'가 맞는 표기입니다." },
  { id: 'seolleom', pattern: /설레임/g, replace: () => '설렘', reason: "'설렘'이 맞는 표기입니다." },
  { id: 'geoyeyo', pattern: /거에요/g, replace: () => '거예요', reason: "'거예요'가 맞는 표기입니다." },
  { id: 'ieot', pattern: /이였/g, replace: () => '이었', reason: "'이었다'가 맞는 표기입니다." },
]

/**
 * Runs the built-in rules over text. Returns suggestions sorted by start,
 * with overlapping matches dropped (the earlier, then longer, match wins).
 */
export function ruleBasedSpellcheck(text: string): RuleSuggestion[] {
  const found: RuleSuggestion[] = []
  for (const rule of SPELLING_RULES) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`
    const re = new RegExp(rule.pattern.source, flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const quote = m[0]
      const replacement = rule.replace(m)
      if (replacement !== quote) {
        found.push({
          ruleId: rule.id,
          quote,
          replacement,
          reason: rule.reason,
          start: m.index,
          end: m.index + quote.length,
        })
      }
      if (quote === '') re.lastIndex++
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const result: RuleSuggestion[] = []
  let lastEnd = 0
  for (const s of found) {
    if (s.start < lastEnd) continue
    result.push(s)
    lastEnd = s.end
  }
  return result
}
