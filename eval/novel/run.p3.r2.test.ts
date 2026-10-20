import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SCENE_PLAN_RULE,
  type ContinuityInput,
  type ContinuityOutput,
} from '@/ai/tasks/continuity-check'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeAnswer } from './fake-author'
import { loadBible } from './bible'
import { createRun, openRun, runUntilBlocked } from './run'
import { readCallRecords } from './steps/util'

// P3: the chosen draft's location list reaches the continuity check in two-step runs only
// (local profiles, and a cloud profile created with --two-step on). Helpers copied from run.D.test.ts.

type OpenRun = Awaited<ReturnType<typeof openRun>>

const opened: OpenRun[] = []
const dirs: string[] = []

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-run-p3-'))
  dirs.push(dir)
  return dir
}

function makeRun(dir: string, modelId: 'qwen3.8-27b' | 'haiku-5.5', twoStep = false): void {
  createRun(dir, {
    modelId,
    lang: 'ko',
    chapters: 1,
    questions: 2,
    maxDraftAttempts: 2,
    commit: 'test',
    ...(twoStep ? { twoStep: true } : {}),
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

// Clean Korean, 600+ characters, no paragraph over three sentences, no foreign script.
const QUOTE = '비가 그친 아침, 한세린은 오래된 기숙사의 계단을 천천히 내려갔다.'
const LONG_KO = [
  `${QUOTE} 난간에는 아직 물기가 남아 있었다. 그녀는 손끝으로 녹슨 쇠를 쓸어 보았다.`,
  '복도 끝 창문으로 젖은 나뭇잎이 보였다. 누군가 밤사이 다녀간 흔적이었다. 바닥의 진흙에는 작은 발자국이 찍혀 있었다.',
  '한세린은 편지를 다시 꺼내 날짜를 확인했다. 지난주에 받은 것과 같은 필체였다. 종이 가장자리는 이미 누렇게 변해 있었다.',
  '문득 아래층에서 문이 열리는 소리가 들렸다. 그녀는 숨을 죽이고 귀를 기울였다. 발소리는 곧 멀어졌다.',
  '한세린은 오래된 일기장을 떠올렸다. 그 안에는 기숙사에 살던 사람들의 이름이 적혀 있었다. 이번 편지의 필체는 그 가운데 한 사람과 닮아 있었다.',
  '계단을 다 내려왔을 때 현관 유리에 그녀의 얼굴이 비쳤다. 표정은 생각보다 침착했다. 한세린은 가방을 고쳐 메고 밖으로 걸음을 옮겼다.',
].join('\n\n')

/** Runs one chapter to the end and returns what the continuity check received, one entry per call. */
async function runAndCapture(dir: string, modelId: 'qwen3.8-27b' | 'haiku-5.5', twoStep = false) {
  makeRun(dir, modelId, twoStep)
  const seen: ContinuityInput[] = []
  const inner = new FakeAiClient({
    overrides: {
      'draft-chapter': () => LONG_KO,
      'continuity-check': (input) => {
        seen.push(input as ContinuityInput)
        return { issues: [] } satisfies ContinuityOutput
      },
    },
  })
  const ctx = await open(dir, { inner, autoAuthor: true })
  ctx.autoAuthor = (p) => fakeAnswer(p, loadBible('ko'))
  const state = await runUntilBlocked(ctx)
  return { state, seen }
}

function continuityRecords(dir: string) {
  return readCallRecords(dir).filter((record) => record.task === 'continuity-check')
}

describe('scene location list in the continuity check (P3)', () => {
  it('local profile: the continuity check gets the location list of the chosen draft', async () => {
    const dir = newDir()
    const { state, seen } = await runAndCapture(dir, 'qwen3.8-27b')

    expect(state.status).toBe('done')
    expect(typeof seen[0].scenePlan).toBe('string')
    expect(seen[0].scenePlan?.startsWith('장면 1\n장소: ')).toBe(true)
    expect(seen[0].scenePlan).toContain('인물: ')
    expect(seen[0].scenePlan).toContain('물건: ')
    expect(seen[0].scenePlan).not.toContain('순서:')

    const records = continuityRecords(dir)
    expect(records).toHaveLength(1)
    expect(records[0].step).toBe('ch1:check')
    expect(records[0].prompt).toContain('<scene_plan>')
    expect(records[0].prompt).toContain(SCENE_PLAN_RULE)
  }, 120_000)

  it('cloud profile: no scene plan reaches the continuity check', async () => {
    const dir = newDir()
    const { state, seen } = await runAndCapture(dir, 'haiku-5.5')

    expect(state.status).toBe('done')
    expect(seen[0]).not.toHaveProperty('scenePlan')
    const records = continuityRecords(dir)
    expect(records).toHaveLength(1)
    expect(records[0].prompt).not.toContain('scene_plan')
    expect(existsSync(join(dir, 'chapters/01.attempt-1.beats.json'))).toBe(false)
  }, 120_000)

  it('cloud profile with --two-step on: the continuity check gets the location list', async () => {
    const dir = newDir()
    const { state, seen } = await runAndCapture(dir, 'haiku-5.5', true)

    expect(state.status).toBe('done')
    expect(seen[0].scenePlan?.startsWith('장면 1\n장소: ')).toBe(true)
    const records = continuityRecords(dir)
    expect(records[0].prompt).toContain('<scene_plan>')
  }, 120_000)
})
