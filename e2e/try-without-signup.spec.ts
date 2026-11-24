import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { PASSWORD, uniqueEmail } from './helpers'

test.use({ viewport: { width: 1440, height: 1000 } })
test.setTimeout(180_000)

const TRIAL_BUTTON = '가입 없이 체험하기'
const TRIAL_STATUS = '체험 중'
const SAMPLE_TITLE = '잿빛 종루 (샘플)'
const MANUSCRIPT_QUOTE = '윤서는 왼손에 단검을 쥐고 문 앞에 섰다.'
const FIXED_QUOTE = '윤서는 오른손에 단검을 쥐고 문 앞에 섰다.'
const WIKI_EVIDENCE = '도윤서는 단검을 오른손에 쥔다.'
const APPROVED_SUMMARY = '세린과 윤서가 종루 입구에서 만난다.'

async function capture(page: Page, filename: string) {
  const directory = process.env.TRIAL_SCREENSHOT_DIR
  if (!directory) return
  await page.screenshot({
    path: join(directory, filename),
    animations: 'disabled',
    style: 'nextjs-portal, [data-sonner-toaster] { visibility: hidden !important; }',
  })
}

async function signUpFromTrial(
  page: Page,
  signupLink: Locator = page.getByRole('link', { name: '가입 후 작품 이어가기' }),
) {
  await signupLink.click()
  await expect(page.getByText('체험 작품은 이 계정으로 옮겨 드려요.')).toBeVisible()
  await page.getByLabel('이름', { exact: true }).fill('심사위원')
  await page.getByLabel('이메일', { exact: true }).fill(uniqueEmail('trial'))
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '가입하기', exact: true }).click()
  await expect(page).toHaveURL(/\/works$/)
  await expect(page.getByText(TRIAL_STATUS, { exact: true })).toHaveCount(0)
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
  page.setDefaultTimeout(15_000)
  await page.setViewportSize({ width: 390, height: 844 })
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
  const sheet = page.getByRole('dialog', { name: '작업 패널' })
  const tabs = sheet.getByRole('tablist', { name: '작업 패널 탭' })
  await expect(sheet).toBeVisible()
  await expect(tabs.getByRole('tab', { name: '점검', selected: true })).toBeVisible()
  const checkPanel = sheet.getByRole('region', { name: '회차 점검' })
  await expect(checkPanel.getByText(MANUSCRIPT_QUOTE)).toBeVisible({ timeout: 60_000 })
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()
  await expect(checkPanel.getByRole('button', { name: '제안대로 고치기' }).first()).toBeVisible()
  const chapterPath = new URL(page.url()).pathname
  const workPath = chapterPath.split('/chapters/')[0]

  // The auto check refreshes the chapter after showing its result and can recreate the sheet.
  await page.waitForLoadState('networkidle')
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()
  await capture(page, '02-trial-check.png')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { name: /^3화(?:\s|$)/ })).toBeVisible()
  await expect(page.getByText(TRIAL_STATUS, { exact: true })).toBeVisible()
  const restrictedTools = [
    { path: 'advice', label: '방향 조언' },
    { path: 'reader-sim', label: '독자 시뮬레이션' },
    { path: 'import', label: '가져오기' },
    { path: 'interview', label: '인터뷰' },
  ]
  const signupLink = page.getByRole('main').getByRole('link', { name: '가입 후 작품 이어가기' })
  for (const { path, label } of restrictedTools) {
    await page.getByRole('button', { name: '작품 메뉴 열기', exact: true }).click()
    const menu = page.getByRole('dialog', { name: SAMPLE_TITLE, exact: true })
    await expect(menu).toBeVisible()
    await menu.getByRole('link', { name: `${label} 가입 필요`, exact: true }).click()
    await expect(page).toHaveURL(`${workPath}/${path}`)
    await expect(page.getByText('가입 후 이용할 수 있어요.', { exact: true })).toBeVisible()
    await expect(signupLink).toBeVisible()
    await expect(signupLink).toHaveAttribute('href', '/signup')
  }
  await signUpFromTrial(page, signupLink)
  const work = page.locator(`a[href="${workPath}"]`).filter({ hasText: SAMPLE_TITLE })
  await expect(work).toBeVisible()
  await expect(work).toContainText('소유자')
  await capture(page, '03-after-signup.png')

  await page.goto(chapterPath)
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: '패널 열기', exact: true }).click()
  await expect(sheet).toBeVisible()
  await tabs.getByRole('tab', { name: '점검', exact: true }).click()
  await expect(checkPanel.getByText(WIKI_EVIDENCE)).toBeVisible()
  await expect(checkPanel.getByRole('button', { name: '제안대로 고치기' }).first()).toBeVisible()
  expect(checkCalls).toBe(1)
})

test('resolves a finding and approves an edited proposal before signup', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: TRIAL_BUTTON }).first().click()
  await expect(page.getByRole('heading', { name: /^3화(?:\s|$)/ })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(TRIAL_STATUS, { exact: true })).toBeVisible()

  const checkPanel = page.getByRole('region', { name: '회차 점검' })
  const finding = checkPanel.getByRole('listitem').filter({ hasText: MANUSCRIPT_QUOTE })
  const apply = finding.getByRole('button', { name: '제안대로 고치기' })
  const manuscript = page.getByRole('textbox', { name: '원고 본문' })
  await expect(apply).toBeVisible({ timeout: 60_000 })
  await expect(finding.getByText(WIKI_EVIDENCE)).toBeVisible()
  await expect(finding.getByRole('button', { name: '위키 고치기' })).toBeVisible()
  await expect(finding.getByRole('button', { name: '무시' })).toBeVisible()
  await expect(manuscript).toHaveValue(new RegExp(MANUSCRIPT_QUOTE))
  const chapterPath = new URL(page.url()).pathname
  const workPath = chapterPath.split('/chapters/')[0]

  await capture(page, '04-trial-check-actions.png')
  await apply.click()
  await expect(manuscript).toHaveValue(new RegExp(FIXED_QUOTE))
  await expect(finding).toHaveCount(0)
  await capture(page, '05-trial-manuscript-fixed.png')

  await page.getByRole('link', { name: /^승인 대기/ }).click()
  await expect(page).toHaveURL(`${workPath}/approvals`)
  const proposal = page.getByRole('article').filter({ hasText: '회차 요약' })
  const approve = proposal.getByRole('button', { name: '승인', exact: true })
  await expect(approve).toBeVisible()
  await expect(proposal.getByRole('button', { name: '거절', exact: true })).toBeVisible()
  await capture(page, '06-trial-approvals.png')
  await proposal.getByRole('button', { name: '수정', exact: true }).click()
  await proposal.getByRole('textbox', { name: '요약', exact: true }).fill(APPROVED_SUMMARY)
  await approve.click()
  await expect(page.getByText('승인 대기 중인 제안이 없어요.')).toBeVisible()

  await signUpFromTrial(page)
  await expect(
    page.locator(`a[href="${workPath}"]`).filter({ hasText: SAMPLE_TITLE }),
  ).toContainText('소유자')
  await page.goto(chapterPath)
  await expect(manuscript).toHaveValue(new RegExp(FIXED_QUOTE))
  await expect(manuscript).not.toHaveValue(new RegExp(MANUSCRIPT_QUOTE))
  await page.getByRole('tab', { name: '점검', exact: true }).click()
  await expect(finding).toHaveCount(0)
  await page.goto(`${workPath}/wiki?tab=summaries`)
  await expect(page.getByRole('textbox', { name: /^3화.*요약$/ })).toHaveValue(APPROVED_SUMMARY)
})
