import { expect, test } from '@playwright/test'
import { logIn, signUp, uniqueEmail } from './helpers'

test.setTimeout(120_000)

test('sign up, log out, and log in again', async ({ page }) => {
  const email = uniqueEmail('auth')

  await signUp(page, { name: '가입자', email })

  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible()

  await logIn(page, email)
  await expect(page.getByText('가입자', { exact: true })).toBeVisible()
})
