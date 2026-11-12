import { expect, test } from '@playwright/test'
import { navLink, registerNewUser } from './helpers'

test.describe('data and backups', () => {
  test('a signed-in user can create a backup and see it listed', async ({ page }) => {
    await registerNewUser(page)

    // Create a task first so the backup contains real data.
    await navLink(page, /My Tasks/).click()
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill('Backed up task')
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Backed up task' })).toBeVisible()

    // The Settings → Data section is where backups are created and restored (legacy #/data route).
    await page.goto('#/data')
    await expect(page.getByRole('button', { name: 'Create backup now' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Preview restoring/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Create backup now' }).click()
    const entry = page.getByRole('button', { name: /Preview restoring/ })
    await expect(entry).toHaveCount(1)
  })
})
