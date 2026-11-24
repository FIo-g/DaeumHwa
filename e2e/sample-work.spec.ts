import { expect, test } from '@playwright/test'
import { signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

const MANUSCRIPT_QUOTE = '윤서는 왼손에 단검을 쥐고 문 앞에 섰다.'
const WIKI_EVIDENCE = '도윤서는 단검을 오른손에 쥔다.'

test('one click builds the sample work and auto-runs the chapter check once', async ({ page }) => {
  let checkCalls = 0
  page.on('request', (request) => {
    if (request.method() !== 'POST') return
    if (/\/chapters\/[^/]+\/check$/.test(new URL(request.url()).pathname)) checkCalls += 1
  })

  await signUp(page, { name: '심사위원', email: uniqueEmail('sample') })
  await page.getByRole('button', { name: '샘플 작품으로 체험하기' }).first().click()

  await expect(page).toHaveURL(/\/works\/[^/]+\/chapters\/[^/]+/)
  await expect(page.getByText('샘플 작품', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '점검', selected: true })).toBeVisible()
  await expect(page.getByText('설정 오류를 세 군데 숨겨 뒀어요.')).toBeVisible()
  await expect(page.getByRole('link', { name: '2화 점검하기' })).toBeVisible()
  await expect(page.getByRole('link', { name: '설정 보드 보기' })).toBeVisible()

  const checkPanel = page.getByRole('region', { name: '회차 점검' })
  await expect(checkPanel.getByText(MANUSCRIPT_QUOTE)).toBeVisible({ timeout: 60_000 })
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()

  // The auto run drops demo from the URL and refreshes the page; the guide and the check tab stay.
  await expect(page.getByText('샘플 작품', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '점검', selected: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A reload must not check again, and the results must still be there exactly once.
  await page.reload()
  await page.waitForTimeout(3_000)
  expect(checkCalls).toBe(1)
  await expect(page.getByRole('tab', { name: '점검', selected: true })).toBeVisible()
  await expect(checkPanel.getByText(MANUSCRIPT_QUOTE)).toHaveCount(1)
  await expect(page.getByText('점검을 마쳤어요.')).toHaveCount(0)
})
