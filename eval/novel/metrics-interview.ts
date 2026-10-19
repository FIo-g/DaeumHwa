import type { InterviewFocus } from '@/db/types'
import { CORE_TOPICS } from '@/ai/tasks/interview-question'
import {
  canonicalTopic,
  isMultiAsk,
  isUndecidedAnswer,
  normalizeQuestion,
} from '@/lib/interview-plan'

// Interview metrics (track I). Re-exported from metrics.ts. Pure: the turn stats come from the eval
// run state, so `resummarize` can rebuild them from disk without the database.

export type InterviewTurnStat = {
  turnId: string
  focus: InterviewFocus
  topic: string
  question: string
  answer: string | null
  skipped: boolean
}

export type InterviewMetrics = {
  asked: number
  answered: number // answer !== null (includes undecided answers)
  undecided: number
  undecidedShare: number // undecided / answered, 0 when answered is 0
  setting: number
  story: number
  storyShare: number // story / asked, 0 when asked is 0
  duplicateQuestions: number // turns whose compact question equals an earlier one
  sameTopicAfterUndecided: number // turns whose canonical topic's latest earlier non-open turn is closed
  multiAsk: number // turns where isMultiAsk(question); a lower bound
  storyAfterCoreDone: number // story turns after the turn where the 8th core topic first appears
  undecidedShareInBank: number // undecided / answered, over turns whose canonical topic is a core name
}

const CORE_NAME_SET = new Set<string>(CORE_TOPICS.map((topic) => topic.name))

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole
}

export function interviewMetrics(turns: readonly InterviewTurnStat[]): InterviewMetrics {
  const answeredTurns = turns.filter((turn) => turn.answer !== null)
  const undecided = answeredTurns.filter((turn) => isUndecidedAnswer(turn.answer)).length

  const seenQuestions = new Set<string>()
  let duplicateQuestions = 0
  for (const turn of turns) {
    const key = normalizeQuestion(turn.question)
    if (seenQuestions.has(key)) duplicateQuestions += 1
    seenQuestions.add(key)
  }

  // The latest non-open turn of each canonical topic decides whether a later question is a re-ask.
  let sameTopicAfterUndecided = 0
  const latestClosed = new Map<string, boolean>()
  for (const turn of turns) {
    const key = canonicalTopic(turn.topic, CORE_TOPICS)
    if (latestClosed.get(key) === true) sameTopicAfterUndecided += 1
    if (turn.answer === null && !turn.skipped) continue
    latestClosed.set(key, turn.skipped || isUndecidedAnswer(turn.answer))
  }

  // The 8th distinct core topic decides where the story questions start counting.
  const coreSeen = new Set<string>()
  let coreDoneIndex = -1
  for (let i = 0; i < turns.length && coreDoneIndex < 0; i++) {
    const key = canonicalTopic(turns[i].topic, CORE_TOPICS)
    if (CORE_NAME_SET.has(key)) coreSeen.add(key)
    if (coreSeen.size === CORE_NAME_SET.size) coreDoneIndex = i
  }
  const storyAfterCoreDone =
    coreDoneIndex < 0
      ? 0
      : turns.filter((turn, i) => i > coreDoneIndex && turn.focus === 'story').length

  const bankAnswered = answeredTurns.filter((turn) =>
    CORE_NAME_SET.has(canonicalTopic(turn.topic, CORE_TOPICS)),
  )
  const bankUndecided = bankAnswered.filter((turn) => isUndecidedAnswer(turn.answer)).length

  const story = turns.filter((turn) => turn.focus === 'story').length

  return {
    asked: turns.length,
    answered: answeredTurns.length,
    undecided,
    undecidedShare: share(undecided, answeredTurns.length),
    setting: turns.filter((turn) => turn.focus === 'setting').length,
    story,
    storyShare: share(story, turns.length),
    duplicateQuestions,
    sameTopicAfterUndecided,
    multiAsk: turns.filter((turn) => isMultiAsk(turn.question)).length,
    storyAfterCoreDone,
    undecidedShareInBank: share(bankUndecided, bankAnswered.length),
  }
}
