import { expect, test } from '@playwright/test'
import { createCharacter, createWork, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

const SENTENCE = '서윤은 오른손으로 검을 쥐었다.'
const FACT = '서윤은 왼손잡이다.'

test('marking a chapter done runs the check and queues candidates', async ({ page }) => {
  await signUp(page, { name: '작가', email: uniqueEmail('autocheck') })
  const workId = await createWork(page, '자동 점검 작품')

  await page.goto(`/works/${workId}/write`)
  await page.waitForURL(/\/works\/[^/]+\/chapters\/[^/]+$/)
  const chapterPath = new URL(page.url()).pathname
  await page.getByRole('textbox', { name: '원고 본문' }).fill(SENTENCE)
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible({ timeout: 15_000 })

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

  // Back to the chapter. Deciding to finish runs the check by itself.
  await page.goto(chapterPath)
  await expect(page.getByRole('textbox', { name: '원고 본문' })).toHaveValue(SENTENCE)
  await page
    .getByRole('group', { name: '회차 상태' })
    .getByRole('button', { name: '완료', exact: true })
    .click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '완료하기', exact: true }).click()

  await expect(page.getByText('1화 점검을 마쳤습니다.', { exact: true })).toBeVisible({
    timeout: 60_000,
  })

  // The side panel switches to 점검 and the auto run never opens the candidate dialog.
  await expect(page.getByRole('tab', { name: '점검', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: /이 회차에서 찾은 위키 후보/ })).toHaveCount(0)
  // The success toast lasts 10 seconds, so follow its button right away.
  await page
    .locator('[data-sonner-toast]')
    .getByRole('button', { name: '승인 대기 보기', exact: true })
    .click()

  // The finished check left a pending proposal from this chapter in the queue.
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/approvals`))
  const proposalSource = page
    .getByRole('main')
    .getByRole('article')
    .getByText('회차 점검', { exact: true })
  await expect(proposalSource).toBeVisible({ timeout: 30_000 })

  // Back on the chapter, the panel shows the contradiction against the wiki fact.
  await page.goto(chapterPath)
  await page.getByRole('tab', { name: '점검', exact: true }).click()
  const checkPanel = page.getByRole('region', { name: '회차 점검' })
  await expect(checkPanel.getByText(SENTENCE, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(checkPanel.getByText(FACT, { exact: true })).toBeVisible({ timeout: 30_000 })
})
