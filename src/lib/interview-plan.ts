import type { InterviewFocus } from '@/db/types'

// Interview plan: which core topics the author has closed, which are untouched, and whether the
// next question must switch. Pure, so the server service and the eval metrics share one rule.

export type CoreTopic = { name: string; aliases: readonly string[] }

export type PlanTurn = {
  topic: string
  answer: string | null
  skipped: boolean
  focus: InterviewFocus
}

export type InterviewPlan = {
  /** Display names of closed topics: the core name, or the raw topic text for a non-core topic. */
  closedTopics: string[]
  /** Core names with no turn at all, closed or open. */
  remainingCore: string[]
  /** Consecutive "미정" answers, counting from the newest turn; skipped and open turns are ignored. */
  undecidedStreak: number
  /** True when every core topic has a turn, so the next question is a story question. */
  storyDue: boolean
}

/** Answers longer than this (compacted) are never "미정", so the patterns never run on them. */
const UNDECIDED_MAX_CHARS = 120

/** Lowercase, with whitespace, punctuation and symbols removed. */
function compact(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

/** Comparison key for questions: whitespace and punctuation removed. */
export function normalizeQuestion(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, '')
}

/**
 * Filler words that carry no content on their own ("음...", "글쎄요"), matched on a compacted
 * piece. Shared with undecided-answer.ts so both "미정" rules treat filler the same way.
 */
export const FILLER_ONLY = /^(음+|어+|흠+|글쎄요?)$/

// Each pattern is anchored and matches one compacted sentence. No nested quantifiers: the filler
// group is a flat alternation under one `*`.
const UNDECIDED_KO =
  /^(?:[가-힣a-z0-9]{1,10}?(?:은|는))?(?:음|글쎄요?|그건|그것은|그부분은|아직은|아직|지금은|딱히)*(?:미정(?:이에요|입니다|이야|이다|임)?|(?:정하지|정해두지|정해놓지|결정하지|확정하지|생각해보지)(?:않았(?:어요|습니다|어|다)|못했(?:어요|습니다|어|다))|못정했(?:어요|습니다|어|다)|모르겠(?:어요|습니다|어|네요))$/
const UNDECIDED_EN =
  /^(?:(?:that|it|this)(?:is|s)?)?(?:(?:isnt|isnot|not)(?:yet)?(?:decided|determined|settled)(?:yet)?|undecided|stillundecided|tbd)$/
const UNDECIDED_EN_DONT = /^i?(?:dont|donot|havent|havenot)(?:know|decided)(?:yet)?$/

/**
 * True when the whole answer says the author has not decided the topic yet ("미정", "아직 정하지
 * 않았어요", "not decided yet"). Every sentence must be undecided; an answer with real content is not.
 */
export function isUndecidedAnswer(answer: string | null): boolean {
  if (answer === null || answer.trim() === '') return false
  if (compact(answer).length > UNDECIDED_MAX_CHARS) return false
  // Filler-only pieces ("음...") are neither content nor a marker; at least one marker is needed.
  const pieces = answer
    .split(/[.!?。…\n]+/)
    .map(compact)
    .filter((piece) => piece !== '' && !FILLER_ONLY.test(piece))
  if (pieces.length === 0) return false
  return pieces.every(
    (piece) =>
      UNDECIDED_KO.test(piece) || UNDECIDED_EN.test(piece) || UNDECIDED_EN_DONT.test(piece),
  )
}

/**
 * The core name a topic belongs to, or the compacted topic when no core topic matches. Names,
 * aliases and the topic are compared compacted: exact first, then containment (both at least two
 * characters), checked in core order.
 */
export function canonicalTopic(topic: string, core: readonly CoreTopic[]): string {
  const key = compact(topic)
  for (const entry of core) {
    if (compact(entry.name) === key) return entry.name
    if (entry.aliases.some((alias) => compact(alias) === key)) return entry.name
  }
  if (key.length >= 2) {
    for (const entry of core) {
      const names = [entry.name, ...entry.aliases].map(compact)
      for (const name of names) {
        if (name.length < 2) continue
        if (key.includes(name) || name.includes(key)) return entry.name
      }
    }
  }
  return key
}

/** The plan from the turns of the work, oldest first. */
export function planInterviewTopics(
  turns: readonly PlanTurn[],
  core: readonly CoreTopic[],
): InterviewPlan {
  const touched = new Set<string>()
  // Status and display name of the latest non-open turn of each canonical topic.
  const latest = new Map<string, { closed: boolean; display: string }>()
  for (const turn of turns) {
    const key = canonicalTopic(turn.topic, core)
    touched.add(key)
    if (turn.answer === null && !turn.skipped) continue
    const closed = turn.skipped || isUndecidedAnswer(turn.answer)
    const isCore = core.some((entry) => entry.name === key)
    latest.set(key, { closed, display: isCore ? key : turn.topic.trim() })
  }

  const closedTopics: string[] = []
  for (const entry of latest.values()) {
    if (entry.closed) closedTopics.push(entry.display)
  }

  const remainingCore = core.map((entry) => entry.name).filter((name) => !touched.has(name))

  let undecidedStreak = 0
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn.skipped || turn.answer === null) continue
    if (!isUndecidedAnswer(turn.answer)) break
    undecidedStreak += 1
  }

  return {
    closedTopics,
    remainingCore,
    undecidedStreak,
    storyDue: remainingCore.length === 0,
  }
}

/**
 * True when a question breaks the plan: it asks a closed topic (compared canonically), or it is a
 * setting question after every core topic has a turn.
 */
export function violatesPlan(
  q: { focus: InterviewFocus; topic: string },
  plan: InterviewPlan,
  core: readonly CoreTopic[],
): boolean {
  const key = canonicalTopic(q.topic, core)
  if (plan.closedTopics.some((topic) => canonicalTopic(topic, core) === key)) return true
  return plan.storyDue && q.focus === 'setting'
}

const INTERROGATIVES = /누구|무엇|뭐|어디|언제|왜|어떻게|어떤|몇|얼마/g
const COMMA_COMPOUND = /(?:이고|이며|하고|하며|이면서|이자)[,，]\s*\S/
const CONJUNCTIONS = ['그리고', '및', '또는']

/**
 * A lower bound for "asks more than one thing": several sentences, several question marks, a
 * comma-joined compound, a conjunction, or two different interrogative words. It does not prove
 * that a question asks one thing.
 */
export function isMultiAsk(question: string): boolean {
  const sentences = question.split(/[.?!。？！]+/).filter((piece) => piece.trim() !== '')
  if (sentences.length >= 2) return true
  if ((question.match(/[?？]/g) ?? []).length >= 2) return true
  if (COMMA_COMPOUND.test(question)) return true
  const squeezed = normalizeQuestion(question)
  if (CONJUNCTIONS.some((word) => squeezed.includes(word))) return true
  const words = new Set(question.match(INTERROGATIVES) ?? [])
  return words.size >= 2
}
