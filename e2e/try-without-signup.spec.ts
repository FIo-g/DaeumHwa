import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, uniqueEmail } from './helpers'

test.use({ viewport: { width: 1440, height: 1000 } })
test.setTimeout(180_000)

const TRIAL_BUTTON = '가입 없이 체험하기'
const TRIAL_STATUS = '체험 중'
const SAMPLE_TITLE = '잿빛 종루 (샘플)'
const MANUSCRIPT_QUOTE = '윤서는 왼손에 단검을 쥐고 문 앞에 섰다.'
const WIKI_EVIDENCE = '도윤서는 단검을 오른손에 쥔다.'

async function capture(page: Page, filename: string) {
  const directory = process.env.TRIAL_SCREENSHOT_DIR
  if (!directory) return
  await page.screenshot({
    path: join(directory, filename),
    animations: 'disabled',
    style: 'nextjs-portal, [data-sonner-toaster] { visibility: hidden !important; }',
  })
}

test('checks chapter three without signup and keeps the same work after signup', async ({
  page,
}) => {
  let checkCalls = 0
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/chapters\/[^/]+\/check$/.test(new URL(request.url()).pathname)
    ) {
      checkCalls += 1
    }
  })
  for (const path of ['/login', '/signup']) {
    await page.goto(path)
    await expect(page.getByRole('button', { name: TRIAL_BUTTON })).toBeVisible()
  }

  await page.goto('/')
  const tryButton = page.getByRole('button', { name: TRIAL_BUTTON }).first()
  await expect(tryButton).toBeVisible()
  await capture(page, '01-landing.png')
  await tryButton.click()

  await expect(page).toHaveURL(/\/works\/[^/]+\/chapters\/[^/]+/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^3화(?:\s|$)/ })).toBeVisible()
  await expect(page.getByText(TRIAL_STATUS, { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '점검', selected: true })).toBeVisible()
  const checkPanel = page.getByRole('region', { name: '회차 점검' })
  await expect(checkPanel.getByText(MANUSCRIPT_QUOTE)).toBeVisible({ timeout: 60_000 })
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()
  await expect(page.getByRole('button', { name: '제안대로 고치기' })).toHaveCount(0)
  const chapterPath = new URL(page.url()).pathname
  const workPath = chapterPath.split('/chapters/')[0]

  await capture(page, '02-trial-check.png')
  await page.getByRole('link', { name: '가입 후 작품 이어가기' }).click()
  await expect(page.getByText('체험 작품은 이 계정으로 옮겨집니다.')).toBeVisible()
  await page.getByLabel('이름', { exact: true }).fill('심사위원')
  await page.getByLabel('이메일', { exact: true }).fill(uniqueEmail('trial'))
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '가입하기', exact: true }).click()

  await expect(page).toHaveURL(/\/works$/)
  await expect(page.getByText(TRIAL_STATUS, { exact: true })).toHaveCount(0)
  const work = page.locator(`a[href="${workPath}"]`).filter({ hasText: SAMPLE_TITLE })
  await expect(work).toBeVisible()
  await expect(work).toContainText('소유자')
  await capture(page, '03-after-signup.png')

  await page.goto(chapterPath)
  await page.getByRole('tab', { name: '점검', exact: true }).click()
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()
  await expect(checkPanel.getByRole('button', { name: '제안대로 고치기' }).first()).toBeVisible()
  expect(checkCalls).toBe(1)
})
