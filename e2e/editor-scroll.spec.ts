import { expect, test } from '@playwright/test'
import { createWork, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

// Regression: growing the textarea used to snap the page to the top while typing at the end of a
// long chapter. See fit() in src/components/writing/manuscript-editor.tsx.
test('typing at the end of a long chapter keeps the page scroll position', async ({ page }) => {
  await signUp(page, { name: '스크롤', email: uniqueEmail('scroll') })
  const workId = await createWork(page, '스크롤 작품')

  // 바로 쓰기 opens the newest draft, creating chapter 1 when there is none.
  await page.goto(`/works/${workId}/write`)
  await page.waitForURL(/\/works\/[^/]+\/chapters\/[^/]+$/)

  const editor = page.getByRole('textbox', { name: '원고 본문' })
  const lines = Array.from({ length: 250 }, (_, i) => `${i + 1}번째 줄의 원고 문장입니다.`)
  await editor.fill(lines.join('\n'))
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Click just inside the bottom-right corner of the grown textarea, which is past the last line.
  // That puts the caret at the end of the body. Ctrl+End does not move the caret in a textarea on macOS.
  const box = await editor.boundingBox()
  if (!box) throw new Error('원고 본문 textarea has no box')
  await editor.click({ position: { x: Math.round(box.width) - 40, y: Math.round(box.height) - 10 } })
  const caret = await editor.evaluate((el: HTMLTextAreaElement) => el.selectionStart)
  expect(caret).toBe(lines.join('\n').length)

  // Scroll the page to its bottom, then type at the end of the body.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(1000)

  await page.keyboard.type('가나')
  await expect(editor).toHaveValue(/가나$/)

  const after = await page.evaluate(() => window.scrollY)
  expect(after).toBeGreaterThan(1000)
  expect(Math.abs(after - before)).toBeLessThan(150)
})
