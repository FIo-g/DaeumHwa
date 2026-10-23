import type { DirectiveKind, DirectiveScope, SpeechLevel } from '@/db/types'
import { neutralizeTags } from '@/ai/prompt-utils'

// Pure helpers for the author request ledger: the prompt block, the ban matcher and the
// dictionary-form rule for ban patterns. No database access here.

/** One active request as the writing prompts see it. */
export type DirectiveForPrompt = {
  id: string
  scope: DirectiveScope
  kind: DirectiveKind
  text: string
  pattern: string | null
  speechLevel: SpeechLevel | null
  targetChars: number | null
  chapterPosition: number | null
  entryId: string | null
  entryName: string | null
}

const QUOTE_RE = /'([^']+)'|"([^"]+)"|‘([^’]+)’|“([^”]+)”|「([^」]+)」/

/**
 * Default ban pattern for a request text: the first quoted span, or else the whole text.
 * A dictionary form loses its 다 (`고개를 끄덕이다` → `고개를 끄덕`), so its inflections match too.
 * A one-syllable verb keeps its stem (`고개를 젓다` → `고개를 젓`), so the object alone never bans.
 */
export function banPatternFor(text: string): string {
  const trimmed = text.trim()
  const quoted = QUOTE_RE.exec(trimmed)
  let pattern = quoted
    ? (quoted[1] ?? quoted[2] ?? quoted[3] ?? quoted[4] ?? quoted[5]).trim()
    : trimmed
  if (pattern.endsWith('다') && pattern.replace(/\s/g, '').length >= 4) {
    // Keep the verb's one syllable: 젓다 → 젓, 감다 → 감. Two characters go only when the last
    // word keeps one before them: 끄덕이다 → 끄덕.
    const lastWord = pattern.split(/\s+/).pop() ?? ''
    pattern = pattern.slice(0, lastWord.length >= 3 ? -2 : -1)
  }
  return pattern.trim()
}

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Start offsets where a ban pattern occurs in `text`. A pattern with Hangul matches as a
 * substring, with any run of spaces in the pattern matching any run of spaces in the text.
 * A Latin pattern matches case-insensitively with common inflections of its last word; a
 * doubled consonant (nod → nodded, nodding) is included, so `node` does not match.
 */
export function matchBan(text: string, pattern: string): number[] {
  const words = pattern.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const stem = words.map(escapeRegExp).join('\\s+')

  let source: string
  if (HANGUL_RE.test(pattern)) {
    source = stem
  } else {
    const last = words[words.length - 1]
    const doubled = /[b-df-hj-np-tv-z]$/i.test(last) ? last.slice(-1) : ''
    const suffix = `(?:s|es|d|ed|ing${doubled ? `|${doubled}ed|${doubled}ing` : ''})?`
    source = `\\b${stem}${suffix}\\b`
  }

  const hits: number[] = []
  for (const match of text.matchAll(new RegExp(source, 'gi'))) {
    hits.push(match.index ?? 0)
  }
  return hits
}

/** The sentence under <author_requests>. Exported so the English eval can translate it. */
export const REQUESTS_HEADER =
  '작가가 계속 지켜 달라고 한 요청이다. 이번 화 지시와 부딪치면 지시를 따르고, 그 밖에는 모든 장면에서 지킨다.'

function scopeLabel(d: DirectiveForPrompt): string {
  if (d.scope === 'work') return '[작품 전체]'
  if (d.scope === 'character') return `[인물 ${neutralizeTags(d.entryName ?? '미지정')}]`
  return `[${d.chapterPosition}화만]`
}

function kindSuffixes(d: DirectiveForPrompt): string {
  let out = ''
  if (d.speechLevel) out += ` (말투: ${d.speechLevel === 'banmal' ? '반말' : '존댓말'})`
  if (d.kind === 'ban' && d.pattern) out += ` (쓰지 않을 말: ${neutralizeTags(d.pattern)})`
  if (d.kind === 'length' && d.targetChars) out += ` (분량: 공백 포함 ${d.targetChars}자)`
  return out
}

/**
 * The `<author_requests>` block, or '' when there are no requests. Lines keep the input order.
 * Request texts and names pass through neutralizeTags, so they cannot close the block.
 */
export function renderRequestsBlock(directives: DirectiveForPrompt[]): string {
  if (directives.length === 0) return ''
  const lines = directives.map(
    (d) => `- ${scopeLabel(d)} ${neutralizeTags(d.text)}${kindSuffixes(d)}`,
  )
  return ['<author_requests>', REQUESTS_HEADER, ...lines, '</author_requests>'].join('\n')
}

/**
 * The chapter target a length request sets: the newest chapter-scope length request with a target,
 * else the newest work-scope one. `requests` is in creation order, so the last match is the newest.
 * Null when no such request applies.
 */
export function lengthRequestTarget(requests: DirectiveForPrompt[]): number | null {
  const lengths = requests.filter((d) => d.kind === 'length' && d.targetChars !== null)
  const chapter = lengths.filter((d) => d.scope === 'chapter').pop()
  const work = lengths.filter((d) => d.scope === 'work').pop()
  return (chapter ?? work)?.targetChars ?? null
}

/** `prompt` with the `<author_requests>` block in front, after a blank line; `prompt` alone when there are no requests. */
export function withRequestsBlock(directives: DirectiveForPrompt[], prompt: string): string {
  const block = renderRequestsBlock(directives)
  return block ? `${block}\n\n${prompt}` : prompt
}
