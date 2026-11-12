import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { registerNewUser, TEST_PASSWORD, uniqueEmail } from './helpers'

test.describe('export, import and backups (always against the isolated throwaway instance)', () => {
  const backupData = async (page: import('@playwright/test').Page) => {
    await page.goto('#/settings/backup')
    await expect(page.getByRole('heading', { name: 'Backup & data' })).toBeVisible()
  }

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page)
  })

  test('export downloads a readable JSON document of the account data', async ({ page }) => {
    await backupData(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Download everything (JSON)').click()])
    const file = path.join(os.tmpdir(), `e2e-export-${Date.now()}.json`)
    await download.suggestedFilename() // .json
    await download.saveAs(file)
    const text = fs.readFileSync(file, 'utf-8')
    const parsed: unknown = JSON.parse(text)
    expect(parsed).toHaveProperty('tasks')
    expect(Array.isArray((parsed as { tasks: unknown[] }).tasks)).toBe(true)
    fs.rmSync(file, { force: true })
  })

  test('import previews before importing; a duplicate import adds nothing', async ({ page }) => {
    // One existing task so the export contains data.
    await page.goto('#/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    const title = `Import source ${Date.now()}`
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill(title)
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()

    // Export, then feed the same JSON back through the import.
    await backupData(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Download everything (JSON)').click()])
    const file = path.join(os.tmpdir(), `e2e-import-${Date.now()}.json`)
    await download.saveAs(file)

    // Not valid JSON: the preview refuses it and nothing changes.
    const broken = path.join(os.tmpdir(), `e2e-broken-${Date.now()}.json`)
    fs.writeFileSync(broken, '{ "not": "valid json",')
    await page.getByLabel('Choose a Lifegrid JSON file to import').setInputFiles(broken)
    await expect(page.getByText('This file can’t be imported. Nothing was changed.')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    // Valid JSON: a second account receives the export — the preview states what will be added,
    // and confirming really imports the task there.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    const otherEmail = uniqueEmail('import-target')
    await page.getByRole('button', { name: 'Create an account' }).click()
    await page.getByLabel('Email').fill(otherEmail)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await backupData(page)
    await page.getByLabel('Choose a Lifegrid JSON file to import').setInputFiles(file)
    const preview = page.locator('.card.preview')
    await expect(preview.getByRole('heading', { name: /Import preview/ })).toBeVisible()
    await expect(preview.getByText(/Will be added/)).toBeVisible()
    await preview.getByRole('button', { name: /^Import 1 task$/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Imported 1 task(s)' })).toBeVisible()

    // The imported task is really there, signed in as the new account.
    await page.goto('#/tasks')
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()

    // Importing the very same file again: everything is a duplicate, so nothing is added.
    await backupData(page)
    await page.getByLabel('Choose a Lifegrid JSON file to import').setInputFiles(file)
    const again = page.locator('.card.preview')
    await expect(again.getByText('Nothing new to import')).toBeVisible()
    await again.getByRole('button', { name: 'Cancel' }).click()
    fs.rmSync(file, { force: true })
    fs.rmSync(broken, { force: true })
  })

  test('backup creation, preview restore and full rollback work with isolated data', async ({ page }) => {
    // Seed one task, snapshot it, then add a second task that must disappear on rollback.
    const titleA = `Keep me ${Date.now()}`
    await page.goto('#/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill(titleA)
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: titleA })).toBeVisible()

    await backupData(page)
    await page.getByRole('button', { name: 'Create backup now' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Backup saved as' })).toBeVisible()
    const backupName = (await page.getByRole('status').filter({ hasText: 'Backup saved as' }).textContent())
      ?.replace(/^Backup saved as (\S+).*$/, '$1')
    expect(backupName).toBeTruthy()

    const titleB = `Ephemeral ${Date.now()}`
    await page.goto('#/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill(titleB)
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: titleB })).toBeVisible()

    // Preview restore of the snapshot: it only reports, so with identical data there is nothing new.
    await backupData(page)
    await page.getByRole('button', { name: `Preview restoring ${backupName}` }).click()
    const preview = page.locator('.card.preview')
    await expect(preview.getByRole('heading', { name: /Import preview — backup/ })).toBeVisible()
    await expect(preview.getByText('Nothing new to import')).toBeVisible()
    await preview.getByRole('button', { name: 'Cancel' }).click()

    // Full restore rolls the account back to the snapshot: task B disappears, task A survives.
    await page.getByRole('button', { name: `Restore ${backupName}` }).click()
    const confirm = page.getByRole('dialog', { name: 'Replace all data with this backup?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Replace all data' }).click()
    await expect(page.getByRole('status').filter({ hasText: /Restored .* Safety backup/ })).toBeVisible()

    await page.goto('#/tasks')
    await expect(page.getByRole('listitem').filter({ hasText: titleA })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: titleB })).toHaveCount(0)
  })

  test('another user cannot see or restore this account’s backups', async ({ page, browser }) => {
    const titleA = `Private task ${Date.now()}`
    await page.goto('#/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill(titleA)
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: titleA })).toBeVisible()
    await backupData(page)
    await page.getByRole('button', { name: 'Create backup now' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Backup saved as' })).toBeVisible()

    // A second browser context with a fresh account sees no backups at all.
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/')
    await otherPage.getByRole('button', { name: 'Create an account' }).click()
    await otherPage.getByLabel('Email').fill(uniqueEmail('other-account'))
    await otherPage.getByLabel('Password').fill(TEST_PASSWORD)
    await otherPage.getByRole('button', { name: 'Create account' }).click()
    await expect(otherPage.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await otherPage.goto('#/settings/backup')
    await expect(otherPage.getByText('No backups yet.')).toBeVisible()
    await other.close()
  })
})
