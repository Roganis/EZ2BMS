// Classic mode on the real playfield: placing keys what is sounding, and the
// song must sound exactly the same afterwards (chart-core's fingerprint,
// read through the ?e2e hook, is compared before and after every edit).

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any; __ez2bmsField: any };

const M10 = 10 * 4 * 240;

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('goto 10');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.getByTestId('classic-toggle').click();
  await expect(page.getByTestId('classic-status')).toBeVisible();
}

const fp = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return a.classic.fingerprint(a.doc) as string;
  });

/** A spot on lane x, in measure 10, with no note at that position and at least `need` sounds to key. */
const spot = (page: Page, x: number, need: number) =>
  page.evaluate(
    ([x, need, from]) => {
      const a = (window as unknown as W).__ez2bms;
      const d = a.doc;
      for (let y = from + 60; y < from + 900; y += 60) {
        if (d.index.laneKeys().some((k: number) => d.index.at(k, y).length)) continue;
        a.classic.hover(d, x, y, 0);
        const ok = a.classic.cands.filter((c: { bad?: string }) => !c.bad).length;
        a.classic.clear();
        if (ok >= need) return y;
      }
      throw new Error('no spot');
    },
    [x, need, M10] as const,
  );

async function at(page: Page, x: number, pulse: number) {
  const box = (await page.getByTestId('playfield').boundingBox())!;
  return page.evaluate(
    ([x, pulse, bx, by]) => {
      const f = (window as unknown as W).__ez2bmsField;
      const lane = f.currentLayout.lanes.find((l: { x: number }) => l.x === x);
      return { x: bx + lane.left + lane.width / 2, y: by + f.yOf(pulse) };
    },
    [x, pulse, box.x, box.y] as const,
  );
}

const notesAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) =>
      (window as unknown as W).__ez2bms.doc.index
        .at(x, y)
        .map((n: { id: number; c: boolean; ch: number }) => ({ id: n.id, c: n.c, ch: n.ch })),
    [x, y] as const,
  );

test('keys what is sounding, un-keys it again, and the song remembers the mode', async ({
  page,
}) => {
  await open(page);
  const saved = await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    await new Promise((r) => setTimeout(r, 100));
    return a.backend.readText(`${a.project.dir}/ez2bms.song.json`);
  });
  expect(JSON.parse(saved).classic).toBe(true);

  const before = await fp(page);
  const y = await spot(page, 13, 1);
  const p = await at(page, 13, y);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('classic-status')).toContainText('.wav');
  await page.mouse.click(p.x, p.y);
  const keyed = await notesAt(page, 13, y);
  expect(keyed).toHaveLength(1);
  expect(keyed[0]!.c).toBe(true);
  expect(await fp(page)).toBe(before);

  // Delete: the split Classic made is healed away, the music unchanged.
  await page.keyboard.press('Delete');
  expect(await notesAt(page, 13, y)).toEqual([]);
  expect(await notesAt(page, 0, y)).toEqual([]);
  expect(await fp(page)).toBe(before);
});

test('Q picks another sound to key', async ({ page }) => {
  await open(page);
  const y = await spot(page, 12, 2);
  const p = await at(page, 12, y);
  await page.mouse.move(p.x, p.y);
  const status = page.getByTestId('classic-status');
  await expect(status).toContainText('(1/');
  const first = await status.textContent();
  await page.keyboard.press('q');
  await expect(status).toContainText('(2/');
  expect(await status.textContent()).not.toBe(first);
  await page.keyboard.press('Shift+q');
  await expect(status).toContainText('(1/');
});

test('right-click splits a sound in the background, and heals the split', async ({ page }) => {
  await open(page);
  const before = await fp(page);
  const y = await spot(page, 14, 1);
  const p = await at(page, 14, y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  const split = await notesAt(page, 0, y);
  expect(split).toHaveLength(1);
  expect(split[0]!.c).toBe(true);
  expect(await fp(page)).toBe(before);

  await page.waitForTimeout(100);
  const box = (await page.getByTestId('playfield').boundingBox())!;
  const chip = await page.evaluate(
    (id) => (window as unknown as W).__ez2bmsField.rackBox(id),
    split[0]!.id,
  );
  expect(chip).toBeTruthy();
  await page.mouse.click(box.x + chip.x + chip.w / 2, box.y + chip.y + chip.h / 2, {
    button: 'right',
  });
  expect(await notesAt(page, 0, y)).toEqual([]);
  expect(await fp(page)).toBe(before);
});

test('reset all sends every note back to the background, the music unchanged', async ({ page }) => {
  await open(page);
  const before = await fp(page);
  for (const x of [11, 13]) {
    const y = await spot(page, x, 1);
    const p = await at(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('Control+k');
  await page.keyboard.type('reset all');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Reset' }).click();
  const lanes = await page.evaluate(
    () =>
      (window as unknown as W).__ez2bms.doc.data.notes.filter((n: { x: number }) => n.x !== 0)
        .length,
  );
  expect(lanes).toBe(0);
  expect(await fp(page)).toBe(before);
});
