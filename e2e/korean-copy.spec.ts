import { expect, test } from '@playwright/test'
import { newContext, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

/** The only English allowed in the UI: file formats the import and export screens name, and `ai`. */
const ALLOWED = new Set([
  'txt', // plain text file format
  'md', // Markdown file format
  'docx', // Word file format
  'zip', // archive file format
  'hwp', // Hangul file format
  'ai', // the UI's own term is `AI 초안`
])

const ENGLISH_WORD = /[A-Za-z][A-Za-z'’.-]*[A-Za-z]/g
const MANUSCRIPT_QUOTE = '윤서는 왼손에 단검을 쥐고 문 앞에 섰다.'
const WIKI_EVIDENCE = '도윤서는 단검을 오른손에 쥔다.'

type Leak = { page: string; word: string }

test('main screens show no English words', async ({ page, browser }) => {
  const email = uniqueEmail('copy')
  const leaks: Leak[] = []

  async function scanOn(target: typeof page, label: string) {
    const text = await target.evaluate(() => {
      const parts: string[] = [document.body.innerText]
      for (const element of document.querySelectorAll(
        '[aria-label], [title], [placeholder], [alt]',
      )) {
        for (const name of ['aria-label', 'title', 'placeholder', 'alt'] as const) {
          const value = element.getAttribute(name)
          if (value) parts.push(value)
        }
      }
      return parts.join('\n')
    })
    const withoutEmail = text.split(email).join(' ')
    for (const match of withoutEmail.matchAll(ENGLISH_WORD)) {
      const word = match[0]
      if (word.length < 2) continue
      if (ALLOWED.has(word.toLowerCase())) continue
      leaks.push({ page: label, word })
    }
  }

  async function scan(label: string) {
    await scanOn(page, label)
  }

  async function open(path: string) {
    try {
      await page.goto(path)
    } catch (error) {
      // The finished sample check refreshes the route, which can abort a navigation started at the same time.
      if (!String(error).includes('ERR_ABORTED')) throw error
      await page.waitForLoadState('networkidle')
      await page.goto(path)
    }
  }

  async function visit(path: string, label: string, ready: () => Promise<void>) {
    await open(path)
    await ready()
    await scan(label)
  }

  await page.goto('/signup')
  await expect(page.getByRole('button', { name: '가입하기', exact: true })).toBeVisible()
  await scan('signup')

  await signUp(page, { name: '심사위원', email })
  await page.getByRole('button', { name: '샘플 작품으로 체험하기' }).first().click()
  await expect(page).toHaveURL(/\/works\/[^/]+\/chapters\/[^/]+/)
  await expect(page.getByText('샘플 작품', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '점검', selected: true })).toBeVisible()
  await expect(page.getByText('설정 오류 3곳을 심어 두었습니다')).toBeVisible()

  const checkPanel = page.getByRole('region', { name: '회차 점검' })
  await expect(checkPanel.getByText(MANUSCRIPT_QUOTE)).toBeVisible({ timeout: 60_000 })
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()

  const chapterPath = new URL(page.url()).pathname
  const workId = chapterPath.match(/^\/works\/([^/]+)\//)?.[1]
  if (!workId) throw new Error(`Unexpected chapter URL: ${page.url()}`)
  const base = `/works/${workId}`

  // The sample auto check refreshes the chapter route when it finishes; let that settle first.
  await page.waitForLoadState('networkidle')

  await visit('/works', 'works', async () => {
    await expect(page.getByRole('heading', { name: '내 작품', exact: true })).toBeVisible()
  })

  await visit(base, 'work home', async () => {
    await expect(page.getByRole('heading', { name: '잿빛 종루 (샘플)', exact: true })).toBeVisible()
  })

  await visit(`${base}/chapters`, 'chapters', async () => {
    await expect(page.getByRole('heading', { name: '회차 관리', exact: true })).toBeVisible()
  })

  await page.goto(chapterPath)
  await expect(page.getByRole('heading', { name: /열한 층/ })).toBeVisible()
  await page.getByRole('tab', { name: '점검', exact: true }).click()
  await expect(checkPanel.getByText(MANUSCRIPT_QUOTE)).toBeVisible({ timeout: 60_000 })
  const contextButton = page.getByRole('button', { name: 'AI가 참고한 설정 보기' })
  await expect(contextButton).toBeVisible()
  await contextButton.click()
  await expect(page.getByText(/^회차 점검은 저장된 원고에 나온 카드/)).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('region', { name: 'AI가 참고한 설정' })).toBeVisible({
    timeout: 30_000,
  })
  await scan('chapter check')

  const chapterTablist = page.getByRole('tablist', { name: '작업 패널 탭' })
  const tabNames = (await chapterTablist.getByRole('tab').allInnerTexts())
    .map((name) => name.trim())
    .filter(Boolean)
  expect(tabNames.length).toBeGreaterThanOrEqual(7)
  for (const tabName of tabNames) {
    await chapterTablist.getByRole('tab', { name: tabName, exact: true }).click()
    await expect(
      chapterTablist.getByRole('tab', { name: tabName, exact: true, selected: true }),
    ).toBeVisible()
    await scan(`chapter tab ${tabName}`)
  }

  await visit(`${base}/wiki?tab=characters`, 'wiki characters', async () => {
    await expect(page.getByRole('heading', { name: '설정 보드', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '새 인물', exact: true })).toBeVisible()
  })

  // The sr-only close text only exists while a dialog is open, so scan one open.
  await page.getByRole('button', { name: '새 인물', exact: true }).click()
  const cardDialog = page.getByRole('dialog')
  await expect(cardDialog.getByRole('heading', { name: '카드 만들기', exact: true })).toBeVisible()
  await scan('wiki card dialog')
  await page.keyboard.press('Escape')
  await expect(cardDialog).toBeHidden()

  // The sheet close text only exists while the work menu sheet is open (mobile only).
  await open(`${base}/chapters`)
  await expect(page.getByRole('heading', { name: '회차 관리', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 800 })
  await page.getByRole('button', { name: '작품 메뉴 열기', exact: true }).click()
  const menuSheet = page.getByRole('dialog')
  await expect(menuSheet.getByText('잿빛 종루 (샘플)', { exact: true })).toBeVisible()
  await scan('work menu sheet')
  await page.keyboard.press('Escape')
  await expect(menuSheet).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 720 })

  await visit(`${base}/wiki?tab=world`, 'wiki world', async () => {
    await expect(page.getByRole('heading', { name: '설정 보드', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '새 항목', exact: true })).toBeVisible()
  })

  await visit(`${base}/wiki/threads`, 'wiki threads', async () => {
    await expect(page.getByRole('heading', { name: '떡밥 장부', exact: true })).toBeVisible()
    await expect(page.getByText('어머니의 편지', { exact: true })).toBeVisible()
  })

  await visit(`${base}/wiki/graph`, 'wiki graph', async () => {
    await expect(page.getByRole('heading', { name: '관계 그래프', exact: true })).toBeVisible()
    await expect(page.getByText('그래프에서 카드나 관계를 고르세요.')).toBeVisible()
  })

  await visit(`${base}/wiki?tab=naming`, 'wiki naming', async () => {
    await expect(page.getByRole('heading', { name: '설정 보드', exact: true })).toBeVisible()
    await expect(page.getByText('아직 표기 규칙이 없습니다.')).toBeVisible()
  })

  await visit(`${base}/wiki?tab=summaries`, 'wiki summaries', async () => {
    await expect(page.getByRole('heading', { name: '설정 보드', exact: true })).toBeVisible()
    await expect(page.getByText('요약이 없습니다').first()).toBeVisible()
  })

  await visit(`${base}/wiki?tab=styles`, 'wiki styles', async () => {
    await expect(page.getByRole('heading', { name: '설정 보드', exact: true })).toBeVisible()
    await expect(page.getByText('아직 문체 카드가 없습니다.')).toBeVisible()
  })

  await visit(`${base}/wiki?tab=requests`, 'wiki requests', async () => {
    await expect(page.getByRole('heading', { name: '설정 보드', exact: true })).toBeVisible()
    await expect(
      page.getByText('아직 요청이 없습니다. AI가 계속 지켜야 할 것을 적어 두세요.'),
    ).toBeVisible()
  })

  await visit(`${base}/approvals`, 'approvals', async () => {
    await expect(page.getByRole('heading', { name: '승인 대기', exact: true })).toBeVisible()
    await expect(
      page.getByText('AI와 가져오기가 만든 제안을 확인하고 위키에 반영합니다.'),
    ).toBeVisible()
  })

  await visit(`${base}/history`, 'history', async () => {
    await expect(page.getByRole('heading', { name: '변경 이력', exact: true })).toBeVisible()
    await expect(page.getByText("인물 '한세린' 생성", { exact: true })).toBeVisible()
  })

  await visit(`${base}/schedule`, 'schedule', async () => {
    await expect(page.getByRole('heading', { name: '연재 일정', exact: true })).toBeVisible()
  })

  await visit(`${base}/settings`, 'settings', async () => {
    await expect(page.getByRole('heading', { name: '작품 설정', exact: true })).toBeVisible()
  })

  await visit(`${base}/import`, 'import', async () => {
    await expect(page.getByRole('heading', { name: '원고 가져오기', exact: true })).toBeVisible()
  })

  await visit(`${base}/interview`, 'interview', async () => {
    await expect(page.getByRole('heading', { name: '인터뷰', exact: true })).toBeVisible()
  })

  await visit('/no-such-page-e2e', 'root 404', async () => {
    await expect(page.getByText('페이지를 찾을 수 없습니다', { exact: true })).toBeVisible()
  })

  const loginContext = await newContext(browser)
  try {
    const loginPage = await loginContext.newPage()
    await loginPage.goto('/login')
    await expect(loginPage.getByRole('button', { name: '로그인', exact: true })).toBeVisible()
    await scanOn(loginPage, 'login')
  } finally {
    await loginContext.close()
  }

  expect(leaks, JSON.stringify(leaks, null, 2)).toEqual([])
})
