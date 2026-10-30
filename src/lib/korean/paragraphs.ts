import { splitSentences } from '@/lib/korean/sentences'

// Paragraph and sentence counts for the three-sentence rule (spec 6). Pure: no AI, no GUARDS.
// A paragraph is a non-empty trimmed line; a sentence is what splitSentences returns for it.

/** A paragraph may hold at most this many sentences. A constant, not read from a style card. */
export const PARAGRAPH_MAX_SENTENCES = 3

export type Paragraph = { index: number; text: string; start: number; end: number }
export type OverlongParagraph = Paragraph & { sentences: number }

/** Stands in for a dot that does not end a sentence. Same length as the dot, never a terminator. */
const PROTECTED_DOT = ''
const DIALOGUE_SPAN_RE = /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」/g

/** Non-empty lines of the text, trimmed, with offsets into the original text. */
export function splitParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const match of text.matchAll(/[^\n]+/g)) {
    const raw = match[0]
    const trimmed = raw.trim()
    if (trimmed === '') continue
    const start = match.index + (raw.length - raw.trimStart().length)
    paragraphs.push({ index: paragraphs.length, text: trimmed, start, end: start + trimmed.length })
  }
  return paragraphs
}

/**
 * Replaces the dots that do not end a sentence (decimals, a few English abbreviations) with a
 * same-length placeholder. The output has the same length as the input.
 */
export function protectNonTerminatorDots(text: string): string {
  return text
    .replace(/(?<=\d)\.(?=\d)/g, PROTECTED_DOT)
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\./g, (_match: string, abbr: string) => {
      return `${abbr}${PROTECTED_DOT}`
    })
}

/** Number of sentences in one paragraph. */
export function countSentences(paragraph: string): number {
  return splitSentences(protectNonTerminatorDots(paragraph)).length
}

/** Paragraphs with more than `max` sentences, in text order. */
export function overlongParagraphs(
  text: string,
  max: number = PARAGRAPH_MAX_SENTENCES,
): OverlongParagraph[] {
  return splitParagraphs(text).flatMap((paragraph) => {
    const sentences = countSentences(paragraph.text)
    return sentences > max ? [{ ...paragraph, sentences }] : []
  })
}

/**
 * Replaces the paragraphs named by index with new text. The first replacement for an index wins;
 * unknown indexes are ignored. Every other byte stays as it is. The new text is inserted as given.
 */
export function replaceParagraphs(
  text: string,
  replacements: { index: number; text: string }[],
): string {
  const byIndex = new Map<number, string>()
  for (const replacement of replacements) {
    if (!byIndex.has(replacement.index)) byIndex.set(replacement.index, replacement.text)
  }
  // Last to first, so the offsets of the paragraphs still to replace stay valid.
  const targets = splitParagraphs(text)
    .filter((paragraph) => byIndex.has(paragraph.index))
    .reverse()
  let result = text
  for (const paragraph of targets) {
    const replacement = byIndex.get(paragraph.index) ?? paragraph.text
    result = result.slice(0, paragraph.start) + replacement + result.slice(paragraph.end)
  }
  return result
}

/** Quoted dialogue in a paragraph: straight double quotes, curly double quotes or corner brackets. */
export function dialogueSpans(text: string): string[] {
  return [...text.matchAll(DIALOGUE_SPAN_RE)].map((match) => match[0])
}

/** True when a quoted span in the paragraph alone has more than `max` sentences. */
export function hasOverlongSpan(paragraph: string, max: number): boolean {
  return dialogueSpans(paragraph).some((span) => countSentences(span) > max)
}
