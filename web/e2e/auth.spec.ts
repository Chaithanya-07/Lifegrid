import { expect, test } from '@playwright/test'
import { navLink, registerNewUser, signOutAndBackIn, TEST_PASSWORD, uniqueEmail } from './helpers'

test.describe('authentication', () => {
  test('a new user can register and lands in the signed-in app', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    // Switch mode, fill the form, submit.
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    const email = uniqueEmail()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(navLink(page, /My Tasks/)).toBeVisible()
  })

  test('an existing user can sign out and sign back in', async ({ page }) => {
    const { email } = await registerNewUser(page)

    // Create a task so the second session has something to show, proving session persistence.
    await navLink(page, /My Tasks/).click()
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill('Survives a new session')
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Survives a new session' })).toBeVisible()

    await signOutAndBackIn(page, email)
    await navLink(page, /My Tasks/).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Survives a new session' })).toBeVisible()
  })

  test('an ended session returns the user to sign-in, not their data', async ({ page }) => {
    const { email } = await registerNewUser(page)
    await navLink(page, /My Tasks/).click()
    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill('Private while signed in')
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Private while signed in' })).toBeVisible()

    // The session cookie normally expires after 14 days; clearing it simulates that on the client.
    await page.context().clearCookies()
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await expect(page.getByText('Private while signed in')).toHaveCount(0)

    // The account still exists; signing in again restores the same data.
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  })
})
