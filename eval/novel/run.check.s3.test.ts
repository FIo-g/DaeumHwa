import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { initRun, sceneFixFlag } from './cli'
import { loadBible } from './bible'
import { fakeAnswer } from './fake-author'
import { createRun, openRun, runUntilBlocked, type RunCreateOptions } from './run'
import { loadConfig } from './state'
import { readCallRecords } from './steps/util'

// Check-and-fix in the draft step (stage 3, task 6): right after the draft is stored and before
// trim and repair, the eval runs checkAndFixDraft and applies the fix. The author sees the final
// text in draft_review.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-check-s3-'))
  dirs.push(dir)
  return dir
}

/** Three scenes of numbered sentences (3 per paragraph), long enough to skip expansion. */
function sceneText(who: string, verb: string, count: number): string {
  const sentences = Array.from(
    { length: count },
    (_, i) => `${who}는 ${i + 1}번째 ${verb}를 책상 위에 올렸다.`,
  )
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join(' '))
  }
  return paragraphs.join('\n\n')
}

const S1 = sceneText('서윤', '단서', 81)
const S2 = sceneText('지수', '편지', 81)
const S3 = `${sceneText('민준', '열쇠', 78)}\n\n"이제 돌아가자." 그녀가 말했다.`
const THREE = [S1, S2, S3].join('\n\n***\n\n')
// The fixed scene 2: the same paragraphs with one sentence rewritten at the same length.
const S2_FIXED = S2.replace(
  '지수는 5번째 편지를 책상 위에 올렸다.',
  '지수는 편지를 펼쳐 들고 소리 내어 읽었다.',
)
const FIX_MARK = '편지를 펼쳐 들고 소리 내어 읽었다.'
const ORIG_MARK = '지수는 5번째 편지를 책상 위에 올렸다.'

function checkOverrides(fixed: string) {
  return {
    'draft-chapter': () => THREE,
    'draft-check': () => ({
      scenes: [
        { scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] },
      ],
    }),
    'scene-fix': () => ({ text: fixed }),
  }
}

function makeRun(dir: string, o: Partial<RunCreateOptions> = {}): void {
  createRun(dir, {
    modelId: 'fake',
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    ...o,
  })
}

async function runChapter(dir: string, inner: FakeAiClient): Promise<void> {
  const ctx = await openRun(dir, { inner, autoAuthor: true })
  try {
    ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
    await runUntilBlocked(ctx)
  } finally {
    await ctx.close()
  }
}

describe('sceneFixFlag', () => {
  it('is on (undefined) when the flag is absent', () => {
    expect(sceneFixFlag({})).toBeUndefined()
  })

  it('is false for off', () => {
    expect(sceneFixFlag({ 'scene-fix': 'off' })).toBe(false)
  })

  it('throws on any other value', () => {
    expect(() => sceneFixFlag({ 'scene-fix': 'maybe' })).toThrow()
  })
})

describe('initRun scene-fix', () => {
  it('stores sceneFix false and names the directory with -nofix when off', () => {
    const root = newDir()
    const { dir } = initRun({ model: 'fake', lang: 'ko', dir: join(root, 'c'), sceneFix: false })
    expect(loadConfig(dir).sceneFix).toBe(false)
    const auto = initRun({ model: 'fake', lang: 'ko', sceneFix: false })
    dirs.push(auto.dir)
    expect(auto.dir.endsWith('-nofix')).toBe(true)
  })

  it('leaves sceneFix absent for a default run', () => {
    const root = newDir()
    const { dir } = initRun({ model: 'fake', lang: 'ko', dir: join(root, 'd') })
    expect(loadConfig(dir).sceneFix).toBeUndefined()
  })

  it('refuses an existing run made with another scene-fix setting', () => {
    const root = newDir()
    const dir = join(root, 'e')
    initRun({ model: 'fake', lang: 'ko', dir })
    expect(() => initRun({ model: 'fake', lang: 'ko', dir, sceneFix: false })).toThrow(
      `run exists with another sceneFix: ${dir}`,
    )
  })
})

describe('draft step check-and-fix (stage 3)', () => {
  it('records one draft-check and one scene-fix call and saves the fixed text', async () => {
    const dir = newDir()
    makeRun(dir)
    await runChapter(dir, new FakeAiClient({ overrides: checkOverrides(S2_FIXED) }))

    const tasks = readCallRecords(dir).map((record) => record.task)
    expect(tasks.filter((task) => task === 'draft-check')).toHaveLength(1)
    expect(tasks.filter((task) => task === 'scene-fix')).toHaveLength(1)
    const chapter = readFileSync(join(dir, 'chapters', '01.md'), 'utf8')
    expect(chapter).toContain(FIX_MARK)
    expect(chapter).not.toContain(ORIG_MARK)
  }, 120_000)

  it('records neither call with --scene-fix off and keeps the draft', async () => {
    const dir = newDir()
    makeRun(dir, { sceneFix: false })
    await runChapter(dir, new FakeAiClient({ overrides: checkOverrides(S2_FIXED) }))

    const tasks = readCallRecords(dir).map((record) => record.task)
    expect(tasks).not.toContain('draft-check')
    expect(tasks).not.toContain('scene-fix')
    const chapter = readFileSync(join(dir, 'chapters', '01.md'), 'utf8')
    expect(chapter).toContain(ORIG_MARK)
    expect(chapter).not.toContain(FIX_MARK)
  }, 120_000)

  it('leaves the draft text when the check call throws', async () => {
    const dir = newDir()
    makeRun(dir)
    const inner = new FakeAiClient({
      overrides: {
        'draft-chapter': () => THREE,
        'draft-check': () => {
          throw new Error('boom')
        },
        'scene-fix': (input: unknown) => ({ text: (input as { scene: string }).scene }),
      },
    })
    await runChapter(dir, inner)

    expect(inner.recorded.filter((call) => call.name === 'draft-check')).toHaveLength(1)
    const chapter = readFileSync(join(dir, 'chapters', '01.md'), 'utf8')
    expect(chapter).toContain(ORIG_MARK)
    expect(chapter).not.toContain(FIX_MARK)
    expect(existsSync(join(dir, 'chapters', '01.md'))).toBe(true)
  }, 120_000)
})
