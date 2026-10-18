import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildPlan,
  loadConfig,
  loadState,
  newState,
  saveConfig,
  saveState,
  type RunConfig,
} from './state'

const config: RunConfig = {
  runId: 'run-1',
  modelId: 'fake',
  lang: 'ko',
  chapters: 5,
  questions: 3,
  maxDraftAttempts: 2,
  createdAt: '2026-10-18T00:00:00.000Z',
  commit: 'abc1234',
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'novel-state-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('buildPlan', () => {
  it('starts with setup and interview, then chapter 1 without advice', () => {
    const plan = buildPlan({ chapters: 5 })
    expect(plan.slice(0, 4)).toEqual(['setup', 'interview', 'ch1:draft', 'ch1:proofread'])
    expect(plan).not.toContain('ch1:advice')
  })

  it('has advice from chapter 2 on', () => {
    const plan = buildPlan({ chapters: 5 })
    expect(plan).toContain('ch2:advice')
    expect(plan).toContain('ch5:advice')
  })

  it('places style steps right after ch2:proposals only', () => {
    const plan = buildPlan({ chapters: 5 })
    const at = plan.indexOf('ch2:proposals')
    expect(plan.slice(at + 1, at + 3)).toEqual(['style:suggest', 'style:review'])
    expect(plan.filter((step) => step.startsWith('style:'))).toHaveLength(2)
  })

  it('ends with finish after the reader step of the last chapter', () => {
    const plan = buildPlan({ chapters: 5 })
    expect(plan.slice(-2)).toEqual(['ch5:reader', 'finish'])
  })
})

describe('run state persistence', () => {
  it('round-trips state through saveState and loadState without leaving a tmp file', () => {
    const state = newState(config)
    state.status = 'paused-limit'
    state.cursor = 4
    state.data.marks['ch1:chapter-created'] = true
    state.data.checkProposalIds = { 1: ['p1', 'p2'] }
    saveState(dir, state)

    expect(loadState(dir)).toEqual(state)
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('round-trips config through saveConfig and loadConfig', () => {
    saveConfig(dir, config)
    expect(loadConfig(dir)).toEqual(config)
  })

  it('starts a new state with the plan and empty progress', () => {
    const state = newState(config)
    expect(state.status).toBe('new')
    expect(state.cursor).toBe(0)
    expect(state.plan).toEqual(buildPlan(config))
    expect(state.data.asked).toBe(0)
    expect(existsSync(path.join(dir, 'state.json'))).toBe(false)
  })
})
