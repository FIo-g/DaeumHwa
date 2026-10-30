// Korean number words (수사) to Arabic digits, only where a counter follows. Pure; used by the
// fact near-duplicate check. Narrow on purpose: a name or an ordinary word must not become a number
// (한세린, 열쇠, 이번, 천장, 일개 stay as written). See numbers.r2.test.ts for the pinned cases.

export type NumberKind = 'native' | 'native-short' | 'sino' | 'sino-bare' | 'sino-one'
export type ParsedNumber = { value: number; kind: NumberKind }

const NATIVE_TENS = new Map<string, number>([
  ['열', 10],
  ['스물', 20],
  ['스무', 20],
  ['서른', 30],
  ['마흔', 40],
  ['쉰', 50],
  ['예순', 60],
  ['일흔', 70],
  ['여든', 80],
  ['아흔', 90],
])
const NATIVE_UNITS = new Map<string, number>([
  ['하나', 1],
  ['한', 1],
  ['둘', 2],
  ['두', 2],
  ['셋', 3],
  ['세', 3],
  ['넷', 4],
  ['네', 4],
  ['다섯', 5],
  ['여섯', 6],
  ['일곱', 7],
  ['여덟', 8],
  ['아홉', 9],
])
/** Bare forms that are never used before a counter (they only follow a tens word: 스물하나). */
const BARE_UNIT_WITHOUT_COUNTER = new Set(['하나', '둘', '셋', '넷'])
/** One-syllable native numbers: converted only with a space before the counter. */
const NATIVE_SHORT = new Set(['열', '쉰', '한', '두', '세', '네'])
const SINO_DIGITS = new Map<string, number>([
  ['일', 1],
  ['이', 2],
  ['삼', 3],
  ['사', 4],
  ['오', 5],
  ['육', 6],
  ['칠', 7],
  ['팔', 8],
  ['구', 9],
])
const SINO_UNITS = new Map<string, number>([
  ['십', 10],
  ['백', 100],
  ['천', 1000],
])
const COUNTERS = ['살', '층', '명', '개월', '개', '번', '년', '닢', '마리', '권', '시간']
/** The only counters a lone Sino digit (구층, 삼년, 오개월) may take. */
const SINO_ONE_COUNTERS = new Set(['층', '년', '개월'])

const alternation = (words: Iterable<string>) =>
  [...words].sort((a, b) => b.length - a.length).join('|')
const NATIVE_PATTERN =
  `(?:${alternation(NATIVE_TENS.keys())})(?:${alternation(NATIVE_UNITS.keys())})?` +
  `|(?:${alternation(NATIVE_UNITS.keys())})`
const SINO_PATTERN = `[${[...SINO_DIGITS.keys(), ...SINO_UNITS.keys()].join('')}]+`
// Native first: 일곱 and 일흔 must not be read as the Sino digit 일.
// The second lookbehind leaves a misspaced compound ("서른 두 명", "삼천 오백 명") as written: a
// number word followed by a space right before the match is a half-converted compound, not a number.
const NUMBER_BEFORE_COUNTER = new RegExp(
  `(?<![가-힣\\d])(?<!(?:^|[^가-힣])(?:${alternation(NATIVE_TENS.keys())}|${SINO_PATTERN})\\s+)` +
    `(${NATIVE_PATTERN}|${SINO_PATTERN}|\\d+)(\\s*)(${alternation(COUNTERS)})`,
  'gu',
)

function parseNative(word: string): ParsedNumber | null {
  const tens = [...NATIVE_TENS.keys()].find((t) => word.startsWith(t))
  if (tens !== undefined) {
    const base = NATIVE_TENS.get(tens) ?? 0
    const rest = word.slice(tens.length)
    if (rest === '')
      return { value: base, kind: NATIVE_SHORT.has(tens) ? 'native-short' : 'native' }
    const unit = NATIVE_UNITS.get(rest)
    if (unit === undefined || tens === '스무') return null
    return { value: base + unit, kind: 'native' }
  }
  const unit = NATIVE_UNITS.get(word)
  if (unit === undefined || BARE_UNIT_WITHOUT_COUNTER.has(word)) return null
  return { value: unit, kind: NATIVE_SHORT.has(word) ? 'native-short' : 'native' }
}

function parseSino(word: string): ParsedNumber | null {
  let total = 0
  let digit = 0
  let lastUnit = Infinity
  let afterDigit = false
  for (const ch of word) {
    const d = SINO_DIGITS.get(ch)
    const u = SINO_UNITS.get(ch)
    if (d !== undefined) {
      if (afterDigit) return null // 일이, 삼사: two digits in a row is not one number
      digit = d
      afterDigit = true
    } else if (u !== undefined) {
      if (u >= lastUnit) return null // units must descend: 천 백 십
      total += (digit || 1) * u
      digit = 0
      afterDigit = false
      lastUnit = u
    } else {
      return null
    }
  }
  total += digit
  const kind: NumberKind =
    [...word].length >= 2 ? 'sino' : SINO_UNITS.has(word) ? 'sino-bare' : 'sino-one'
  return { value: total, kind }
}

/** Value and kind of one number word on its own ("열일곱" is 17), or null when it is not one. */
export function parseNumberWord(word: string): ParsedNumber | null {
  if (word === '') return null
  return parseNative(word) ?? parseSino(word)
}

/**
 * Rewrites each Korean number word that stands directly before a counter as digits glued to the
 * counter ("열일곱 살" -> "17살", "구층" -> "9층"). Digits followed by spaces and a counter are glued
 * too ("19 살" -> "19살"). Everything else is returned as written.
 */
export function koreanNumbersToDigits(text: string): string {
  return text.replace(
    NUMBER_BEFORE_COUNTER,
    (match, numeral: string, space: string, counter: string) => {
      if (/^\d+$/.test(numeral)) return space === '' ? match : `${numeral}${counter}`
      const parsed = parseNumberWord(numeral)
      if (parsed === null) return match
      const { kind } = parsed
      if ((kind === 'native-short' || kind === 'sino-bare') && space === '') return match
      if (kind === 'sino-one' && (space !== '' || !SINO_ONE_COUNTERS.has(counter))) return match
      return `${parsed.value}${counter}`
    },
  )
}
