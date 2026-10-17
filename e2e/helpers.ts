import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test'

/** The e2e server (see `e2e:server` in package.json) listens here. */
export const BASE_URL = 'http://localhost:3100'

/** Shared password for every account the suite creates. */
export const PASSWORD = 'e2e-pass-1234'

/** A fresh email per call, so no two tests (or workers) share an account. */
export function uniqueEmail(label: string): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${label}-${Date.now()}-${random}@example.com`
}

/** Signs up a new account and waits for the works list. */
export async function signUp(page: Page, opts: { name: string; email: string }): Promise<void> {
  await page.goto('/signup')
  await page.getByLabel('이름', { exact: true }).fill(opts.name)
  await page.getByLabel('이메일', { exact: true }).fill(opts.email)
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '가입하기', exact: true }).click()
  await expect(page).toHaveURL(/\/works$/)
  await expect(page.getByRole('heading', { name: '내 작품', exact: true })).toBeVisible()
}

/** Logs in with an existing account and waits for the works list. */
export async function logIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('이메일', { exact: true }).fill(email)
  await page.getByLabel('비밀번호', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page).toHaveURL(/\/works$/)
  await expect(page.getByRole('heading', { name: '내 작품', exact: true })).toBeVisible()
}

/** Creates a work through the new-work form and returns its id. */
export async function createWork(page: Page, title: string): Promise<string> {
  await page.goto('/works/new')
  await page.getByLabel('제목', { exact: true }).fill(title)
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click()
  const writeLink = page.getByRole('link', { name: '바로 쓰기', exact: true })
  await expect(writeLink).toBeVisible()
  const href = await writeLink.getAttribute('href')
  const match = href?.match(/^\/works\/([^/]+)\/write$/)
  if (!match) throw new Error(`Unexpected write link: ${href}`)
  return match[1]
}

/** Opens a new browser context already pointed at the e2e server. */
export async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE_URL })
}

/** Adds a wiki card from the 설정 보드 characters tab. */
export async function createCharacter(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '새 인물', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '카드 만들기', exact: true })).toBeVisible()
  await dialog.getByLabel('이름', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible()
}
