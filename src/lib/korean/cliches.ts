// Stock phrases the code check flags when they pile up in one scene (stage 3, task 1).
// Pure: no DB, no AI. Patterns tolerate inflection the way stage 2's matchBan does.

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A matcher for one stock phrase. A Korean phrase matches as a substring, with up to three
 * filler words between its words, so `고개를 한 번 끄덕였다` still hits `고개를 끄덕`. A Latin
 * phrase matches case-insensitively with the common inflections of its last word.
 */
function clichePattern(phrase: string): RegExp {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  if (HANGUL_RE.test(phrase)) {
    return new RegExp(words.map(escapeRegExp).join('(?:\\s+\\S+){0,3}\\s+'), 'g')
  }
  const last = words[words.length - 1]
  const doubled = /[b-df-hj-np-tv-z]$/i.test(last) ? last.slice(-1) : ''
  const suffix = `(?:s|es|d|ed|ing${doubled ? `|${doubled}ed|${doubled}ing` : ''})?`
  return new RegExp(`\\b${words.map(escapeRegExp).join('\\s+')}${suffix}\\b`, 'gi')
}

function entries(phrases: string[]): { phrase: string; pattern: RegExp }[] {
  return phrases.map((phrase) => ({ phrase, pattern: clichePattern(phrase) }))
}

/** Stock phrases by draft language. `등골이 서늘/오싹` is two variants, not one phrase. */
export const CLICHES: Record<'ko' | 'en', { phrase: string; pattern: RegExp }[]> = {
  ko: entries([
    '고개를 끄덕',
    '입꼬리가 올라',
    '심장이 쿵',
    '침을 꿀꺽',
    '등골이 서늘',
    '등골이 오싹',
    '머릿속이 하얘',
    '눈시울이 붉어',
    '입술을 깨물',
    '주먹을 꽉 쥐',
    '숨을 들이켰',
    '한숨을 내쉬',
    '시간이 멈춘 듯',
    '가슴이 먹먹',
    '눈을 질끈 감',
    '미간을 찌푸',
  ]),
  en: entries([
    'for a moment',
    'a beat',
    'nodded',
    'let out a breath',
    'heart pounded',
    'eyes widened',
    'jaw clenched',
    'a shiver ran down',
    'swallowed hard',
    'time seemed to stop',
  ]),
}

/** `ko` when Hangul is at least 30% of the letters, else `en`. Letterless text reads as `ko`. */
export function textLang(text: string): 'ko' | 'en' {
  const letters = text.match(/[A-Za-z가-힣]/g) ?? []
  if (letters.length === 0) return 'ko'
  const hangul = letters.filter((ch) => /[가-힣]/.test(ch)).length
  return hangul / letters.length >= 0.3 ? 'ko' : 'en'
}
