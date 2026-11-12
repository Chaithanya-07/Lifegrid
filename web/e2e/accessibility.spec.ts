import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerNewUser } from './helpers'

/**
 * Formal accessibility audit: axe-core (WCAG 2.1 A/AA) against the real pages, including the
 * task editor dialog and the notification panel open. Findings are written to test-results/axe/
 * as JSON for the audit document; serious/critical violations fail the suite.
 * Set AXE_REPORT_ONLY=1 to only produce reports (used while fixing issues).
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const reportOnly = process.env.AXE_REPORT_ONLY === '1'
const outDir = fileURLToPath(new URL('../test-results/axe/', import.meta.url))

async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, `${name}.json`),
    JSON.stringify({ url: results.url, violations: results.violations }, null, 2),
  )
  const blocking = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
  return { results, blocking }
}

function summary(blocking: Awaited<ReturnType<typeof scan>>['blocking']) {
  return blocking
    .map(v => `${v.impact}: ${v.id} (${v.help.replace(/["\n]/g, "'")}) on ${v.nodes.length} node(s), e.g. ${v.nodes[0].target.join(' ')}`)
    .join(' | ')
}

// Navigates to a hash route and waits for the signed-in shell to render before scanning.
async function openRoutable(page: Page, route: string) {
  await page.goto(route)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

test.describe('accessibility audit (axe-core, wcag2a + wcag2aa + wcag21a + wcag21aa)', () => {
  test('sign-in page', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await audit(page, 'signin')
  })

  test('dashboard', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/dashboard')
    await expect(page.getByRole('region', { name: 'Lifegrid rewards' })).toBeVisible()
    await audit(page, 'dashboard')
  })

  test('my tasks', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/tasks')
    await expect(page.getByRole('button', { name: 'New task' })).toBeVisible()
    await audit(page, 'my-tasks')
  })

  test('my tasks with the task editor dialog open', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    await expect(dialog.getByLabel('Title')).toBeVisible()
    await audit(page, 'task-editor')
  })

  test('my tasks with the notification panel open', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/tasks')
    await page.getByRole('button', { name: /Notifications/ }).click()
    await audit(page, 'notification-panel')
  })

  test('completed', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/completed')
    await audit(page, 'completed')
  })

  test('calendar', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/calendar')
    await audit(page, 'calendar')
  })

  test('kanban', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/kanban')
    await audit(page, 'kanban')
  })

  test('categories', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/categories')
    await audit(page, 'categories')
  })

  test('analytics', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/analytics')
    await audit(page, 'analytics')
  })

  test('focus', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/focus')
    await audit(page, 'focus')
  })

  test('achievements', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/achievements')
    await audit(page, 'achievements')
  })

  test('settings', async ({ page }) => {
    await registerNewUser(page)
    await openRoutable(page, '#/settings')
    await audit(page, 'settings')
  })

  /** Shared scan/assert/report step, so each audited state reads like one line. */
  async function audit(page: Page, name: string) {
    const { blocking } = await scan(page, name)
    if (reportOnly) return
    expect(blocking, summary(blocking)).toHaveLength(0)
  }
})
