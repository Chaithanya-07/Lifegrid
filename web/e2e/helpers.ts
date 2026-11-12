import { expect, type Page } from '@playwright/test'

export const TEST_PASSWORD = 'e2e-password-1'

/**
 * A link in the main sidebar. Always scope these: dashboard shortcuts duplicate
 * the same targets under different names (e.g. "Open My Tasks").
 */
export function navLink(page: Page, name: string | RegExp) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })
}

/** A fresh, isolated account per use — tests never share data and never touch real credentials. */
export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
}

/** Registers a brand-new account through the UI and leaves the app signed in. */
export async function registerNewUser(page: Page, subject = 'e2e'): Promise<{ email: string }> {
  const email = uniqueEmail(subject)
  await page.goto('/')
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  // Signed-in shell: the main sidebar navigation has appeared.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  return { email }
}

/** Signs out and back in; used by journeys that check persistence across sessions. */
export async function signOutAndBackIn(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}
