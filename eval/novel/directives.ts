// Planted author directives (stage 0). The probes are requests the author gives once, in chapter 1's
// instructions; each saved chapter is then checked for keeping them. They do not overlap the bible's
// style rules, so a kept or broken status says only what the directive asks.

import type { DirectiveScope } from '@/db/types'
import { createDirective, listDirectives, type DirectiveInput } from '@/server/directives'
import { listEntries } from '@/server/wiki'
import type { RunContext } from './run'

export type DirectiveId = 'tic' | 'ban-1' | 'ban-2' | 'end-dialogue'
export type DirectiveStatus = 'kept' | 'broken' | 'n/a'

export const DIRECTIVE_PROBES: Record<'ko' | 'en', { id: DirectiveId; text: string }[]> = {
  ko: [
    { id: 'tic', text: '도윤서는 대화를 마칠 때 꼭 "조심하십시오."라고 말한다.' },
    { id: 'ban-1', text: "'고개를 끄덕이다'는 쓰지 않는다." },
    { id: 'ban-2', text: "'입꼬리'라는 말은 쓰지 않는다." },
    { id: 'end-dialogue', text: '회차는 인물의 대사 한 줄로 끝낸다.' },
  ],
  en: [
    { id: 'tic', text: 'Do Yunseo always ends a conversation by saying "Watch your step."' },
    { id: 'ban-1', text: 'Never use the word "nod" (nod, nods, nodded, nodding).' },
    { id: 'ban-2', text: 'Never use the phrase "for a moment".' },
    { id: 'end-dialogue', text: 'End each chapter on a single line of dialogue.' },
  ],
}

const HEADER: Record<'ko' | 'en', string> = {
  ko: '앞으로 모든 회차에서 지켜 주세요.',
  en: 'Keep these in every chapter from now on:',
}

/** The directive lines appended to chapter 1's instructions. */
export function directiveBlock(lang: 'ko' | 'en'): string {
  return [HEADER[lang], ...DIRECTIVE_PROBES[lang].map((probe) => `- ${probe.text}`)].join('\n')
}

const TIC_NAMES: Record<'ko' | 'en', string[]> = {
  ko: ['도윤서', '윤서'],
  en: ['Do Yunseo', 'Yunseo'],
}

const TIC_PHRASE: Record<'ko' | 'en', string> = {
  ko: '조심하십시오',
  en: 'watch your step',
}

