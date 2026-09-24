// When something goes wrong: an error nothing caught is logged and said
// once; the start after a run that died offers the log; About shows the
// version, this run's errors, and copies a report with the log's end.

import { expect, test, type Page } from '@playwright/test';

interface W {
  __ez2bms: { diag: { report(): Promise<string> } };
}

async function palette(page: Page, text: string) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('an uncaught error is logged, said once, and in the report', async ({ page }) => {
  await page.goto('/?e2e');
  await expect(page.getByTestId('open-folder')).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('boom from a test');
    });
    // A storm right after is logged but not toasted again.
    setTimeout(() => void Promise.reject(new Error('second boom')), 10);
  });
  await expect(page.getByText(/Something went wrong: boom from a test/)).toBeVisible();
  await page.waitForTimeout(200);
  await expect(page.getByText(/Something went wrong/)).toHaveCount(1);

  await palette(page, 'About EZ2BMS');
  const about = page.getByTestId('about');
  await expect(about.getByTestId('about-version')).toContainText('0.1.0');
  await expect(about.getByTestId('about-errors')).toContainText('2 errors this run');
  await expect(about.getByTestId('about-errors')).toContainText('second boom');
  await expect(about.getByTestId('about-crashed')).toHaveCount(0);

  const report = await page.evaluate(() => (window as unknown as W).__ez2bms.diag.report());
  expect(report).toMatch(/^EZ2BMS 0\.1\.0 \(web\)/);
  expect(report).toContain('The run before closed normally.');
  expect(report).toContain('script: boom from a test');
  expect(report).toContain('--- log ---');
  // The log has the stack, as the desktop app's log file would.
  expect(report).toMatch(/\[ERROR\] script: Error: boom from a test\n\s+at /);
  expect(report).toMatch(/\[ERROR\] promise: Error: second boom/);

  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();
});

test('the start after a run that died without closing offers the log', async ({ page }) => {
  await page.goto('/?e2e&crashed');
  const notice = page.getByText('EZ2BMS closed unexpectedly last time. The log may say why.');
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('about-crashed')).toContainText('closed without shutting down');
  const report = await page.evaluate(() => (window as unknown as W).__ez2bms.diag.report());
  expect(report).toMatch(/The run before \(0\.1\.0, started .*\) did not close\./);
});
