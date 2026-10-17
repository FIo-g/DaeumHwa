import path from 'node:path'
import { expect, test } from '@playwright/test'
import { createWork, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

test('import a 3-chapter manuscript and review the proposals', async ({ page }) => {
  await signUp(page, { name: '가져오기', email: uniqueEmail('import') })
  const workId = await createWork(page, '가져오기 작품')
  await page.getByRole('link', { name: '기존 원고 가져오기', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/import`))

  await page
    .locator('#manuscript-file')
    .setInputFiles(path.join(__dirname, 'fixtures', 'sample-3ch.txt'))

  const preview = page.getByRole('region', { name: '회차 나누기 미리보기' })
  await expect(preview).toBeVisible()
  await expect(preview.getByLabel(/번째 회차 제목$/)).toHaveCount(3)
  await expect(preview.getByLabel('1번째 회차 제목')).toHaveValue('1화')
  await expect(preview.getByLabel('3번째 회차 제목')).toHaveValue('3화')

  await preview.getByRole('button', { name: '이대로 가져오기', exact: true }).click()

  await expect(page.getByText('3/3화 처리', { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('완료', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '승인 대기에서 확인하기', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/approvals`))
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 30_000 })
})
