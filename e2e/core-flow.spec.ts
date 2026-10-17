import { expect, test } from '@playwright/test'
import { createWork, createCharacter, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

const SENTENCE = '서윤은 오른손으로 검을 쥐었다.'
const FACT = '서윤은 왼손잡이다.'

test('write, check against the wiki, approve, and read history', async ({ page }) => {
  await signUp(page, { name: '작가', email: uniqueEmail('core') })
  const workId = await createWork(page, '테스트 작품')

  // 바로 쓰기 opens the newest draft, creating chapter 1 when there is none.
  await page.goto(`/works/${workId}/write`)
  await page.waitForURL(/\/works\/[^/]+\/chapters\/[^/]+$/)
  const chapterPath = new URL(page.url()).pathname

  await page.getByRole('textbox', { name: '원고 본문' }).fill(SENTENCE)
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Reload to prove the sentence reached the server, not just the browser.
  await page.reload()
  await expect(page.getByRole('textbox', { name: '원고 본문' })).toHaveValue(SENTENCE)

  // Settings board: create the character 서윤 and a confirmed fact about her.
  await page
    .getByRole('navigation', { name: '작품 메뉴' })
    .getByRole('link', { name: '설정 보드', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/wiki`))
  await createCharacter(page, '서윤')

  await page.getByRole('link', { name: /^서윤/ }).click()
  await page.getByRole('button', { name: '사실 추가', exact: true }).click()
  const factDialog = page.getByRole('dialog')
  await expect(factDialog.getByRole('heading', { name: '사실 추가', exact: true })).toBeVisible()
  await factDialog.getByLabel('사실 내용', { exact: true }).fill(FACT)
  await factDialog.getByRole('button', { name: '확정', exact: true }).click()
  await expect(factDialog.getByRole('button', { name: '확정', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await factDialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(factDialog).toBeHidden()
  await expect(page.getByText(FACT, { exact: true })).toBeVisible()

  // Back to the chapter: run 회차 점검 and look for the contradiction.
  await page.goto(chapterPath)
  await expect(page.getByRole('textbox', { name: '원고 본문' })).toHaveValue(SENTENCE)
  await page.getByRole('tab', { name: '점검', exact: true }).click()
  await page.getByRole('button', { name: '회차 점검', exact: true }).click()

  // The check also queues wiki candidates, and its dialog opens on top of the panel at once.
  // Approve them all there first. While the dialog is open the panel is not reachable.
  const approval = page.getByRole('dialog')
  await expect(approval.getByRole('heading', { name: /이 회차에서 찾은 위키 후보/ })).toBeVisible({
    timeout: 30_000,
  })
  await approval.getByRole('button', { name: '모두 승인 (AI 태그 그대로)' }).click()
  await expect(approval.getByText('승인 대기 중인 후보가 없습니다.')).toBeVisible({
    timeout: 30_000,
  })
  await page.keyboard.press('Escape')
  await expect(approval).toBeHidden()

  // The contradiction stays open in the check panel, quoting the sentence and the wiki fact.
  const checkPanel = page.getByRole('region', { name: '회차 점검' })
  await expect(checkPanel.getByText(SENTENCE, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(checkPanel.getByText(FACT, { exact: true })).toBeVisible()

  // Approvals page is empty now.
  await page
    .getByRole('navigation', { name: '작품 메뉴' })
    .getByRole('link', { name: '승인 대기', exact: false })
    .click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/approvals`))
  await expect(page.getByText('승인 대기 중인 제안이 없습니다.', { exact: true })).toBeVisible()

  // History lists the card creation.
  await page
    .getByRole('navigation', { name: '작품 메뉴' })
    .getByRole('link', { name: '이력', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/history`))
  await expect(page.getByText("인물 '서윤' 생성", { exact: true })).toBeVisible()
})
