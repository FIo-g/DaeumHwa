import { getChoseong } from 'es-hangul'

export type SearchItem = {
  id: string
  kind: string
  name: string
  aliases: string[]
  summary: string
}
export type SearchIndex = {
  items: SearchItem[]
  keys: { id: string; norm: string[]; choseong: string[] }[]
}

const CONSONANT_ONLY = /^[ㄱ-ㅎ]+$/

const SCORE_EXACT = 100
const SCORE_PREFIX = 80
const SCORE_SUBSTRING = 60
const SCORE_CHOSEONG = 40
const SCORE_SUMMARY = 20

function normalize(text: string): string {
  return text.normalize('NFC').trim().toLowerCase()
}

/** Builds the in-memory card search index used by the worker. */
export function buildSearchIndex(items: SearchItem[]): SearchIndex {
  return {
    items,
    keys: items.map((item) => {
      const names = [item.name, ...item.aliases].map(normalize).filter((n) => n.length > 0)
      const choseong = [item.name, ...item.aliases]
        .map((n) => getChoseong(n))
        .filter((c) => c.length > 0)
      return { id: item.id, norm: names, choseong }
    }),
  }
}

/**
 * Ranks cards by name and alias match (exact, prefix, substring), then by initial-consonant
 * match when the query is only consonants, then by summary substring. Ties sort by name.
 */
export function searchIndex(index: SearchIndex, query: string, limit = 20): SearchItem[] {
  const q = normalize(query)
  if (q.length === 0) return []
  const consonantQuery = CONSONANT_ONLY.test(q)

  const scored: { item: SearchItem; score: number }[] = []
  index.items.forEach((item, i) => {
    const key = index.keys[i]
    let score = 0
    for (const n of key.norm) {
      if (n === q) score = Math.max(score, SCORE_EXACT)
      else if (n.startsWith(q)) score = Math.max(score, SCORE_PREFIX)
      else if (n.includes(q)) score = Math.max(score, SCORE_SUBSTRING)
    }
    if (score === 0 && consonantQuery && key.choseong.some((c) => c.includes(q))) {
      score = SCORE_CHOSEONG
    }
    if (score === 0 && item.summary && normalize(item.summary).includes(q)) {
      score = SCORE_SUMMARY
    }
    if (score > 0) scored.push({ item, score })
  })

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ko') || 0)
  return scored.slice(0, limit).map((s) => s.item)
}
