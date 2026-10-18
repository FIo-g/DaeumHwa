// Interview stress run against a running app (default http://localhost:3200) with the E2E AI stub.
// Run with: pnpm exec tsx scripts/stress/interview-stress.ts --mode start --pid <server pid> --out <json>
//
// Scenario: sign up, create a work, write a chapter, then run 35 interview turns.
// - every 7th turn is cancelled mid-generation (the answer contains the 느리게 marker, so the stub waits 30s)
// - every 5th turn (not already cancelled) is skipped
// - a chapter check runs in a second tab during turn 10
// - the editor types and autosaves in a third tab during turns 15-20
// - the interview is ended and restarted after turn 25
// Every 5 turns the script records server liveness (GET /) and RSS (ps) for the given pid.
// The script never starts or stops the server; the caller does that.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type Browser, type BrowserContext, chromium, expect, type Page } from '@playwright/test'

type Options = { base: string; stub: string; mode: string; pid: number | null; out: string }

type TurnKind = 'answer' | 'skip' | 'cancel'

type TurnRecord = {
  turn: number
  kind: TurnKind
  ok: boolean
  ms: number
  note: string
}

type Sample = { turn: number; at: string; alive: boolean; status: string; rssKb: number | null }

type Failure = {
  at: string
  where: string
  message: string
  pageText: string
  screenshot: string
}

type Result = {
  mode: string
  base: string
  pid: number | null
  startedAt: string
  finishedAt: string | null
  turns: TurnRecord[]
  samples: Sample[]
  failures: Failure[]
  apiErrors: { at: string; status: number; url: string }[]
  posts: { at: string; status: number; ms: number; action: boolean; url: string }[]
  pageErrors: { at: string; message: string }[]
  requestFailures: { at: string; url: string; error: string }[]
  check: string
  editor: string
  serverDead: boolean
  aborted: string | null
}

const SEQ = { answerChunk: 0 }
const TURN_COUNT = 35
const CHECK_TURN = 10
const EDITOR_FROM = 15
const EDITOR_TO = 20
const RESTART_AFTER = 25
const SLOW_MARK = '[느리게]'
const PASSWORD = 'stress-pass-1234'

function parseArgs(argv: string[]): Options {
  const value = (name: string, fallback: string | null) => {
    const index = argv.indexOf(name)
    if (index === -1) return fallback
    return argv[index + 1] ?? fallback
  }
  const pidText = value('--pid', null)
  return {
    base: value('--base', 'http://localhost:3200') ?? 'http://localhost:3200',
    stub: value('--stub', 'http://127.0.0.1:3199') ?? 'http://127.0.0.1:3199',
    mode: value('--mode', 'unknown') ?? 'unknown',
    pid: pidText ? Number(pidText) : null,
    out: value('--out', 'interview-stress-result.json') ?? 'interview-stress-result.json',
  }
}

const now = () => new Date().toISOString()

async function serverAlive(base: string): Promise<{ alive: boolean; status: string }> {
  try {
    const res = await fetch(`${base}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
    return { alive: res.status > 0, status: String(res.status) }
  } catch (error) {
    return { alive: false, status: error instanceof Error ? error.message : String(error) }
  }
}

function rssKb(pid: number | null): number | null {
  if (pid === null) return null
  try {
    const text = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    return text ? Number(text) : null
  } catch {
    return null
  }
}

async function signUp(page: Page, base: string): Promise<void> {
  const email = `stress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
  await page.goto(`${base}/signup`)
  await page.getByLabel('이름', { exact: true }).fill('스트레스')
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '가입하기', exact: true }).click()
  await expect(page).toHaveURL(/\/works$/, { timeout: 30_000 })
}

async function createWork(page: Page, base: string): Promise<string> {
  await page.goto(`${base}/works/new`)
  await page.getByLabel('제목', { exact: true }).fill('스트레스 작품')
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click()
  const link = page.getByRole('link', { name: '바로 쓰기', exact: true })
  await expect(link).toBeVisible({ timeout: 30_000 })
  const href = await link.getAttribute('href')
  const match = href?.match(/^\/works\/([^/]+)\/write$/)
  if (!match) throw new Error(`Unexpected write link: ${href}`)
  return match[1] ?? ''
}

/** Opens 바로 쓰기 to create chapter 1 and returns its absolute URL. */
async function writeChapter(page: Page, base: string, workId: string): Promise<string> {
  await page.goto(`${base}/works/${workId}/write`)
  await page.waitForURL(/\/works\/[^/]+\/chapters\/[^/]+$/, { timeout: 30_000 })
  const textbox = page.getByRole('textbox', { name: '원고 본문' })
  await expect(textbox).toBeVisible({ timeout: 30_000 })
  await textbox.fill('서윤은 낡은 문 앞에 멈춰 섰다. 비가 그쳐 있었다.')
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible({ timeout: 30_000 })
  return new URL(page.url()).href
}

