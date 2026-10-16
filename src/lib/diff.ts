import { diffArrays, diffChars, diffLines } from 'diff'

export type DiffPart = { type: 'equal' | 'insert' | 'delete'; value: string }
export type DiffMode = 'chars' | 'words' | 'lines'

/**
 * Text diff for the chapter history view. "words" means whitespace-delimited eojeol: jsdiff's
 * own word tokenizer splits Korean syllables apart, which reads badly in a history view.
 */
export function diffTexts(a: string, b: string, mode: DiffMode = 'words'): DiffPart[] {
  if (mode === 'chars') return toParts(diffChars(a, b))
  if (mode === 'lines') return toParts(diffLines(a, b))
  return toParts(diffArrays(tokenizeWords(a), tokenizeWords(b)))
}

/** Inserted and deleted size in code points (so emoji and astral characters count once). */
export function diffStats(parts: DiffPart[]): { inserted: number; deleted: number } {
  let inserted = 0
  let deleted = 0
  for (const part of parts) {
    const size = Array.from(part.value).length
    if (part.type === 'insert') inserted += size
    if (part.type === 'delete') deleted += size
  }
  return { inserted, deleted }
}

/** Splits on whitespace but keeps the whitespace runs as tokens so the join is lossless. */
function tokenizeWords(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0)
}

function toParts(
  changes: { value: string | string[]; added?: boolean; removed?: boolean }[],
): DiffPart[] {
  return changes.map((change) => ({
    type: change.added ? 'insert' : change.removed ? 'delete' : 'equal',
    value: Array.isArray(change.value) ? change.value.join('') : change.value,
  }))
}
