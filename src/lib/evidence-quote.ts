import { neutralizeTags } from '@/ai/prompt-utils'
import { locateQuote } from '@/lib/korean/sentences'

/**
 * The source slice an evidence quote stands for, or null when the quote is not in the source.
 * Whitespace differences are tolerated and the raw source slice is returned, so the stored
 * evidence is always an exact substring of the source. Case-sensitive, never fuzzy.
 */
export function verifyEvidenceQuote(source: string, evidence: string): string | null {
  const quote = evidence.trim()
  if (quote === '') return null
  // The model saw the neutralized text (`</x` became `＜/x`). The length is unchanged, so the
  // offsets are valid for the raw source too.
  const found = locateQuote(source, quote) ?? locateQuote(neutralizeTags(source), quote)
  if (!found) return null
  return source.slice(found.start, found.end)
}
