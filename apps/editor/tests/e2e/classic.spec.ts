// Classic mode on the real playfield: placing keys a note already in the
// background - where the magnet pulls it, the picked sound's track first -
// and the song must sound exactly the same afterwards (chart-core's
// fingerprint, read through the ?e2e hook, is compared before and after
// every edit). Placing never adds a note.

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

/**
 * A background note's position in measure 10 that lane x can take and the
 * magnet lands on exactly, with at least `need` notes there to key.
 */
const spot = (page: Page, x: number, need: number) =>
  page.evaluate(
    ([x, need, from]) => {
      const a = (window as unknown as W).__ez2bms;
      const d = a.doc;
      for (let y = from; y < from + 960; y += 60) {
        if (d.index.at(x, y).length || a.classic.magnet(d, x, y) !== y) continue;
        a.classic.hover(d, x, y, 0);
        const ok = a.classic.cands.filter((c: { bad?: string }) => !c.bad).length;
        a.classic.clear();
        if (ok >= need) return y;
      }
      throw new Error('no spot');
    },
    [x, need, M10] as const,
  );

/** A position in measure 10 with no note on any lane (a sound still plays through it). */
const emptySpot = (page: Page) =>
  page.evaluate((from) => {
    const d = (window as unknown as W).__ez2bms.doc;
    for (let y = from + 60; y < from + 960; y += 60)
      if (!d.index.laneKeys().some((k: number) => d.index.at(k, y).length)) return y;
    throw new Error('no empty spot');
  }, M10);

const noteCount = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__ez2bms.doc.data.notes.length as number);

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

test('keys a background note the magnet pulls to, the picked track first, and un-keys it', async ({
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
  const count = await noteCount(page);
  const box = (await page.getByTestId('playfield').boundingBox())!;
  // The demo's stem is cut on every measure line, a hat plays on every off-beat.
  const [stem] = await notesAt(page, 0, M10);
  expect(stem).toBeTruthy();
  // Clicking the stem's slice in the rack picks its sound, as BmsTWO's click does.
  const chip = await page.evaluate(
    (id) => (window as unknown as W).__ez2bmsField.rackBox(id),
    stem!.id,
  );
  await page.mouse.click(box.x + chip.x + chip.w / 2, box.y + chip.y + chip.h / 2);
  expect(await page.evaluate(() => (window as unknown as W).__ez2bms.view.brush)).toBe(stem!.ch);

  // Near the hat after the line, the stem's own slice pulls first.
  const p = await at(page, 13, M10 + 150);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('classic-status')).toContainText('stem_pad.wav');
  await page.mouse.click(p.x, p.y);
  expect(await notesAt(page, 13, M10)).toEqual([stem]);
  expect(await notesAt(page, 0, M10)).toEqual([]);
  expect(await noteCount(page)).toBe(count);
  expect(await fp(page)).toBe(before);

  // The stem's next slice, a measure on, still pulls before the hat beside the pointer
  // (lane 14: clear of notes there and free at the next measure line)...
  const q = await at(page, 14, M10 + 300);
  await page.mouse.move(q.x, q.y);
  await expect(page.getByTestId('classic-status')).toContainText('stem_pad.wav');
  // ...until a hat is picked: then the hats pull first.
  const [hat] = await notesAt(page, 0, M10 + 120);
  const hatChip = await page.evaluate(
    (id) => (window as unknown as W).__ez2bmsField.rackBox(id),
    hat!.id,
  );
  await page.mouse.click(box.x + hatChip.x + hatChip.w / 2, box.y + hatChip.y + hatChip.h / 2);
  await page.mouse.move(q.x, q.y);
  await expect(page.getByTestId('classic-status')).toContainText('hat.wav');

  // Delete the keyed stem: back to the background, the music unchanged.
  await page.evaluate(
    (id) => (window as unknown as W).__ez2bms.doc.setSelection([id], id),
    stem!.id,
  );
  await page.keyboard.press('Delete');
  expect(await notesAt(page, 13, M10)).toEqual([]);
  expect(await notesAt(page, 0, M10)).toEqual([stem]);
  expect(await noteCount(page)).toBe(count);
  expect(await fp(page)).toBe(before);
});

test('never writes a note where the background has none', async ({ page }) => {
  await open(page);
  const before = await fp(page);
  const count = await noteCount(page);
  // Alt places freely - onto a spot where the stem plays but has no cut.
  const y = await emptySpot(page);
  const p = await at(page, 14, y);
  await page.keyboard.down('Alt');
  await page.mouse.move(p.x, p.y);
  // Nothing to key: the status bar names no sound (the pointer's ghost says so, red).
  await expect(page.getByTestId('classic-status')).not.toContainText('.wav');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Alt');
  await expect(page.getByText('No background note there to key').last()).toBeVisible();
  expect(await notesAt(page, 14, y)).toEqual([]);
  expect(await notesAt(page, 0, y)).toEqual([]);
  expect(await noteCount(page)).toBe(count);
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
  const y = await emptySpot(page);
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
