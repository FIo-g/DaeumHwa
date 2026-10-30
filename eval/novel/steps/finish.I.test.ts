import { describe, expect, it } from 'vitest'
import { MODEL_IDS } from '../models'
import { interviewMetrics } from '../metrics-interview'
import { type RunConfig, newState } from '../state'
import { buildRunSummary } from './finish'

// Brief I: the run summary carries the interview metrics, and an old state without interview
// turns still summarizes (all zeros).

const config: RunConfig = {
  runId: 'run-1',
  modelId: MODEL_IDS[0],
  lang: 'ko',
  chapters: 1,
  questions: 2,
  maxDraftAttempts: 1,
  createdAt: '2026-10-19T00:00:00.000Z',
  commit: 'abc',
}

describe('buildRunSummary interview field', () => {
  it('summarizes the recorded interview turns', () => {
    const state = newState(config)
    state.data.interviewTurns = [
      {
        turnId: 't1',
        focus: 'setting',
        topic: '주인공',
        question: '주인공은 누구인가요?',
        answer: '그건 아직 정하지 않았어요.',
        skipped: false,
      },
      {
        turnId: 't2',
        focus: 'setting',
        topic: '주요 인물',
        question: '중요한 인물은 누구인가요?',
        answer: '민준은 서윤의 스승이다.',
        skipped: false,
      },
    ]
    const summary = buildRunSummary([], state, 'ko')
    expect(summary.interview).toEqual(interviewMetrics(state.data.interviewTurns))
    expect(summary.interview.undecided).toBe(1)
    expect(summary.interview.asked).toBe(2)
  })

  it('reports zeros for a state saved before interview turns were recorded', () => {
    const state = newState(config)
    delete state.data.interviewTurns
    const summary = buildRunSummary([], state, 'ko')
    expect(summary.interview.asked).toBe(0)
    expect(summary.interview.undecidedShare).toBe(0)
  })
})
