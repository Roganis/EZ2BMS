// The Issues tab: findings grouped by rule, filtered by severity, fixed in
// place - one undo step in the chart - or everywhere at once, with one
// "Undo in all charts"; and Test in EZ2PORT refusing a chart with errors.
// Every fix itself is chart-core's (lint/fixes.ts, fixes.test.ts).

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

const issues = (page: Page) => page.getByTestId('issues');

test('a fix clears its finding in one undo step', async ({ page }) => {
  await open(page);
  // Two notes off the EZ2 grid, straight into the chart as an import would leave them.
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const d = a.doc;
    const ch = d.data.channels[0].id;
    d.transact('import', (tx: any) =>
      tx.insertNotes([
        { id: d.newNoteId(), ch, x: 12, y: 7, l: 0, c: false },
        { id: d.newNoteId(), ch, x: 13, y: 2403, l: 0, c: false },
      ]),
    );
  });
  await expect(page.getByTestId('lint')).toHaveText(/2 warnings/);
  await page.getByTestId('lint').click();
  await expect(issues(page).locator('[data-rule=off-grid]')).toContainText('2 notes');
  await issues(page).getByTestId('fix-off-grid').click();
  await expect(issues(page).locator('[data-rule=off-grid]')).toHaveCount(0);
  await expect(page.getByTestId('lint')).toHaveText(/^\s*1 warning\s*$/);
  const ys = () =>
    page.evaluate(() =>
      (window as unknown as W).__ez2bms.doc.data.notes
        .filter((n: any) => n.y === 5 || n.y === 7 || n.y === 2403 || n.y === 2405)
        .map((n: any) => n.y)
        .sort(),
    );
  expect(await ys()).toEqual([2405, 5]);
  await page.keyboard.press('Control+z');
  await expect(issues(page).locator('[data-rule=off-grid]')).toBeVisible();
  expect(await ys()).toEqual([2403, 7]);
});

test('Fix all fixes a rule in every chart, undone in all at once', async ({ page }) => {
  await open(page);
  // A ';' in the title of both charts: song.ini would read it as a comment.
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.song.setMeta({ title: 'Neon;Parade' }),
  );
  await page.getByTestId('lint').click();
  const group = issues(page).locator('[data-rule=title-semicolon]');
  await expect(group).toContainText('2');
  await group.getByTestId('fix-all-title-semicolon').click();
  await expect(group).toHaveCount(0);
  const titles = () =>
    page.evaluate(() =>
      (window as unknown as W).__ez2bms.project.charts.map((c: any) => c.doc.data.info.title),
    );
  expect(await titles()).toEqual(['Neon,Parade', 'Neon,Parade']);
  // The newest toast is the fix's (the title change made one too).
  await page.getByRole('button', { name: 'Undo in all charts' }).last().click();
  expect(await titles()).toEqual(['Neon;Parade', 'Neon;Parade']);
});

test('errors are filtered, song fixes go to the song file, and F5 refuses a chart with errors', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    a.doc.transact('level', (tx: any) => tx.setInfo({ level: 25 }));
    a.project.sidecar.key = '';
  });
  await expect(page.getByTestId('lint')).toHaveText(/2 errors/);
  await page.keyboard.press('F5');
  await expect(page.getByText(/problem in 5K STANDARD NM to fix first/)).toBeVisible();
  await expect(issues(page)).toBeVisible();
  await issues(page).getByTestId('issues-errors').click();
  await expect(issues(page).locator('section')).toHaveCount(2);
  await issues(page).getByTestId('fix-song-key').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bms.project.sidecar.key))
    .toBe('neonparade');
  await issues(page).getByTestId('fix-level').click();
  await expect(page.getByTestId('lint')).not.toHaveText(/error/);
  expect(await page.evaluate(() => (window as unknown as W).__ez2bms.doc.data.info.level)).toBe(20);
});

test('a bmson 0.21 file opens as 1.0, and Issues says what was converted', async ({ page }) => {
  await open(page);
  // As BmsONE 0.2 wrote it: camelCase names, 7-key lanes, no version.
  const old = {
    info: { title: 'Old', artist: 'A', genre: 'G', initBPM: 140, judgeRank: 3, level: 4 },
    bpmNotes: [],
    stopNotes: [],
    soundChannel: [
      {
        name: 'kick.wav',
        notes: [
          { x: 1, y: 0, l: 0, c: false },
          { x: 8, y: 240, l: 0, c: false },
        ],
      },
    ],
  };
  const lanes = await page.evaluate(async (text) => {
    const a = (window as unknown as W).__ez2bms;
    await a.backend.writeText('/demo/Old Song/old.bmson', text, false);
    await a.openProject('/demo/Old Song');
    return a.doc.data.notes.map((n: { x: number }) => n.x);
  }, JSON.stringify(old));
  // Key 1 and the turntable of 7StreetMix.
  expect(lanes).toEqual([11, 1]);
  await page.getByTestId('lint').click();
  await expect(issues(page).locator('[data-rule="bmson-0.21"]')).toContainText('saving writes 1.0');
  await expect(issues(page).locator('[data-rule="legacy-lanes"]')).toContainText('2 notes moved');
});
