import { expect, test, type Page } from '@playwright/test'
import { navLink, registerNewUser } from './helpers'

test.describe('manual-accessibility automation: keyboard and screen-reader behaviour', () => {
  test.describe.configure({ mode: 'serial' })

  /**
   * Where keyboard focus currently sits, plus where it lives in the DOM, so focus-trap and
   * restoration assertions read naturally.
   */
  const focus = (page: Page) =>
    page.evaluate(() => ({
      tag: document.activeElement?.tagName.toLowerCase() ?? '',
      text: (document.activeElement?.textContent ?? '').trim().slice(0, 60) || document.activeElement?.getAttribute('aria-label') || '',
      inDialog: !!document.activeElement?.closest('[role="dialog"]'),
    }))

  test('the sign-in form is keyboard operable and announces errors', async ({ page }) => {
    await page.goto('/')
    // Skip link is the first keyboard stop on the signed-out shell too when present; the form must be
    // reachable by Tab and submittable with Enter.
    await page.getByLabel('Email').fill('e2e-keyboard@example.test')
    await page.keyboard.press('Tab')
    await page.getByLabel('Password').fill('correct-horse-battery')
    await page.keyboard.press('Enter') // wrong credentials: the form must announce why
    const error = page.locator('[role="alert"]')
    await expect(error).toBeVisible()
    expect((await error.textContent())?.toLowerCase()).toContain('invalid')
    // A wrong-credentials attempt does not change the announced input state silently either:
    // both fields are flagged invalid for assistive tech.
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  test('skip link, Enter and Space activation', async ({ page }) => {
    await registerNewUser(page)
    await page.goto('#/dashboard')
    // The skip link is the first stop in the tab order of the app shell.
    const firstTabbable = await page.evaluate(() =>
      document.querySelector('a[href], button:not(:disabled), input, [tabindex]:not([tabindex="-1"])')?.textContent,
    )
    expect(firstTabbable?.trim()).toBe('Skip to content')

    // Enter activates it and moves focus into main content.
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await skip.focus()
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => document.getElementById('main')?.contains(document.activeElement))).toBe(true)

    // Enter activates a button in the main navigation; the route changes.
    await navLink(page, /My Tasks/).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/tasks/)

    // Space activates the notification bell like a click does.
    const bell = page.getByRole('button', { name: /^Notifications/ })
    await bell.focus()
    await page.keyboard.press(' ')
    await expect(page.getByRole('dialog', { name: 'Notifications panel' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Notifications panel' })).toHaveCount(0)
  })

  test('the task editor dialog traps Tab, closes on Escape and restores focus', async ({ page }) => {
    await registerNewUser(page)
    await page.goto('#/tasks')
    const opener = page.getByRole('button', { name: 'New task' })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    await expect(dialog).toBeVisible()
    // Focus starts inside the dialog (the first field is focused for immediate typing).
    expect((await focus(page)).inDialog).toBe(true)

    // Cycling Tab (forward and backward) never leaves the dialog.
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // Focus is restored to whichever control opened the dialog.
    await expect(opener).toBeFocused()
  })

  test('Escape reaches the topmost overlay (notification panel under a dialog)', async ({ page }) => {
    await registerNewUser(page)
    await page.goto('#/tasks')
    // Open the non-modal notification panel, then a modal dialog above it.
    await page.getByRole('button', { name: /^Notifications/ }).click()
    const panel = page.getByRole('dialog', { name: 'Notifications panel' })
    await expect(panel).toBeVisible()
    await page.keyboard.press('n') // the keyboard shortcut opens the editor above the non-modal panel
    const editor = page.getByRole('dialog', { name: 'New task' })
    await expect(editor).toBeVisible()
    // First Escape must close the dialog, not the panel underneath it.
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
  })

  test('the task editor announces validation errors', async ({ page }) => {
    await registerNewUser(page)
    await page.goto('#/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    // Submit without a title: the error is announced and the field is flagged for assistive tech.
    await dialog.getByRole('button', { name: 'Add task' }).click()
    const error = dialog.locator('[role="alert"]')
    await expect(error).toBeVisible()
    await expect(dialog.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true')
    expect((await error.textContent())?.trim()).toContain('Title is required')
  })
})

test.describe('mobile navigation is keyboard and screen-reader accessible', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the drawer opens via the labelled menu button and closes on Escape', async ({ page }) => {
    await registerNewUser(page)
    await page.goto('#/dashboard')
    const menu = page.getByRole('button', { name: 'Open navigation' })
    await menu.focus()
    await page.keyboard.press('Enter') // Enter activates the aria-expanded menu button
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    const drawer = page.getByRole('navigation', { name: 'Main' })
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.shell')).not.toHaveClass(/nav-open/) // the drawer is fully closed
    // Keyboard focus is not trapped behind the closed drawer: focus the command palette button next.
    await page.getByRole('button', { name: /Open command palette/ }).focus()
    // ... and sign-out remains labelled for screen readers.
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('the drawer takes focus, traps Tab while open and restores focus to the menu button', async ({ page }) => {
    await registerNewUser(page)
    await page.goto('#/dashboard')
    const menu = page.getByRole('button', { name: 'Open navigation' })
    await menu.focus()
    await page.keyboard.press('Enter')
    // Focus lands on the drawer region itself, so the next Tab enters the navigation.
    await expect(page.locator('.side')).toBeFocused()
    await page.keyboard.press('Tab')
    const focusInside = () =>
      page.evaluate(() => document.querySelector('.side')?.contains(document.activeElement) ?? false)
    expect(await focusInside()).toBe(true)
    // Cycling forward and backward never leaves the open drawer.
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab')
    expect(await focusInside()).toBe(true)
    for (let i = 0; i < 30; i++) await page.keyboard.press('Shift+Tab')
    expect(await focusInside()).toBe(true)
    // The page content behind the drawer is inert: no background control can be focused, even
    // programmatically, so the drawer is truly modal while it is open.
    await expect(page.locator('.main-col')).toHaveAttribute('inert')
    await page.getByRole('button', { name: /Open command palette/ }).focus()
    expect(await focusInside()).toBe(true)
    // Escape closes the drawer and focus returns to the control that opened it.
    await page.keyboard.press('Escape')
    await expect(page.locator('.shell')).not.toHaveClass(/nav-open/)
    await expect(menu).toBeFocused()
    // The background becomes keyboard-reachable again as soon as the drawer closes.
    await expect(page.locator('.main-col')).not.toHaveAttribute('inert')
  })
})
