// A newer EZ2BMS (the browser build pretends one with ?update=): found when
// asked or by the daily look, its notes shown, installed and restarted only
// when you say so - never over unsaved work - and a skipped version not
// offered again by itself.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function palette(page: Page, text: string) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const report = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__ez2bms.diag.report() as Promise<string>);

test('asked: the notes, then install and restart', async ({ page }) => {
  await page.goto('/?e2e&update=0.2.0');
  await expect(page.getByTestId('open-folder')).toBeVisible();
  await palette(page, 'Check for updates');
  const d = page.getByTestId('update');
  await expect(d).toContainText('EZ2BMS 0.2.0');
  await expect(d).toContainText('You have 0.1.0.');
  await expect(d.getByTestId('update-notes')).toContainText('Something fixed.');
  await d.getByTestId('update-install').click();
  await expect(d.getByTestId('update-progress')).toBeVisible();
  await expect.poll(() => report(page)).toMatch(/installed 0\.2\.0\n.*restart/s);
});

test('up to date: said when asked', async ({ page }) => {
  await page.goto('/?e2e');
  await expect(page.getByTestId('open-folder')).toBeVisible();
  await palette(page, 'Check for updates');
  await expect(page.getByText('EZ2BMS is up to date')).toBeVisible();
});

test('the daily look offers it once; skipped, it is not offered again', async ({ page }) => {
  await page.goto('/?e2e&update=0.2.0');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  // Unsaved work (installing will wait for a save).
  await palette(page, 'bpm 180');
  // What the start does once its delay is over.
  await page.evaluate(() => (window as unknown as W).__ez2bms.updates.check(false));
  await expect(page.getByText('EZ2BMS 0.2.0 is out (you have 0.1.0).')).toBeVisible();
  await page.getByRole('button', { name: "What's new" }).click();
  await page.getByTestId('update-install').click();
  await expect(
    page.getByText('Save your charts first: installing restarts EZ2BMS').first(),
  ).toBeVisible();
  expect(await report(page)).not.toContain('installed 0.2.0');
  await page.getByTestId('update-skip').click();
  await expect(page.getByTestId('update')).toBeHidden();
  expect(
    await page.evaluate(() => (window as unknown as W).__ez2bms.settings.data.updates.skip),
  ).toBe('0.2.0');
  // The next daily look finds it again, and says nothing (the first
  // notice went when its button was used).
  await page.evaluate(() => (window as unknown as W).__ez2bms.updates.check(false));
  await page.waitForTimeout(300);
  await expect(page.getByText('EZ2BMS 0.2.0 is out (you have 0.1.0).')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).__ez2bms.updates.stage)).toBe(
    'available',
  );
});
