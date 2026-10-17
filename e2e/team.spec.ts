import { expect, test } from '@playwright/test'
import { createWork, newContext, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

test('an invited editor joins the work through the invite link', async ({ page, browser }) => {
  const workTitle = '팀 작품'
  await signUp(page, { name: '소유자', email: uniqueEmail('owner') })
  const workId = await createWork(page, workTitle)

  await page.goto(`/works/${workId}/settings`)
  await page.getByRole('tab', { name: '팀', exact: true }).click()
  await page.getByRole('button', { name: '초대 링크 만들기', exact: true }).click()

  const linkText = page.getByText(/\/invite\/[A-Za-z0-9_-]+/)
  await expect(linkText).toBeVisible()
  const inviteUrl = (await linkText.innerText()).trim()
  const invitePath = new URL(inviteUrl).pathname

  const guestContext = await newContext(browser)
  try {
    const guest = await guestContext.newPage()
    await signUp(guest, { name: '초대받은 사람', email: uniqueEmail('guest') })

    await guest.goto(invitePath)
    await expect(guest.getByRole('button', { name: '참여하기', exact: true })).toBeVisible()
    await guest.getByRole('button', { name: '참여하기', exact: true }).click()

    await expect(guest).toHaveURL(new RegExp(`/works/${workId}$`))
    await expect(guest.getByRole('heading', { name: workTitle, exact: true })).toBeVisible()
  } finally {
    await guestContext.close()
  }
})
