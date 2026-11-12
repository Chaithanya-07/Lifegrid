import { expect, test } from '@playwright/test'
import { navLink, registerNewUser } from './helpers'

/** A local calendar date (YYYY-MM-DD) offset by whole days from today, with no DST or UTC drift. */
function dayIso(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

test.describe('reminders and notifications', () => {
  test.beforeEach(async ({ page }) => {
    await registerNewUser(page)
  })

  test('an overdue task raises a bell notification that can be read and dismissed', async ({ page }) => {
    await navLink(page, /My Tasks/).click()
    await page.getByRole('button', { name: 'New task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    const title = `Overdue chore ${Date.now()}`
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByLabel('Due date').fill(dayIso(-1))
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(rowFor(page, title)).toBeVisible()

    // A fresh load runs the notification sync; the daily overdue digest appears in the bell.
    await page.reload()
    const bell = page.getByRole('button', { name: 'Notifications, 1 unread' })
    await expect(bell).toBeVisible()
    await bell.click()
    const panel = page.getByRole('dialog', { name: 'Notifications panel' })
    await expect(panel.locator('.bell-title', { hasText: '1 task is overdue' })).toBeVisible()

    // Marking read clears the unread count without removing the entry.
    await panel.getByRole('button', { name: 'Mark "1 task is overdue" as read' }).click()
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Mark "1 task is overdue" as unread' })).toBeVisible()

    // Dismissing removes it; the panel is then empty.
    await panel.getByRole('button', { name: 'Dismiss "1 task is overdue"' }).click()
    await expect(panel.locator('.bell-title', { hasText: '1 task is overdue' })).toHaveCount(0)
    await expect(panel.getByText(/all caught up/i)).toBeVisible()
  })

  test('a reminder on a future task shows in the bell panel Upcoming tab', async ({ page }) => {
    await navLink(page, /My Tasks/).click()
    const title = `Remind me about ${Date.now()}`
    await page.getByRole('button', { name: 'New task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByLabel('Due date').fill(dayIso(3))
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(rowFor(page, title)).toBeVisible()

    // Re-open the task, add a relative reminder from the Reminders section and save.
    await page.getByRole('button', { name: `Edit "${title}"` }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit task' })
    await editDialog.getByRole('button', { name: 'Reminders' }).click() // collapsible section
    const reminder = editDialog.getByRole('group', { name: 'Reminders' })
    await reminder.getByRole('button', { name: '1 day before' }).click()
    await expect(reminder.getByRole('button', { name: '1 day before' })).toHaveAttribute('aria-pressed', 'true')
    await editDialog.getByRole('button', { name: 'Save' }).click()

    // The upcoming reminders list in the bell shows it within the next 7 days.
    await page.getByRole('button', { name: 'Notifications' }).click()
    const panel = page.getByRole('dialog', { name: 'Notifications panel' })
    await panel.getByRole('tab', { name: 'Upcoming' }).click()
    const upcoming = panel.locator('.bell-upcoming')
    await expect(upcoming.getByRole('heading', { name: 'Next 7 days' })).toBeVisible()
    await expect(upcoming.getByRole('button', { name: title })).toBeVisible()
  })

  /** A task row anywhere in a list view. */
  function rowFor(page: import('@playwright/test').Page, title: string) {
    return page.getByRole('listitem').filter({ hasText: title })
  }
})
