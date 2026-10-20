import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PendingSchema, readAnswer, type Pending } from './author-io'

// The plan_review handshake (stage 1): a pending card review and an approve or note answer.

const pending: Pending = {
  kind: 'plan_review',
  step: 'ch1:draft',
  chapter: 1,
  card: '작가 메모: (없음)',
  intention: '윤서가 편지를 찾는다.',
  mustInclude: [],
  round: 1,
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'novel-author-io-plan-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function answer(json: unknown): void {
  writeFileSync(join(dir, 'answer.json'), JSON.stringify(json))
}

describe('plan_review pending', () => {
  it('parses a plan_review pending', () => {
    expect(PendingSchema.safeParse(pending).success).toBe(true)
  })
})

describe('plan_review answer', () => {
  it('accepts an approval', () => {
    answer({ kind: 'plan_review', approve: true })
    expect(readAnswer(dir, pending)).toEqual({ kind: 'plan_review', approve: true })
  })

  it('accepts a note of 1 to 150 characters', () => {
    const note = '종이 혼자 떠는 장면을 넣어 주세요'
    answer({ kind: 'plan_review', approve: false, note })
    expect(readAnswer(dir, pending)).toEqual({ kind: 'plan_review', approve: false, note })
  })

  it('refuses a refusal with no note and moves the answer aside', () => {
    answer({ kind: 'plan_review', approve: false, note: '' })
    expect(readAnswer(dir, pending)).toBeNull()
    expect(existsSync(join(dir, 'answer.rejected-1.json'))).toBe(true)
    expect(readFileSync(join(dir, 'answer.error.txt'), 'utf8')).toContain('note')
  })

  it('refuses a note over 150 characters', () => {
    answer({ kind: 'plan_review', approve: false, note: '가'.repeat(151) })
    expect(readAnswer(dir, pending)).toBeNull()
    expect(existsSync(join(dir, 'answer.rejected-1.json'))).toBe(true)
  })
})
