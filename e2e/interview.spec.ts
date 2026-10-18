import { expect, test } from '@playwright/test'
import { createWork, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

const ANSWER = '서윤은 시계탑 수리공이다.'

test('interview asks a new question, approves an answer candidate, and ends', async ({ page }) => {
  await signUp(page, { name: '인터뷰', email: uniqueEmail('interview') })
  const workId = await createWork(page, '인터뷰 작품')

  await page.goto(`/works/${workId}/interview`)
  await page.getByRole('button', { name: '인터뷰 시작', exact: true }).click()

  const question = page.locator('#interview-question')
  await expect(question).toBeVisible({ timeout: 30_000 })
  const firstQuestion = (await question.textContent())?.trim() ?? ''
  expect(firstQuestion).not.toBe('')

  await page.getByRole('textbox', { name: '답변', exact: true }).fill(ANSWER)
  await page.getByRole('button', { name: '답하기', exact: true }).click()

  // The answer's candidates appear under the question, each with its own approve button.
  const proposals = page.getByRole('region', { name: '이 답에서 나온 제안' })
  await expect(proposals).toBeVisible({ timeout: 30_000 })
  const approveButtons = proposals.getByRole('button', { name: '승인', exact: true })
  const pendingBefore = await approveButtons.count()
  expect(pendingBefore).toBeGreaterThan(0)
  await approveButtons.first().click()
  await expect(approveButtons).toHaveCount(pendingBefore - 1)

  await page.getByRole('button', { name: '다음 질문', exact: true }).click()
  await expect(question).toBeVisible({ timeout: 30_000 })
  const secondQuestion = (await question.textContent())?.trim() ?? ''
  expect(secondQuestion).not.toBe('')
  expect(secondQuestion).not.toBe(firstQuestion)

  await page.getByRole('button', { name: '인터뷰 끝내기', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '끝내기', exact: true }).click()
  await expect(page.getByRole('link', { name: '승인 대기 보기', exact: true })).toBeVisible()
})
