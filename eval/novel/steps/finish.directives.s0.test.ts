import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { newState } from '../state'
import { buildRunSummary, readSummaryInputs, RunSummarySchema, writeDirectivesFile } from './finish'

// Directive results in the run summary and directives.json (stage 0).

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A run dir with one saved chapter: narration at the end, 입꼬리 in the text, no tic name. */
function runDir(config: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-finish-dir-s0-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'chapters'))
  writeFileSync(
    join(dir, 'chapters', '01.md'),
    '세린이 웃자 입꼬리가 올라갔다.\n\n세린은 대답하지 않았다.\n',
  )
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ lang: 'ko', ...config }))
  return dir
}

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

describe('directives summary', () => {
  it('writes directives.json and the summary block when directives is on', () => {
    const dir = runDir({ directives: true })
    const inputs = readSummaryInputs(dir)
    writeDirectivesFile(dir, inputs)
    const summary = buildRunSummary([], state, 'ko', inputs)
    expect(summary.directives).toEqual({
      chapters: [{ n: 1, kept: 1, broken: 2, na: 1 }],
    })
    expect(RunSummarySchema.parse(summary).directives).toEqual(summary.directives)
    expect(JSON.parse(readFileSync(join(dir, 'directives.json'), 'utf8')).chapters[0].n).toBe(1)
  })

  it('writes neither file nor block without directives', () => {
    const dir = runDir({})
    const inputs = readSummaryInputs(dir)
    writeDirectivesFile(dir, inputs)
    const summary = buildRunSummary([], state, 'ko', inputs)
    expect(summary.directives).toBeUndefined()
    expect(existsSync(join(dir, 'directives.json'))).toBe(false)
  })
})
