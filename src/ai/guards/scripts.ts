import type { ForeignScript, ForeignSpan, Lang } from './types'

// Scripts that should not appear in the other language's text. Used by the eval (T5) and by the
// repair step in the product, so both sides flag the same runs.
const OTHER_SCRIPT_RUN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\uFFFD]+/gu
// Latin is checked only in Korean text, where a 4+ letter run is an English word.
const LATIN_RUN = /[A-Za-z]{4,}/g
// Hangul is checked only in English text.
const HANGUL_RUN = /[가-힣]+/g

/** Runs of the other language's script in `text`, with UTF-16 offsets, sorted by start. */
export function foreignScriptSpans(
  text: string,
  lang: Lang,
  opts?: { allow?: string[] },
): ForeignSpan[] {
  const allowed = new Set((opts?.allow ?? []).map((word) => word.toLowerCase()))
  const spans: ForeignSpan[] = []

  for (const match of text.matchAll(lang === 'ko' ? LATIN_RUN : HANGUL_RUN)) {
    const start = match.index ?? 0
    spans.push({
      start,
      end: start + match[0].length,
      text: match[0],
      script: lang === 'ko' ? 'latin' : 'hangul',
    })
  }
  for (const match of text.matchAll(OTHER_SCRIPT_RUN)) {
    const start = match.index ?? 0
    spans.push({
      start,
      end: start + match[0].length,
      text: match[0],
      script: scriptOfRun(match[0]),
    })
  }

  return spans
    .filter((span) => !allowed.has(span.text.toLowerCase()))
    .sort((a, b) => a.start - b.start)
}

/**
 * The same runs as `foreignScriptSpans` without offsets, in the eval's order: Latin (ko) or
 * Hangul (en) runs first, then the other-script runs, each group in text order.
 */
export function foreignScriptRuns(text: string, lang: Lang): string[] {
  const primary = text.match(lang === 'ko' ? LATIN_RUN : HANGUL_RUN) ?? []
  const other = text.match(OTHER_SCRIPT_RUN) ?? []
  return [...primary, ...other]
}

/** Decided by the first character of an other-script run. */
function scriptOfRun(run: string): ForeignScript {
  const first = run.charAt(0)
  if (/\p{Script=Han}/u.test(first)) return 'han'
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(first)) return 'kana'
  if (/\p{Script=Cyrillic}/u.test(first)) return 'cyrillic'
  return 'replacement'
}
