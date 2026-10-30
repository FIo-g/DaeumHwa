import { bigramDice } from '@/ai/guards/similarity'
import { findDraftFlags } from '@/lib/korean/style-copy'

// Chosen example passages for the draft prompt (stage 4). Pure: no DB, no AI.

export type ExamplePassage = { text: string; source: 'card' | 'chapter' }

/** Env switch for example selection. On for 1/true/on; default off until M4 decides. */
export const EXAMPLE_SELECTION_ENV = 'AI_EXAMPLE_SELECTION'

/** Default caps for selectExamples and for the store-size check in buildDraftContext. */
export const EXAMPLE_BUDGET = 1200
export const EXAMPLE_MAX = 3

export function isExampleSelectionEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[EXAMPLE_SELECTION_ENV]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'on'
}

const DIALOGUE_RE = /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」/

/** Paragraphs of a text: blank-line separated blocks, trimmed, without empties. */
function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

/**
 * Groups paragraphs into passages of 1-4 paragraphs. A passage ends at 600 characters:
 * a paragraph that would push the passage past 600 starts a new passage, and a single
 * paragraph longer than 600 is cut to 600.
 */
function groupParagraphs(paragraphs: string[]): string[] {
  const passages: string[] = []
  let current: string[] = []
  let length = 0
  const push = () => {
    if (current.length > 0) passages.push(current.join('\n\n'))
    current = []
    length = 0
  }
  for (const paragraph of paragraphs) {
    const text = paragraph.length > 600 ? paragraph.slice(0, 600) : paragraph
    const extra = current.length === 0 ? text.length : text.length + 2
    if (current.length >= 4 || length + extra > 600) push()
    // A paragraph cut to 600 always starts its own passage.
    if (paragraph.length > 600) {
      if (current.length > 0) push()
      passages.push(text)
      continue
    }
    current.push(text)
    length += extra
  }
  push()
  return passages
}

function cardPassages(examples: string): string[] {
  return groupParagraphs(paragraphsOf(examples))
}

function chapterPassages(body: string): string[] {
  return groupParagraphs(paragraphsOf(body)).filter((passage) => DIALOGUE_RE.test(passage))
}

/**
 * Card examples split into passages, then author chapters (kept only with a quoted line).
 * Card passages come first, in input order.
 */
export function examplePassages(
  cardExamples: string[],
  authorChapters: string[],
): ExamplePassage[] {
  const out: ExamplePassage[] = []
  for (const examples of cardExamples) {
    for (const text of cardPassages(examples)) out.push({ text, source: 'card' })
  }
  for (const body of authorChapters) {
    for (const text of chapterPassages(body)) out.push({ text, source: 'chapter' })
  }
  return out
}

export type SelectExamplesOptions = {
  /** One group per character: the canonical name first, then its aliases. */
  names: string[][]
  cue: string
  draftText?: string
  max?: number
  budget?: number
}

/**
 * Picks the passages closest to this chapter. Score is 2 per character with any name present plus
 * the character-bigram Dice with the cue; ties keep input order. A passage whose sentences already
 * appear in draftText (the findDraftFlags sample-copy check) is skipped. Stops at max or when
 * the next passage would pass the budget.
 */
export function selectExamples(
  passages: ExamplePassage[],
  o: SelectExamplesOptions,
): ExamplePassage[] {
  const max = o.max ?? EXAMPLE_MAX
  const budget = o.budget ?? EXAMPLE_BUDGET
  const scored = passages.map((passage, index) => {
    const nameCount = o.names.filter((group) =>
      group.some((name) => name !== '' && passage.text.includes(name)),
    ).length
    return { passage, index, score: 2 * nameCount + bigramDice(passage.text, o.cue) }
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  const picked: ExamplePassage[] = []
  let total = 0
  for (const { passage } of scored) {
    if (picked.length >= max) break
    if (o.draftText !== undefined) {
      const flags = findDraftFlags(o.draftText, { examples: [passage.text] })
      if (flags.some((flag) => flag.kind === 'sample-copy')) continue
    }
    if (total + passage.text.length > budget) break
    picked.push(passage)
    total += passage.text.length
  }
  return picked
}
