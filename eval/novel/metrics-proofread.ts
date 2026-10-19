// Proofread metrics (track J). Re-exported from metrics.ts.
//
// Caller contract: `chapters/NN.proofread.json` holds the raw ProofreadSuggestion[] (quote,
// replacement, kind, reason, source, start, end) with NO `id`. Decision ids are array indexes
// (eval/novel/steps/chapter.ts maps Number(d.id) into that array). So the caller builds
// items = suggestions.map((s, i) => ({ id: String(i), quote: s.quote, replacement: s.replacement,
// kind: s.kind })) over ALL suggestions, rule items included, so ids line up with the decisions
// in author-decisions.jsonl. To measure AI quality only, keep the original index as the id and
// filter to source === 'ai'. Unknown decision ids are ignored.

export type ProofreadStats = {
  total: number // items
  accepted: number
  acceptanceRatio: number | null // accepted / total, null when total is 0
  awkward: number // items with kind 'awkward'
  // Items beyond the first for the same quote and replacement. After the per-occurrence expansion
  // one model item becomes one item per occurrence, so this counts expansion by design, not
  // model duplication.
  sameQuoteItems: number
  distinctQuotes: number // distinct `quote` values among items
  acceptedQuotes: number // distinct quotes with at least one accepted item
  quoteAcceptanceRatio: number | null // acceptedQuotes / distinctQuotes, null when distinctQuotes is 0
}

export function proofreadStats(
  items: { id: string; quote: string; replacement: string; kind: string }[],
  decisions: { id: string; accept: boolean }[],
): ProofreadStats {
  const acceptedIds = new Set(decisions.filter((d) => d.accept).map((d) => d.id))
  const accepted = items.filter((i) => acceptedIds.has(i.id))

  const seenPairs = new Set<string>()
  let sameQuoteItems = 0
  for (const i of items) {
    const key = `${i.quote}\u0000${i.replacement}`
    if (seenPairs.has(key)) sameQuoteItems++
    else seenPairs.add(key)
  }

  const distinctQuotes = new Set(items.map((i) => i.quote)).size
  const acceptedQuotes = new Set(accepted.map((i) => i.quote)).size

  return {
    total: items.length,
    accepted: accepted.length,
    acceptanceRatio: items.length === 0 ? null : accepted.length / items.length,
    awkward: items.filter((i) => i.kind === 'awkward').length,
    sameQuoteItems,
    distinctQuotes,
    acceptedQuotes,
    quoteAcceptanceRatio: distinctQuotes === 0 ? null : acceptedQuotes / distinctQuotes,
  }
}
