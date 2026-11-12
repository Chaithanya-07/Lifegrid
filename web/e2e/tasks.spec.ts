import { expect, test, type Page } from '@playwright/test'
import { navLink, registerNewUser } from './helpers'

/** Creates a task through the editor on My Tasks and waits for it to round-trip through the API. */
async function createTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'New task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Add task' }).click()
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()
  return row
}

test.describe('tasks and rewards', () => {
  // Every test runs on its own brand-new account, so all journeys start from a clean slate.
  test.beforeEach(async ({ page }) => {
    await registerNewUser(page)
  })

  test('dashboard loads with its widgets and rewards widget for a new user', async ({ page }) => {
    await page.goto('#/dashboard')
    await expect(page.getByRole('region', { name: /Today/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Lifegrid rewards' })).toBeVisible()
    await expect(page.getByRole('region', { name: /Recent activity/ })).toBeVisible()
  })

  test('creates a task', async ({ page }) => {
    await navLink(page, /My Tasks/).click()
    const title = `Write the quarterly report ${Date.now()}`
    await createTask(page, title)
    // The toast confirms the server accepted it; the list shows it persisted.
    await expect(page.getByText('Task added.')).toBeVisible()
  })

  test('edits a task', async ({ page }) => {
    await navLink(page, /My Tasks/).click()
    const title = `Draft to rename ${Date.now()}`
    await createTask(page, title)

    await page.getByRole('button', { name: `Edit "${title}"` }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit task' })
    const titleInput = dialog.getByLabel('Title')
    // A completely different string, so the renamed row can never still match the old title.
    const renamed = `Quarterly summary ${Date.now()}`
    await titleInput.fill(renamed)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: renamed })).toBeVisible()
    await expect(page.getByText('Task saved.')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
  })

  test('completing a task awards XP exactly once and shows it on the dashboard', async ({ page }) => {
    await navLink(page, /My Tasks/).click()
    const title = `Ship the release ${Date.now()}`
    await createTask(page, title)

    // Completion flips the checkbox and its label. Default priority is Medium = 10 XP.
    const box = page.getByRole('checkbox', { name: `Mark "${title}" as done` })
    await box.click()
    await expect(page.getByRole('checkbox', { name: `Mark "${title}" as not done` })).toBeChecked()

    // The rewards widget reflects the server-authoritative ledger.
    await navLink(page, /Dashboard/).click()
    const rewards = page.getByRole('region', { name: 'Lifegrid rewards' })
    await expect(rewards.getByText('10 / 100 XP')).toBeVisible()
    await expect(rewards.getByText('+10 XP')).toBeVisible()

    // Completing again (toggle down and up) never pays twice: the ledger stays at 10.
    await navLink(page, /My Tasks/).click()
    await page.getByRole('checkbox', { name: `Mark "${title}" as not done` }).click()
    await page.getByRole('checkbox', { name: `Mark "${title}" as done` }).click()
    await navLink(page, /Dashboard/).click()
    await expect(page.getByRole('region', { name: 'Lifegrid rewards' }).getByText('10 / 100 XP')).toBeVisible()
  })

  test('a completed task can be revisited in Completed and reopened', async ({ page }) => {
    await navLink(page, /My Tasks/).click()
    const title = `Archive me ${Date.now()}`
    await createTask(page, title)
    await page.getByRole('checkbox', { name: `Mark "${title}" as done` }).click()
    await expect(page.getByRole('checkbox', { name: `Mark "${title}" as not done` })).toBeChecked()

    // The Completed list shows it.
    await navLink(page, /Completed/).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()

    // Reopening removes it from Completed and restores it as open work on My Tasks.
    await page.getByRole('checkbox', { name: `Mark "${title}" as not done` }).click()
    await navLink(page, /My Tasks/).click()
    await expect(page.getByRole('checkbox', { name: `Mark "${title}" as done` })).not.toBeChecked()
    await navLink(page, /Completed/).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
  })
})
