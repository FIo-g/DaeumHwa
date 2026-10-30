import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBible } from '../bible'
import { chapterInstructions } from '../instructions'
import { DIRECTIVE_PROBES, ledgerCharsOf } from '../directives'
import { newState } from '../state'
import { buildRunSummary, readSummaryInputs } from './finish'

// Ledger runs in the run summary (stage 2, task 8): chapter 1 counts the bible instructions only,
// and ledgerChars survive a rebuild from disk (resummarize) without the finish overlay.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const planted = {
  mode: 'ledger' as const,
  rows: DIRECTIVE_PROBES.ko.map((probe) => ({ id: probe.id, scope: 'work' as const })),
}

/** A ledger run dir with one saved chapter and its config on disk. */
function ledgerDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-finish-ledger-s2-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chapters'))
  writeFileSync(join(dir, 'chapters', '01.md'), '세린이 웃자 입꼬리가 올라갔다.\n')
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({
      lang: 'ko',
      modelId: 'fake',
      chapters: 1,
      directives: true,
      directivesMode: 'ledger',
    }),
  )
  return dir
}

function ledgerState() {
  const state = newState({
    runId: 'test',
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 1,
    maxDraftAttempts: 2,
    createdAt: '2026-10-20T00:00:00.000Z',
    commit: 'test',
  })
  state.data.planted = planted
  return state
}

const chars = (text: string) => Array.from(text).length

describe('ledger run summary', () => {
  it('counts only the bible text as chapter 1 instructions, with the planted characters apart', () => {
    const dir = ledgerDir()
    const summary = buildRunSummary([], ledgerState(), 'ko', readSummaryInputs(dir))
    const bibleText = loadBible('ko').chapters[0]?.instructions ?? ''
    const ledger = ledgerCharsOf(planted, 'ko')
    expect(summary.harness?.chapters[0]?.instructionChars).toBe(chars(bibleText))
    expect(summary.harness?.chapters[0]?.ledgerChars).toBe(ledger)
    expect(summary.harness?.total.ledgerChars).toBe(ledger)
    expect(ledger).toBeGreaterThan(0)
    expect(
      chapterInstructions(loadBible('ko'), 1, {
        lang: 'ko',
        directives: true,
        directivesMode: 'ledger',
      }),
    ).toBe(bibleText)
  })

  it('keeps ledgerChars when the summary is rebuilt from disk (resummarize)', () => {
    const dir = ledgerDir()
    const first = buildRunSummary([], ledgerState(), 'ko', readSummaryInputs(dir))
    const rebuilt = buildRunSummary([], ledgerState(), 'ko', readSummaryInputs(dir))
    expect(rebuilt.harness?.chapters[0]?.ledgerChars).toBe(ledgerCharsOf(planted, 'ko'))
    expect(rebuilt.harness?.total.ledgerChars).toBe(first.harness?.total.ledgerChars)
  })

  it('reports no planted characters for a run without the ledger', () => {
    const dir = ledgerDir()
    const state = ledgerState()
    state.data.planted = undefined
    const summary = buildRunSummary([], state, 'ko', readSummaryInputs(dir))
    expect(summary.harness?.total.ledgerChars).toBe(0)
  })
})
