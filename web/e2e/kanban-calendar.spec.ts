import { expect, test } from '@playwright/test'
import { registerNewUser } from './helpers'

const columnCards = (page: import('@playwright/test').Page, column: string) =>
  page.getByRole('list', { name: `${column} cards` })

const card = (page: import('@playwright/test').Page, column: string, title: string) =>
  columnCards(page, column).filter({ hasText: title })

test.describe('kanban board', () => {
  test.beforeEach(async ({ page }) => {
    await registerNewUser(page)
  })

  test('a task added in a column appears there and the Move buttons move it between columns', async ({ page }) => {
    await page.goto('#/kanban')
    const board = page.getByRole('region', { name: 'Kanban board' })

    // Type straight into the To Do column; the inline add form needs no dialog.
    const title = `Board card ${Date.now()}`
    await board.getByLabel('Add task to To Do').fill(title)
    await board.getByRole('button', { name: 'Add to To Do' }).click()
    await expect(card(page, 'To Do', title)).toBeVisible()
    await expect(board.getByLabel('To Do column').getByLabel('1 tasks')).toBeVisible()

    // The drag alternative is also keyboard-reachable: dedicated move buttons on the card.
    await board.getByRole('button', { name: `Move "${title}" to Done` }).click()
    await expect(card(page, 'Done', title)).toBeVisible()
    await expect(card(page, 'To Do', title)).toHaveCount(0)
    await expect(board.getByLabel('Done column').getByLabel('1 tasks')).toBeVisible()

    // Round-trip it back to To Do through In Progress.
    await board.getByRole('button', { name: `Move "${title}" to In Progress` }).click()
    await expect(card(page, 'In Progress', title)).toBeVisible()
    await expect(card(page, 'Done', title)).toHaveCount(0)
    await board.getByRole('button', { name: `Move "${title}" to To Do` }).click()
    await expect(card(page, 'To Do', title)).toBeVisible()
  })

  test('the board search filters cards without losing their column', async ({ page }) => {
    await page.goto('#/kanban')
    const board = page.getByRole('region', { name: 'Kanban board' })
    const kept = `Kanban search alpha ${Date.now()}`
    const gone = `Kanban search omega ${Date.now()}`
    for (const title of [kept, gone]) {
      await board.getByLabel('Add task to To Do').fill(title)
      await board.getByRole('button', { name: 'Add to To Do' }).click()
      await expect(card(page, 'To Do', title)).toBeVisible()
    }

    await board.getByLabel('Search board').fill('alpha')
    await expect(card(page, 'To Do', kept)).toBeVisible()
    await expect(columnCards(page, 'To Do').getByRole('listitem')).toHaveCount(1)
    await board.getByRole('button', { name: 'Clear filters' }).click()
    await expect(columnCards(page, 'To Do').getByRole('listitem')).toHaveCount(2)
  })
})

test.describe('calendar', () => {
  test.beforeEach(async ({ page }) => {
    await registerNewUser(page)
  })

  /** Local calendar date (YYYY-MM-DD) offset by whole days, with no DST or UTC drift. */
  const iso = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }

  test('a task added on a day chip shows on that day in month and week views', async ({ page }) => {
    await page.goto('#/calendar')
    const day = iso(5)

    /** Navigate the current view forward until `day` is on screen (it can fall past a month or week border). */
    const showDay = async (unitName: 'month' | 'week') => {
      for (let i = 0; i < 3 && (await page.locator(`.cal-cell[data-date="${day}"]`).count()) === 0; i++) {
        await page.getByRole('button', { name: `Next ${unitName}` }).click()
      }
      await expect(page.locator(`.cal-cell[data-date="${day}"]`)).toHaveCount(1)
    }

    await page.getByRole('button', { name: `Add task on ${day}` }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    await expect(dialog.getByLabel('Due date')).toHaveValue(day) // opened pre-filled from the day
    const title = `Calendar entry ${Date.now()}`
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByRole('button', { name: 'Add task' }).click()

    // The month grid shows a chip on the day, and selecting the day lists it below the grid.
    await showDay('month')
    const cell = page.locator(`.cal-cell[data-date="${day}"]`)
    await expect(cell.getByRole('button', { name: title })).toBeVisible()
    await cell.locator('button.cal-daynum').click()
    await expect(page.getByRole('region', { name: `Tasks on ${day}` })).toContainText(title)

    // Week view shows the same task under its day column; the week containing the day may need navigation.
    await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Week' }).click()
    await showDay('week')
    await expect(page.locator(`.cal-cell[data-date="${day}"]`).getByRole('button', { name: title })).toBeVisible()
  })

  test('month navigation moves the grid and the title follows', async ({ page }) => {
    await page.goto('#/calendar')
    const titleBefore = await page.getByTestId('cal-title').textContent()
    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.getByTestId('cal-title')).not.toHaveText(titleBefore ?? '')
    await expect(page.getByRole('group', { name: /Month of/ })).toBeVisible()
    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(page.getByTestId('cal-title')).toHaveText(titleBefore ?? '')
  })
})
