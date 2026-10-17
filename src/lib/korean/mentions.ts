import { canDecomposeJosa, hasJongseong, MENTION_TOKENS } from '@/lib/korean/josa'

export type MentionTarget = { id: string; names: string[] }
export type Mention = { entryId: string; count: number; firstIndex: number; positions: number[] }

const WORD_CHAR = /[가-힣A-Za-z0-9]/
const HANGUL_RUN = /^[가-힣]*/

/**
 * Finds where wiki entries are named in a manuscript.
 * A mention must start a word (no Hangul, Latin or digit right before it) and be followed by
 * a particle run, a vocative 아/야, or nothing. Longer names claim their characters first,
 * so "이서윤" does not also count "서윤" inside it.
 */
export function findMentions(text: string, targets: MentionTarget[]): Mention[] {
  const idsByName = new Map<string, Set<string>>()
  for (const target of targets) {
    for (const raw of target.names) {
      const name = raw.trim()
      if (Array.from(name).length < 2) continue
      const ids = idsByName.get(name) ?? new Set<string>()
      ids.add(target.id)
      idsByName.set(name, ids)
    }
  }

  const names = [...idsByName.keys()].sort((a, b) => b.length - a.length || compare(a, b))
  const claimed = new Uint8Array(text.length)
  const positionsByEntry = new Map<string, number[]>()

  for (const name of names) {
    const found: number[] = []
    let from = 0
    for (;;) {
      const idx = text.indexOf(name, from)
      if (idx === -1) break
      from = idx + 1
      const end = idx + name.length
      if (claimed.subarray(idx, end).some((c) => c === 1)) continue
      if (idx > 0 && WORD_CHAR.test(text.charAt(idx - 1))) continue
      const run = HANGUL_RUN.exec(text.slice(end))?.[0] ?? ''
      if (!isParticleRun(run, name)) continue
      found.push(idx)
      claimed.fill(1, idx, end)
    }
    if (found.length === 0) continue
    for (const id of idsByName.get(name) ?? []) {
      positionsByEntry.set(id, [...(positionsByEntry.get(id) ?? []), ...found])
    }
  }

  const mentions: Mention[] = []
  for (const [entryId, positions] of positionsByEntry) {
    positions.sort((a, b) => a - b)
    mentions.push({ entryId, count: positions.length, firstIndex: positions[0], positions })
  }
  return mentions.sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
}

function isParticleRun(run: string, name: string): boolean {
  if (run === '') return true
  return canDecomposeJosa(run, 3, hasJongseong(name.charAt(name.length - 1)), MENTION_TOKENS)
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
