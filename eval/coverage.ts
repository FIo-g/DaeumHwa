import { findNamedAnywhere } from '@/lib/korean/mentions'

// Context coverage for the continuity eval (H). Pure functions, no I/O.
// A card is "named" when its name or an alias occurs in the manuscript, even inside a compound
// (no word or particle rule). It is "in the pack" only when the rendered pack has its card line.

export type CoverageCard = { name: string; aliases: string[] }

export type PackCoverage = {
  /** Card names that occur in the manuscript, in card order. */
  named: string[]
  /** Named cards that have no `[E<n>] <name> ` line in the rendered pack. */
  missing: string[]
  /** (named - missing) / named. 1 when named is empty. */
  rate: number
}

/**
 * Checks which named cards reach the rendered pack text. The line check uses the text that
 * `renderContextPack` prints (`[E1] 잿빛 종루 (장소)`), so a card mentioned only inside another
 * card's fact does not count as in the pack.
 */
export function packCoverage(
  text: string,
  cards: CoverageCard[],
  renderedPack: string,
): PackCoverage {
  const targets = cards.map((card) => ({ id: card.name, names: [card.name, ...card.aliases] }))
  const namedIds = new Set(findNamedAnywhere(text, targets).map((hit) => hit.entryId))
  const named = cards.map((card) => card.name).filter((name) => namedIds.has(name))
  const missing = named.filter((name) => !hasCardLine(renderedPack, name))
  const rate = named.length === 0 ? 1 : (named.length - missing.length) / named.length
  return { named, missing, rate }
}

function hasCardLine(renderedPack: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\[E\\d+\\] ${escaped} `, 'm').test(renderedPack)
}
