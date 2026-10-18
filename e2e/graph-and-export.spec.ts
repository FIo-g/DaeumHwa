import { expect, test } from '@playwright/test'
import { createCharacter, createWork, signUp, uniqueEmail } from './helpers'

test.setTimeout(180_000)

test('relation graph renders and the backup downloads', async ({ page }) => {
  await signUp(page, { name: '그래프', email: uniqueEmail('graph') })
  const workId = await createWork(page, '관계 작품')

  await page.goto(`/works/${workId}/wiki?tab=characters`)
  await createCharacter(page, '서윤')
  await createCharacter(page, '도현')

  await page.goto(`/works/${workId}/wiki/graph`)
  await page.getByRole('button', { name: '관계 추가', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '관계 추가', exact: true })).toBeVisible()

  await dialog.getByRole('combobox', { name: '첫 번째 카드', exact: true }).click()
  await page.getByRole('option', { name: '서윤', exact: true }).click()
  await dialog.getByRole('combobox', { name: '두 번째 카드', exact: true }).click()
  await page.getByRole('option', { name: '도현', exact: true }).click()
  await dialog.getByLabel('관계 종류', { exact: true }).fill('가족')
  await dialog.getByRole('button', { name: '관계 추가', exact: true }).click()
  await expect(dialog).toBeHidden()

  const graph = page.getByRole('img', { name: '관계 그래프', exact: true })
  await expect(graph).toBeVisible()
  await expect(graph.locator('canvas').first()).toBeVisible({ timeout: 15_000 })
  // One cytoscape instance only: a second mount would add a second node layer.
  const nodeLayer = page.locator('canvas[data-id="layer2-node"]')
  await expect(nodeLayer).toHaveCount(1)

  // Leave for the wiki with the sidebar, come back through the tab bar, and check again.
  await page
    .getByRole('navigation', { name: '작품 메뉴' })
    .getByRole('link', { name: '설정 보드', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/wiki`))
  await page
    .getByRole('navigation', { name: '설정 보드 탭' })
    .getByRole('link', { name: '관계 그래프', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/works/${workId}/wiki/graph`))
  await expect(page.getByRole('img', { name: '관계 그래프', exact: true })).toBeVisible()
  await expect(nodeLayer).toHaveCount(1)

  await page.goto(`/works/${workId}/history`)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '내보내기', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^다음화-백업-.*\.zip$/)
})
