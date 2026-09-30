// The neon skin's note heads: bars across the lane, or orbs (render/geometry.ts
// noteBox). Preferences choose, the setting stays, a click takes a note where
// it is drawn, and a hold's body runs from its end to its head.

import { expect, test, type Page } from '@playwright/test';
import type { E2EWindow } from './hooks';

interface Lane {
  x: number;
  kind: string;
  left: number;
  width: number;
}

async function open(page: Page, query = '') {
  await page.goto(`/?e2e${query}`);
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  // Somewhere empty: past the end of the demo (24 measures).
  await page.keyboard.press('Control+k');
  await page.keyboard.type('goto 30');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

const M30 = 30 * 4 * 240;

/** A white key lane, where it is on the page, and pulses to page y. */
async function probe(page: Page) {
  const box = (await page.getByTestId('playfield').boundingBox())!;
  const geo = await page.evaluate(() => {
    const f = (window as unknown as E2EWindow).__ez2bmsField as unknown as {
      currentLayout: { lanes: Lane[]; scale: number };
      yOf(p: number): number;
      pxPerPulse: number;
    };
    return {
      lane: f.currentLayout.lanes.find((l) => l.kind === 'white')!,
      scale: f.currentLayout.scale,
      y0: f.yOf(0),
      ppp: f.pxPerPulse,
    };
  });
  return {
    lane: geo.lane,
    scale: geo.scale,
    x: box.x + geo.lane.left + geo.lane.width / 2,
    left: box.x + geo.lane.left,
    y: (p: number) => box.y + geo.y0 - p * geo.ppp,
  };
}

/** Mean brightness (0..255) of a page rectangle, as rendered. */
async function brightness(page: Page, x: number, y: number, w: number, h: number) {
  const png = await page.screenshot({ clip: { x, y, width: w, height: h } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

const noteSkin = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __ez2bms: { settings: { data: { noteSkin: string } } } }).__ez2bms
        .settings.data.noteSkin,
  );

const notesAt = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as E2EWindow).__ez2bms.doc.index.at(x, y).length, [
    x,
    y,
  ] as const);

const selected = (page: Page) =>
  page.evaluate(() => (window as unknown as E2EWindow).__ez2bms.doc.selection.ids.size);

test('Preferences turn the notes round; a click takes an orb where it is drawn', async ({
  page,
}) => {
  await open(page);
  expect(await noteSkin(page)).toBe('bar');
  const p = await probe(page);
  const y = M30 + 480;
  await page.mouse.click(p.x, p.y(y));
  expect(await notesAt(page, p.lane.x, y)).toBe(1);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  // A bar reaches the lane's edges; an orb sits in the middle.
  const edge = () => brightness(page, p.left + 2, p.y(y) - 2, 2, 4);
  const middle = () => brightness(page, p.x - 1, p.y(y) - 2, 2, 4);
  expect(await edge()).toBeGreaterThan(120);

  await page.keyboard.press('Control+,');
  const prefs = page.getByTestId('prefs');
  await expect(prefs.getByTestId('prefs-note-skin')).toHaveValue('bar');
  await prefs.getByTestId('prefs-note-skin').selectOption('round');
  await page.keyboard.press('Escape');
  await expect(prefs).toHaveCount(0);
  expect(await noteSkin(page)).toBe('round');
  await expect.poll(edge).toBeLessThan(70);
  expect(await middle()).toBeGreaterThan(120);

  // The orb is twice a bar's height, and taken all over: a click near its rim selects it...
  const d = Math.min(Math.round(18 * p.scale), Math.floor(p.lane.width) - 4);
  await page.mouse.click(p.x, p.y(y) - d / 2 + 2);
  expect(await selected(page)).toBe(1);
  expect(await notesAt(page, p.lane.x, y)).toBe(1);
  // ...but not as far past it as its height would say: a sixteenth above is a new note.
  await page.keyboard.press('Escape');
  await page.mouse.click(p.x, p.y(y + 60));
  expect(await notesAt(page, p.lane.x, y + 60)).toBe(1);
  expect(await notesAt(page, p.lane.x, y)).toBe(1);

  // Kept: a reload draws orbs again.
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByTestId('open-folder').click();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  expect(await noteSkin(page)).toBe('round');
});

test("a hold's body runs from its end to its head, bar or round", async ({ page }) => {
  await open(page);
  const p = await probe(page);
  for (const [i, shape] of (['bar', 'round'] as const).entries()) {
    await page.evaluate(
      (s) =>
        (
          window as unknown as { __ez2bms: { settings: { set(k: string, v: string): void } } }
        ).__ez2bms.settings.set('noteSkin', s),
      shape,
    );
    const y = M30 + 960 * i;
    await page.mouse.move(p.x, p.y(y));
    await page.mouse.down();
    await page.mouse.move(p.x, p.y(y + 480), { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    // Just past the head, and just short of the end: the body is there
    // (it used to stop about a third of the way in from each).
    const bw = Math.round(0.72 * (shape === 'round' ? 18 * p.scale : p.lane.width));
    const head = shape === 'round' ? 18 * p.scale : 9 * p.scale;
    const body = (at: number) => brightness(page, p.x - bw / 2, at, bw, 3);
    await expect.poll(() => body(p.y(y) - head / 2 - 8), shape).toBeGreaterThan(40);
    expect(await body(p.y(y + 480) + 6), shape).toBeGreaterThan(40);
    // Between two holds' ends, nothing.
    expect(await body(p.y(y + 690)), shape).toBeLessThan(25);
  }
});

test("the palette switches the notes; over the game's panel it says why nothing changed", async ({
  page,
}) => {
  await open(page, '&skin');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Note skin');
  await page.keyboard.press('Enter');
  expect(await noteSkin(page)).toBe('round');
  await expect(page.getByText(/The game's own panel draws its notes/)).toBeVisible();
  await page.keyboard.press('Control+,');
  await expect(
    page.getByTestId('prefs').getByText(/The game's own panel draws its notes/),
  ).toBeVisible();
});
