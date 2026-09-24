// The UI's language: it follows the system's, Preferences switch it live
// (and it stays switched), the palette finds a command by its English title
// in any language, and the pseudo-language shows what is left untranslated.
// (i18n-sweep.spec.ts walks every screen in each language.)

import { expect, test } from '@playwright/test';

const lang = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.lang);

test('Preferences switch the language live, and it stays', async ({ page }) => {
  await page.goto('/?e2e');
  await expect(page.getByTestId('open-folder')).toBeVisible();
  expect(await lang(page)).toBe('en');

  await page.keyboard.press('Control+,');
  const prefs = page.getByTestId('prefs');
  await expect(prefs.getByText('Language', { exact: true })).toBeVisible();
  await expect(prefs.getByTestId('prefs-language')).toHaveValue('auto');
  await expect(prefs.locator('option[value=auto]')).toHaveText('As the system (English)');

  await prefs.getByTestId('prefs-language').selectOption('ja');
  await expect(prefs.getByText('言語', { exact: true })).toBeVisible();
  await expect(prefs).toHaveAttribute('aria-label', '環境設定');
  expect(await lang(page)).toBe('ja');
  // The translation is a draft, and says so.
  await expect(prefs.getByText(/AI による下訳/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(prefs).toHaveCount(0);

  // The palette shows the Japanese title and still finds it in English.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('About EZ2BMS');
  const palette = page.getByTestId('palette');
  await expect(palette.locator('li').first()).toContainText('EZ2BMS について');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('about')).toBeVisible();
  await page.keyboard.press('Escape');

  // Saved with the settings: a new start is in Japanese.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId('open-folder')).toBeVisible();
  expect(await lang(page)).toBe('ja');

  await page.keyboard.press('Control+,');
  await page.getByTestId('prefs-language').selectOption('en');
  await expect(prefs.getByText('Language', { exact: true })).toBeVisible();
  expect(await lang(page)).toBe('en');
});

test('the pseudo-language marks every translated message', async ({ page }) => {
  await page.goto('/?e2e&pseudo');
  await expect(page.getByTestId('open-folder')).toContainText('⟦Øpén søng føldér⟧');
  await expect(page.locator('.tag')).toHaveText('⟦chårt süïté før ÉZ2PØRT⟧');
});

test.describe('on a Korean system', () => {
  test.use({ locale: 'ko-KR' });

  test('the language follows the system', async ({ page }) => {
    await page.goto('/?e2e');
    await expect(page.getByTestId('open-folder')).toBeVisible();
    expect(await lang(page)).toBe('ko');
    await page.keyboard.press('Control+,');
    const prefs = page.getByTestId('prefs');
    await expect(prefs.getByText('언어', { exact: true })).toBeVisible();
    await expect(prefs.locator('option[value=auto]')).toHaveText('시스템 설정 따름 (한국어)');
  });
});
