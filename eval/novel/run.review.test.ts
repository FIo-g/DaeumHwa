import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContinuityInput, ContinuityOutput } from '@/ai/tasks/continuity-check'
import type { SceneRewriteInput, SceneRewriteOutput } from '@/ai/tasks/scene-rewrite'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// Review fix: a resumed scene rewrite must not call the service again after a crash that followed
// its save. Helpers copied from run.D.test.ts.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-review-'))
  dirs.push(dir)
  return dir
}

function makeRun(
  dir: string,
  lang: 'ko' | 'en' = 'ko',
  modelId: 'qwen3.8-27b' | 'haiku-5.5' = 'qwen3.8-27b',
  chapters = 1,
): void {
  createRun(dir, {
    modelId,
    lang,
    chapters,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
  })
}

async function open(dir: string, o: Parameters<typeof openRun>[1] = {}): Promise<OpenRun> {
  const ctx = await openRun(dir, o)
  opened.push(ctx)
  return ctx
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8')
const tasksOf = (dir: string) => readCallRecords(dir).map((record) => record.task)
const rewriteCalls = (dir: string) => tasksOf(dir).filter((task) => task === 'scene-rewrite')

// Clean Korean, 600+ characters, no paragraph over three sentences, no foreign script.
const QUOTE = '비가 그친 아침, 한세린은 오래된 기숙사의 계단을 천천히 내려갔다.'
const FIX = '비가 그친 아침, 한세린은 오래된 기숙사의 계단을 조용히 내려갔다.'
const LONG_KO = [
  `${QUOTE} 난간에는 아직 물기가 남아 있었다. 그녀는 손끝으로 녹슨 쇠를 쓸어 보았다.`,
  '복도 끝 창문으로 젖은 나뭇잎이 보였다. 누군가 밤사이 다녀간 흔적이었다. 바닥의 진흙에는 작은 발자국이 찍혀 있었다.',
  '한세린은 편지를 다시 꺼내 날짜를 확인했다. 지난주에 받은 것과 같은 필체였다. 종이 가장자리는 이미 누렇게 변해 있었다.',
  '문득 아래층에서 문이 열리는 소리가 들렸다. 그녀는 숨을 죽이고 귀를 기울였다. 발소리는 곧 멀어졌다.',
  '한세린은 오래된 일기장을 떠올렸다. 그 안에는 기숙사에 살던 사람들의 이름이 적혀 있었다. 이번 편지의 필체는 그 가운데 한 사람과 닮아 있었다.',
  '계단을 다 내려왔을 때 현관 유리에 그녀의 얼굴이 비쳤다. 표정은 생각보다 침착했다. 한세린은 가방을 고쳐 메고 밖으로 걸음을 옮겼다.',
].join('\n\n')

/**
 * One high issue on the first sentence, with a real quote, entry ref and a complete suggestion.
 * The wiki is empty while chapter 1 is checked, so the issue is raised for chapter 2.
 */
function highIssue(input: unknown): ContinuityOutput {
  const { pack } = input as ContinuityInput
  if (pack.entries.length === 0) return { issues: [] }
  const entry = pack.entries.find((e) => e.name === '한세린') ?? pack.entries[0]
  return {
    issues: [
      {
        quote: QUOTE,
        kind: 'contradiction',
        severity: 'high',
        factRef: entry.facts[0]?.ref ?? null,
        entryRef: entry.ref,
        wikiExcerpt: entry.facts[0]?.content ?? entry.summary,
        explanation: '위키와 어긋납니다.',
        suggestion: FIX,
      },
    ],
  }
}

function localInner(): FakeAiClient {
  return new FakeAiClient({
    overrides: {
      'draft-chapter': () => LONG_KO,
      'draft-expand': NO_EXPANSION,
      'continuity-check': highIssue,
    },
  })
}

// Two scenes split by a break line. Scene one holds QUOTE, scene two holds QUOTE_B. The scene two
// rewrite is answered unchanged, so isAcceptableRewrite rejects it while scene one is saved.
const QUOTE_B = '현관 유리에 비친 그녀의 얼굴은 생각보다 침착해 보였다.'
const FIX_B = '현관 유리에 비친 그녀의 얼굴은 한결 차분해 보였다.'
const TWO_SCENE_KO = [
  `${QUOTE} 난간에는 아직 물기가 남아 있었다. 그녀는 손끝으로 녹슨 쇠를 쓸어 보았다.`,
  '복도 끝 창문으로 젖은 나뭇잎이 보였다. 누군가 밤사이 다녀간 흔적이었다. 바닥의 진흙에는 작은 발자국이 찍혀 있었다.',
  '한세린은 편지를 다시 꺼내 날짜를 확인했다. 지난주에 받은 것과 같은 필체였다. 종이 가장자리는 이미 누렇게 변해 있었다.',
  '* * *',
  '문득 아래층에서 문이 열리는 소리가 들렸다. 그녀는 숨을 죽이고 귀를 기울였다. 발소리는 곧 멀어졌다.',
  '한세린은 오래된 일기장을 떠올렸다. 그 안에는 기숙사에 살던 사람들의 이름이 적혀 있었다. 이번 편지의 필체는 그 가운데 한 사람과 닮아 있었다.',
  `${QUOTE_B} 한세린은 가방을 고쳐 메고 밖으로 걸음을 옮겼다.`,
].join('\n\n')

/** Two high issues, one per scene, each with a real quote and a complete suggestion. */
function twoIssues(input: unknown): ContinuityOutput {
  const { pack } = input as ContinuityInput
  if (pack.entries.length === 0) return { issues: [] }
  const entry = pack.entries.find((e) => e.name === '한세린') ?? pack.entries[0]
  const shared = {
    kind: 'contradiction' as const,
    severity: 'high' as const,
    factRef: entry.facts[0]?.ref ?? null,
    entryRef: entry.ref,
    wikiExcerpt: entry.facts[0]?.content ?? entry.summary,
    explanation: '위키와 어긋납니다.',
  }
  return {
    issues: [
      { ...shared, quote: QUOTE, suggestion: FIX },
      { ...shared, quote: QUOTE_B, suggestion: FIX_B },
    ],
  }
}

/** Scene one is fixed; scene two comes back unchanged, so its quote is still there and it is rejected. */
function sceneRewriteAnswer(input: unknown): SceneRewriteOutput {
  const { sceneText, findings } = input as SceneRewriteInput
  if (findings.some((finding) => finding.quote === QUOTE_B)) return { text: sceneText }
  return { text: sceneText.split(QUOTE).join(FIX) }
}

async function runLocal(dir: string) {
  makeRun(dir, 'ko', 'qwen3.8-27b', 2)
  const ctx = await open(dir, { inner: localInner(), autoAuthor: true })
  ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
  return { ctx, state: await runUntilBlocked(ctx) }
}

// Expansion fails in these tests, as before the fake answered draft-expand: they plant text
// that an accepted expansion would rewrite.
const NO_EXPANSION = () => {
  throw new Error('no expansion in this test')
}

describe('scene rewrite resume after a crash (local profile)', () => {
  it('does not call the service again after a crash that followed its save', async () => {
    const dir = newDir()
    makeRun(dir, 'ko', 'qwen3.8-27b', 2)
    const inner = localInner()
    const first = await open(dir, { inner, autoAuthor: true })
    first.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    // The service saved and the files were written; the run stops before the rewritten mark.
    first.throwBeforeMark = (key) => key === 'ch2:continuity:rewritten'
    const paused = await runUntilBlocked(first)
    expect(paused.status).not.toBe('done')
    const original = JSON.parse(read(dir, 'rewrites/02.json')) as {
      rewritten: { runId: string | null }[]
    }
    const savedBody = read(dir, 'chapters/02.md')
    expect(rewriteCalls(dir)).toHaveLength(1)
    await opened.pop()?.close()

    // Crash right after the save: the record and the chapter and metrics files were not written
    // yet, so they still hold the pre-rewrite copies.
    rmSync(join(dir, 'rewrites/02.json'))
    writeFileSync(join(dir, 'chapters/02.md'), read(dir, 'chapters/02.pre-rewrite.md'))
    writeFileSync(join(dir, 'metrics/02.json'), read(dir, 'metrics/02.pre-rewrite.json'))

    const second = await open(dir, { inner, autoAuthor: true })
    second.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const done = await runUntilBlocked(second)

    expect(done.status).toBe('done')
    expect(rewriteCalls(dir)).toHaveLength(1)
    expect(read(dir, 'chapters/02.md')).toBe(savedBody)
    expect(read(dir, 'chapters/02.md')).toContain(FIX)
    const record = JSON.parse(read(dir, 'rewrites/02.json')) as {
      rewritten: { issueIds: string[]; runId: string | null }[]
      skipped: unknown[]
      recovered?: boolean
    }
    expect(record.recovered).toBe(true)
    expect(record.rewritten.length).toBeGreaterThan(0)
    expect(record.rewritten[0]?.issueIds.length).toBeGreaterThan(0)
    expect(record.rewritten[0]?.runId).toBe(original.rewritten[0]?.runId)
    expect(done.data.marks['ch2:continuity:rewritten']).toBe(true)
  }, 120_000)

  it('keeps the record when the crash came after it was written', async () => {
    const dir = newDir()
    makeRun(dir, 'ko', 'qwen3.8-27b', 2)
    const inner = localInner()
    const first = await open(dir, { inner, autoAuthor: true })
    first.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    first.throwBeforeMark = (key) => key === 'ch2:continuity:rewritten'
    await runUntilBlocked(first)
    const record = read(dir, 'rewrites/02.json')
    const savedBody = read(dir, 'chapters/02.md')
    await opened.pop()?.close()

    const second = await open(dir, { inner, autoAuthor: true })
    second.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const done = await runUntilBlocked(second)

    expect(done.status).toBe('done')
    expect(rewriteCalls(dir)).toHaveLength(1)
    expect(read(dir, 'rewrites/02.json')).toBe(record)
    expect(read(dir, 'chapters/02.md')).toBe(savedBody)
    expect(done.data.marks['ch2:continuity:rewritten']).toBe(true)
  }, 120_000)

  it('makes no further scene-rewrite call on resume after a crash that followed a partly rejected rewrite', async () => {
    const dir = newDir()
    makeRun(dir, 'ko', 'qwen3.8-27b', 2)
    const inner = new FakeAiClient({
      overrides: {
        'draft-chapter': () => TWO_SCENE_KO,
        'draft-expand': NO_EXPANSION,
        'continuity-check': twoIssues,
        'scene-rewrite': sceneRewriteAnswer,
      },
    })
    const first = await open(dir, { inner, autoAuthor: true })
    first.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    first.throwBeforeMark = (key) => key === 'ch2:continuity:rewritten'
    const paused = await runUntilBlocked(first)
    expect(paused.status).not.toBe('done')
    // One call per scene: scene one is saved, scene two is rejected and stays as it was.
    expect(rewriteCalls(dir)).toHaveLength(2)
    const savedBody = read(dir, 'chapters/02.md')
    expect(savedBody).toContain(FIX)
    expect(savedBody).toContain(QUOTE_B)
    await opened.pop()?.close()

    // Crash right after the save: the record and the chapter and metrics files were not written
    // yet, so they still hold the pre-rewrite copies. The saved body stays in the database.
    rmSync(join(dir, 'rewrites/02.json'))
    writeFileSync(join(dir, 'chapters/02.md'), read(dir, 'chapters/02.pre-rewrite.md'))
    writeFileSync(join(dir, 'metrics/02.json'), read(dir, 'metrics/02.pre-rewrite.json'))

    const second = await open(dir, { inner, autoAuthor: true })
    second.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    const done = await runUntilBlocked(second)

    expect(done.status).toBe('done')
    // Without the early skip, scene two (still matching its span) would be sent again.
    expect(rewriteCalls(dir)).toHaveLength(2)
    expect(read(dir, 'chapters/02.md')).toBe(savedBody)
    const record = JSON.parse(read(dir, 'rewrites/02.json')) as {
      rewritten: { issueIds: string[] }[]
      recovered?: boolean
    }
    expect(record.recovered).toBe(true)
    expect(record.rewritten[0]?.issueIds.length).toBeGreaterThan(0)
    expect(done.data.marks['ch2:continuity:rewritten']).toBe(true)
  }, 120_000)

  it('the normal path makes exactly one scene rewrite call and no recovered flag', async () => {
    const dir = newDir()
    const { state } = await runLocal(dir)

    expect(state.status).toBe('done')
    expect(rewriteCalls(dir)).toHaveLength(1)
    const record = JSON.parse(read(dir, 'rewrites/02.json')) as {
      rewritten: unknown[]
      recovered?: boolean
    }
    expect(record.rewritten).toHaveLength(1)
    expect(record.recovered).toBeUndefined()
    expect(read(dir, 'chapters/02.md')).toContain(FIX)
  }, 120_000)
})