const BANNED_1: Record<'ko' | 'en', RegExp> = {
  ko: /고개[를만도]?\s*(?:[^\s.!?…"“”]{1,4}\s+){0,2}(끄덕|주억)/,
  en: /\bnod(s|ded|ding)?\b/i,
}

const BANNED_2: Record<'ko' | 'en', RegExp> = {
  ko: /입꼬리/,
  en: /\bfor a moment\b/i,
}

// Korean web novels use ‘ ’ for inner thoughts, so ko speech takes only double and corner brackets.
const DIALOGUE_QUOTES: Record<'ko' | 'en', { openers: string[]; closers: string[] }> = {
  ko: { openers: ['“', '"', '「', '『'], closers: ['”', '"', '」', '』'] },
  en: {
    openers: ['“', '"', '「', '『', '‘', "'"],
    closers: ['”', '"', '」', '』', '’', "'"],
  },
}

/** Whether the last non-empty line is a quoted line of dialogue. */
function endsOnDialogue(text: string, lang: 'ko' | 'en'): boolean {
  const lines = text.split('\n').map((line) => line.trim())
  const last = lines.filter((line) => line !== '').at(-1) ?? ''
  if (last === '') return false
  const { openers, closers } = DIALOGUE_QUOTES[lang]
  return openers.some((q) => last.startsWith(q)) && closers.some((q) => last.endsWith(q))
}

function checkOne(text: string, lang: 'ko' | 'en', id: DirectiveId): DirectiveStatus {
  switch (id) {
    case 'tic': {
      const haystack = text.toLowerCase()
      const named = TIC_NAMES[lang].some((name) => haystack.includes(name.toLowerCase()))
      if (!named) return 'n/a'
      return haystack.includes(TIC_PHRASE[lang]) ? 'kept' : 'broken'
    }
    case 'ban-1':
      return BANNED_1[lang].test(text) ? 'broken' : 'kept'
    case 'ban-2':
      return BANNED_2[lang].test(text) ? 'broken' : 'kept'
    case 'end-dialogue':
      return endsOnDialogue(text, lang) ? 'kept' : 'broken'
  }
}

/** Each probe's status on one chapter text, in probe order. */
export function checkDirectives(
  text: string,
  lang: 'ko' | 'en',
): { id: DirectiveId; status: DirectiveStatus }[] {
  return DIRECTIVE_PROBES[lang].map((probe) => ({
    id: probe.id,
    status: checkOne(text, lang, probe.id),
  }))
}

export type DirectiveResults = {
  lang: 'ko' | 'en'
  chapters: { n: number; results: { id: DirectiveId; status: DirectiveStatus }[] }[]
  /** The probes planted as author requests (ledger mode only), with the scope each got. */
  planted?: PlantedLedger
}

/** The ledger rows of a ledger run: each probe id with the scope its row got. */
export type PlantedLedger = { mode: 'ledger'; rows: { id: DirectiveId; scope: DirectiveScope }[] }

const LEDGER_KIND: Record<DirectiveId, 'speech' | 'ban' | 'style'> = {
  tic: 'speech',
  'ban-1': 'ban',
  'ban-2': 'ban',
  'end-dialogue': 'style',
}

const LEDGER_PATTERN: Record<'ko' | 'en', Partial<Record<DirectiveId, string>>> = {
  ko: { 'ban-1': '고개를 끄덕', 'ban-2': '입꼬리' },
  en: { 'ban-1': 'nod', 'ban-2': 'for a moment' },
}

/**
 * Plants the probes as author requests (ledger mode), once: a probe whose author row already exists,
 * archived or not, is kept as it is. The tic row is scoped to the character when the entry exists,
 * else to the work. Writes go through the product service as the author.
 */
export async function plantLedger(
  ctx: Pick<RunContext, 'db' | 'actor' | 'config'>,
  workId: string,
): Promise<PlantedLedger> {
  const lang = ctx.config.lang
  const existing = await listDirectives(ctx.db, ctx.actor, workId, { includeArchived: true })
  const entries = await listEntries(ctx.db, ctx.actor, workId)
  const ticName = TIC_NAMES[lang][0] ?? ''
  const yunseo = entries.find((entry) => entry.name === ticName || entry.aliases.includes(ticName))
  const rows: PlantedLedger['rows'] = []
  for (const probe of DIRECTIVE_PROBES[lang]) {
    const found = existing.find((row) => row.source === 'author' && row.text === probe.text)
    if (found) {
      rows.push({ id: probe.id, scope: found.scope })
      continue
    }
    // Only the tic probe is about a character; it falls back to the work when the entry is missing.
    const entryId = probe.id === 'tic' ? (yunseo?.id ?? null) : null
    const input: DirectiveInput = {
      workId,
      scope: entryId ? 'character' : 'work',
      kind: LEDGER_KIND[probe.id],
      text: probe.text,
      entryId,
      ...(LEDGER_PATTERN[lang][probe.id] ? { pattern: LEDGER_PATTERN[lang][probe.id] } : {}),
      source: 'author',
    }
    await createDirective(ctx.db, ctx.actor, input)
    rows.push({ id: probe.id, scope: input.scope })
  }
  return { mode: 'ledger', rows }
}

/** Characters of the planted probe texts of a ledger run (the harness counts them as instruction text). */
export function ledgerCharsOf(planted: PlantedLedger, lang: 'ko' | 'en'): number {
  return DIRECTIVE_PROBES[lang]
    .filter((probe) => planted.rows.some((row) => row.id === probe.id))
    .reduce((sum, probe) => sum + Array.from(probe.text).length, 0)
}

/** The probe results of each saved chapter, in chapter order. */
export function directiveResults(
  chapters: { n: number; text: string }[],
  lang: 'ko' | 'en',
): DirectiveResults {
  return {
    lang,
    chapters: [...chapters]
      .sort((a, b) => a.n - b.n)
      .map((chapter) => ({ n: chapter.n, results: checkDirectives(chapter.text, lang) })),
  }
}

/** Kept, broken and n/a counts of one chapter. */
export function directiveCounts(chapter: DirectiveResults['chapters'][number]): {
  n: number
  kept: number
  broken: number
  na: number
} {
  const count = (status: DirectiveStatus) =>
    chapter.results.filter((result) => result.status === status).length
  return { n: chapter.n, kept: count('kept'), broken: count('broken'), na: count('n/a') }
}