function question(page: Page) {
  return page.locator('#interview-question')
}

async function waitForQuestion(page: Page): Promise<void> {
  await expect(question(page)).toBeVisible({ timeout: 120_000 })
}

async function fillAnswer(page: Page, text: string): Promise<void> {
  await page.getByLabel('답변', { exact: true }).fill(text)
}

async function answerNormally(page: Page, turn: number): Promise<void> {
  SEQ.answerChunk += 1
  await fillAnswer(page, `턴 ${turn}: 서윤은 골목 끝 낡은 문을 열었다. 답 ${SEQ.answerChunk}.`)
  await page.getByRole('button', { name: '답하기', exact: true }).click()
  await expect(
    page
      .getByRole('region', { name: '이 답에서 나온 제안' })
      .or(page.getByText('이 답에서 새로 정리된 제안은 없습니다.', { exact: true })),
  ).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: '다음 질문', exact: true }).click()
}

/** Answers with the slow marker, cancels mid-generation, then answers normally. */
async function cancelThenAnswer(page: Page, turn: number): Promise<string> {
  await fillAnswer(page, `${SLOW_MARK} 턴 ${turn}: 취소될 답변입니다.`)
  await page.getByRole('button', { name: '답하기', exact: true }).click()
  const cancel = page.getByRole('button', { name: '취소', exact: true })
  await expect(cancel).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(3000)
  await cancel.click()
  await expect(page.getByRole('button', { name: '답하기', exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await answerNormally(page, turn)
  return '취소 후 다시 답함'
}

async function endAndRestart(page: Page): Promise<void> {
  console.log('[restart] clicking 인터뷰 끝내기')
  await page.getByRole('button', { name: '인터뷰 끝내기', exact: true }).click()
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  console.log('[restart] confirming')
  await dialog.getByRole('button', { name: '끝내기', exact: true }).click()
  // The finished panel is the only place with this sentence; the success toast repeats the first words.
  await expect(
    page.getByText('처리하지 않은 후보는 승인 대기에 남아 있습니다.', { exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  console.log('[restart] ended, starting a new interview')
  await page.getByRole('button', { name: '새 인터뷰 시작', exact: true }).click()
  await waitForQuestion(page)
}

async function runCheck(context: BrowserContext, chapterUrl: string): Promise<string> {
  const page = await context.newPage()
  try {
    await page.goto(chapterUrl)
    await page.getByRole('tab', { name: '점검', exact: true }).click()
    // The check POST is the outcome that matters: its status and body say whether the run finished.
    const response = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('/check'),
      { timeout: 240_000 },
    )
    await page.getByRole('button', { name: '회차 점검', exact: true }).click()
    const res = await response
    const body = await res.text().catch(() => '')
    const toast = await page
      .locator('[data-sonner-toast]')
      .first()
      .innerText({ timeout: 5000 })
      .catch(() => '')
    return `POST ${res.status()} ${body.slice(0, 120)} | toast: ${toast.replace(/\s+/g, ' ').slice(0, 80)}`
  } catch (error) {
    return `실패: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
  } finally {
    await page.close()
  }
}

async function typeInEditor(context: BrowserContext, chapterUrl: string): Promise<string> {
  const page = await context.newPage()
  try {
    await page.goto(chapterUrl)
    const textbox = page.getByRole('textbox', { name: '원고 본문' })
    await expect(textbox).toBeVisible({ timeout: 30_000 })
    for (let i = 0; i < EDITOR_TO - EDITOR_FROM + 1; i += 1) {
      await textbox.click()
      await textbox.press('Control+End')
      await textbox.pressSequentially(`\n편집 ${i}: 서윤은 창가에 기대어 비를 보았다.`)
      await expect(page.getByText('저장됨', { exact: true })).toBeVisible({ timeout: 30_000 })
    }
    return '편집 저장 완료'
  } catch (error) {
    return `실패: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    await page.close()
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const result: Result = {
    mode: opts.mode,
    base: opts.base,
    pid: opts.pid,
    startedAt: now(),
    finishedAt: null,
    turns: [],
    samples: [],
    failures: [],
    apiErrors: [],
    posts: [],
    pageErrors: [],
    requestFailures: [],
    check: '시작 안 함',
    editor: '시작 안 함',
    serverDead: false,
    aborted: null,
  }

  const snapshot = async (turn: number) => {
    const live = await serverAlive(opts.base)
    const sample: Sample = {
      turn,
      at: now(),
      alive: live.alive,
      status: live.status,
      rssKb: rssKb(opts.pid),
    }
    result.samples.push(sample)
    console.log(
      `[sample] turn=${turn} alive=${live.alive} status=${live.status} rssKb=${sample.rssKb}`,
    )
    if (!live.alive) result.serverDead = true
    return live.alive
  }

  const browser: Browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL: opts.base })
  // Playwright's default action timeout is unlimited; a stuck click must fail with a message instead.
  context.setDefaultTimeout(60_000)
  const watch = (p: Page) => {
    p.on('pageerror', (error) => {
      result.pageErrors.push({ at: now(), message: error.message })
    })
  }
  context.on('page', watch)
  const page = await context.newPage()
  watch(page)

  context.on('response', (res) => {
    const url = res.url()
    const request = res.request()
    if (request.method() === 'POST') {
      result.posts.push({
        at: now(),
        status: res.status(),
        ms: Math.round(request.timing().responseEnd),
        action: request.headers()['next-action'] !== undefined,
        url: url.replace(/\?.*$/, ''),
      })
    }
    if (url.includes('/api/') && res.status() >= 500) {
      result.apiErrors.push({ at: now(), status: res.status(), url })
    }
  })
  context.on('requestfailed', (req) => {
    result.requestFailures.push({
      at: now(),
      url: req.url(),
      error: req.failure()?.errorText ?? 'unknown',
    })
  })

  const fail = async (where: string, error: unknown, failPage: Page | null = null) => {
    const label = where.replace(/[^a-zA-Z0-9]+/g, '-')
    let pageText = ''
    let screenshot = ''
    if (failPage) {
      pageText = (
        await failPage
          .locator('body')
          .innerText({ timeout: 5000 })
          .catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .slice(0, 600)
      screenshot = join(dirname(opts.out), `fail-${label}.png`)
      await failPage.screenshot({ path: screenshot, timeout: 5000 }).catch(() => {
        screenshot = ''
      })
    }
    result.failures.push({
      at: now(),
      where,
      message: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
      pageText,
      screenshot,
    })
  }

  try {
    await snapshot(0)
    await signUp(page, opts.base)
    const workId = await createWork(page, opts.base)
    const chapterUrl = await writeChapter(page, opts.base, workId)
    await page.goto(`${opts.base}/works/${workId}/interview`)

    const startButton = page.getByRole('button', { name: '인터뷰 시작', exact: true })
    await startButton.click()
    await waitForQuestion(page)

    let editorPromise: Promise<string> | null = null
    let checkPromise: Promise<string> | null = null
    let consecutiveErrors = 0

    for (let turn = 1; turn <= TURN_COUNT; turn += 1) {
      if (result.serverDead) break
      const started = Date.now()
      if (turn === CHECK_TURN) checkPromise = runCheck(context, chapterUrl)
      if (turn === EDITOR_FROM) editorPromise = typeInEditor(context, chapterUrl)
      if (turn === EDITOR_TO + 1 && editorPromise) result.editor = await editorPromise

      const kind: TurnKind = turn % 7 === 0 ? 'cancel' : turn % 5 === 0 ? 'skip' : 'answer'
      try {
        await waitForQuestion(page)
        let note = ''
        if (kind === 'cancel') {
          note = await cancelThenAnswer(page, turn)
        } else if (kind === 'skip') {
          await page.getByRole('button', { name: '건너뛰기', exact: true }).click()
          await waitForQuestion(page)
          note = '건너뜀'
        } else {
          await answerNormally(page, turn)
          note = '답함'
        }
        result.turns.push({ turn, kind, ok: true, ms: Date.now() - started, note })
        consecutiveErrors = 0
        console.log(`[turn] ${turn} ${kind} ok ${Date.now() - started}ms ${note}`)
      } catch (error) {
        await fail(`turn ${turn} (${kind})`, error, page)
        result.turns.push({
          turn,
          kind,
          ok: false,
          ms: Date.now() - started,
          note: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
        })
        console.log(`[turn] ${turn} ${kind} FAILED`)
        consecutiveErrors += 1
        if (consecutiveErrors >= 3) {
          result.aborted = '연속 3회 실패'
          break
        }
        await page.reload().catch((e) => fail('reload', e))
      }

      if (turn === RESTART_AFTER) {
        try {
          await endAndRestart(page)
          console.log(`[restart] interview ended and restarted after turn ${turn}`)
        } catch (error) {
          await fail(`restart after turn ${turn}`, error, page)
        }
      }

      if (turn % 5 === 0) await snapshot(turn)
    }

    if (checkPromise) result.check = await checkPromise
    if (!editorPromise) result.editor = '시작 안 함'
    else if (result.editor === '시작 안 함') result.editor = await editorPromise
    await snapshot(TURN_COUNT)
  } catch (error) {
    await fail('setup', error)
    result.aborted = result.aborted ?? '설정 단계 실패'
  } finally {
    result.finishedAt = now()
    await context.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
    writeFileSync(opts.out, JSON.stringify(result, null, 2))
    console.log(`[done] wrote ${opts.out}`)
    console.log(
      `[summary] turns ok=${result.turns.filter((t) => t.ok).length}/${result.turns.length} failures=${result.failures.length} apiErrors=${result.apiErrors.length} pageErrors=${result.pageErrors.length} serverDead=${result.serverDead}`,
    )
  }
}

void main()
