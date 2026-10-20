// Number readers for the numeric fact check (P13). Pure: no DB, no AI, no imports.
// Reads one kind of quantity from a text: an age ("27살", "twenty-seven years old"), an absolute
// year ("312년", "built in 1204"), a floor count ("12층 높이", "nine-story") or a headcount
// ("모두 7명", "only twelve guards"). Digits and English number words 0-99 are read; Korean number
// words (스물일곱, 열한) are not. The count and year forms are narrow on purpose: a floor in a
// sentence ("5층에서") or a part of a group ("3명을 보냈다") is not a total.

export type QuantityKind = 'age' | 'year' | 'floor' | 'person'

export const QUANTITY_KINDS: readonly QuantityKind[] = ['age', 'year', 'floor', 'person']

/** Korean label and counter used in the hit explanation ("위키의 층수(12층)와 ..."). */
export const QUANTITY_LABEL: Record<QuantityKind, { label: string; unit: string }> = {
  age: { label: '나이', unit: '살' },
  year: { label: '연도', unit: '년' },
  floor: { label: '층수', unit: '층' },
  person: { label: '인원', unit: '명' },
}

export type Quantity = {
  kind: QuantityKind
  value: number
  /** The number as written: "27", "twenty-seven". */
  token: string
  /** Offsets of the number token in the text (end exclusive). */
  tokenStart: number
  tokenEnd: number
  /** Offsets of the whole matched expression ("27살", "nine-story", "모두 7명"). */
  start: number
  end: number
  /** False only for the Korean "N살" age form, which keeps the rule it had before P13. */
  needsSubject: boolean
}

const EN_ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const EN_TENS = new Map<string, number>([
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
])

/** English number word or 1-3 digits to a number: sixteen, Twenty-seven, "twenty seven", 7. Else null. */
export function parseEnglishNumber(raw: string): number | null {
  const text = raw.trim().toLowerCase()
  if (/^\d{1,3}$/.test(text)) return Number(text)
  const parts = text.split(/[-\s]+/)
  if (parts.length === 1) {
    const ones = EN_ONES.indexOf(parts[0])
    return ones !== -1 ? ones : (EN_TENS.get(parts[0]) ?? null)
  }
  if (parts.length === 2) {
    const tens = EN_TENS.get(parts[0])
    const ones = EN_ONES.indexOf(parts[1])
    if (tens !== undefined && ones >= 1 && ones <= 9) return tens + ones
  }
  return null
}

// 1-3 digits or an English number word 0-99. Teens come before the units so "sixteen" is not "six".
const EN_NUM =
  '(?:\\d{1,3}|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?' +
  '|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one|zero)'
const en = (source: string) => new RegExp(source, 'gi')

type Pattern = { re: RegExp; needsSubject: boolean }
const subjectPattern = (re: RegExp): Pattern => ({ re, needsSubject: true })

// Every pattern has exactly two capturing groups and no others: group 1 is the text of the match
// before the number (often empty, written `()`), group 2 is the number token. Do not use the `d`
// flag or named groups (tsconfig target is ES2017). Every pattern is global (matchAll).
const PATTERNS: Record<QuantityKind, Pattern[]> = {
  age: [
    { re: /()(\d{1,3})\s*살/g, needsSubject: false },
    subjectPattern(en(`\\b()(${EN_NUM})\\s+years?\\s+old\\b`)),
    subjectPattern(en(`\\b(aged\\s+)(${EN_NUM})\\b`)),
  ],
  year: [
    // 3-4 digits only (a two-digit "12년" is a duration), not "413년 동안", "413년 만에", "1990년대".
    subjectPattern(
      /()(\d{3,4})\s*년(?!대)(?!\s*(?:전|뒤|후|간|동안|째|만에|쯤|가량|이상|이하|된|묵은|넘))/g,
    ),
    subjectPattern(
      en(
        '\\b(in\\s+(?:the\\s+year\\s+)?)(\\d{3,4})\\b(?!\\s*(?:years?|days?|months?|weeks?|miles?|paces?|steps?|men|people|soldiers|coins|times)\\b)',
      ),
    ),
    subjectPattern(en('\\b(year\\s+)(\\d{3,4})\\b')),
  ],
  floor: [
    subjectPattern(/()(\d{1,3})\s*층(?:짜리|\s*높이|\s*규모|으로\s*(?:솟|이루어|지어|되어|된))/g),
    subjectPattern(/((?:모두|전부|총|통틀어)\s*)(\d{1,3})\s*층/g),
    subjectPattern(en(`\\b()(${EN_NUM})-stor(?:y|ey)\\b`)),
    subjectPattern(en(`\\b()(${EN_NUM})\\s+(?:stories|storeys|floors|levels)\\s+(?:tall|high)\\b`)),
    subjectPattern(
      en(`\\b((?:rose|rises|towered|towers)\\s+)(${EN_NUM})\\s+(?:stories|storeys|floors)\\b`),
    ),
  ],
  person: [
    subjectPattern(/((?:모두|전부|총|통틀어)\s*)(\d{1,3})\s*명/g),
    subjectPattern(/()(\d{1,3})\s*명(?:뿐|밖에)/g),
    subjectPattern(
      en(
        `\\b((?:all|only|exactly|just|a\\s+total\\s+of|total\\s+of)\\s+)(${EN_NUM})\\s+(?:people|persons|men|women|members|soldiers|guards)\\b`,
      ),
    ),
  ],
}

/**
 * Every quantity of one kind in a text, in text order. Two patterns that read the same number
 * ("모두 12층짜리") give one quantity (the longer match). A token that is not a number is dropped.
 */
export function readQuantities(text: string, kind: QuantityKind): Quantity[] {
  const byToken = new Map<number, Quantity>()
  for (const { re, needsSubject } of PATTERNS[kind]) {
    for (const match of text.matchAll(re)) {
      const token = match[2]
      const value = /^\d+$/.test(token) ? Number(token) : parseEnglishNumber(token)
      if (value === null) continue
      const start = match.index ?? 0
      const tokenStart = start + match[1].length
      const quantity: Quantity = {
        kind,
        value,
        token,
        tokenStart,
        tokenEnd: tokenStart + token.length,
        start,
        end: start + match[0].length,
        needsSubject,
      }
      const same = byToken.get(tokenStart)
      if (!same || quantity.end > same.end) byToken.set(tokenStart, quantity)
    }
  }
  return [...byToken.values()].sort((a, b) => a.start - b.start)
}

// Words that name what happened in a year. A year is compared only when the wiki fact and the
// manuscript sentence share one of them, so "건국 412년" is never compared with "멸망 590년".
const YEAR_EVENTS_KO = [
  '태어',
  '출생',
  '죽',
  '사망',
  '건국',
  '창건',
  '세워',
  '설립',
  '멸망',
  '무너',
  '즉위',
  '완공',
  '지어',
]
const YEAR_EVENTS_EN = [
  'born',
  'died',
  'founded',
  'built',
  'fell',
  'destroyed',
  'collapsed',
  'crowned',
  'established',
]
const YEAR_EVENTS_EN_RE = YEAR_EVENTS_EN.map((word) => ({
  word,
  re: new RegExp(`\\b${word}\\b`, 'i'),
}))

/** The year-event words found in a text. */
export function eventWords(text: string): Set<string> {
  const found = new Set<string>()
  for (const word of YEAR_EVENTS_KO) if (text.includes(word)) found.add(word)
  for (const { word, re } of YEAR_EVENTS_EN_RE) if (re.test(text)) found.add(word)
  return found
}
