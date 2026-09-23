// Slicing a stem by hand in its strip: right-click cuts (Shift: at an
// onset) and heals, a cut drags between its neighbours, a slice drags onto a
// lane and back, the knife cuts from the lanes, and a hovered slice plays.
// After every gesture the song must sound exactly as before (chart-core's
// fingerprint, read through the ?e2e hook); the rules themselves are
// chart-core's (slice.test.ts).

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any; __ez2bmsField: any };

const M = 4 * 240;

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  // Measures 2-4 on screen.
  await page.evaluate((m) => ((window as unknown as W).__ez2bms.view.cursor = 2 * m), M);
  await page.waitForTimeout(250);
}

const fp = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return a.classic.fingerprint(a.doc) as string;
  });

/** The stem's notes: [y, x, c]. */
const stem = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const ch = a.doc.data.channels.find((c: { name: string }) => c.name === 'stem_pad.wav').id;
    return a.doc.index
      .channel(ch)
      .map((n: { y: number; x: number; c: boolean }) => [n.y, n.x, n.c]) as [
      number,
      number,
      boolean,
    ][];
  });

/** A screen point in the strip (or on lane x) at a pulse. */
async function at(page: Page, pulse: number, lane?: number) {
  const box = (await page.getByTestId('playfield').boundingBox())!;
  return page.evaluate(
    ([pulse, lane, bx, by]) => {
      const f = (window as unknown as W).__ez2bmsField;
      const l = f.currentLayout;
      const g = lane === -1 ? l.strips[0] : l.lanes.find((x: { x: number }) => x.x === lane);
      return { x: bx + g.left + g.width / 2, y: by + f.yOf(pulse) };
    },
    [pulse, lane ?? -1, box.x, box.y] as const,
  );
}

async function click(page: Page, pulse: number, o: { right?: boolean; lane?: number } = {}) {
  const p = await at(page, pulse, o.lane);
  await page.mouse.click(p.x, p.y, { button: o.right ? 'right' : 'left' });
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test('right-click cuts the stem and heals a cut, keeping the sound', async ({ page }) => {
  await open(page);
  const sound = await fp(page);
  await click(page, 2.5 * M, { right: true });
  await expect.poll(() => stem(page)).toContainEqual([2.5 * M, 0, true]);
  expect(await fp(page)).toBe(sound);
  // On the cut at measure 3: heal.
  await click(page, 3 * M, { right: true });
  await expect.poll(async () => (await stem(page)).some(([y]) => y === 3 * M)).toBe(false);
  expect(await fp(page)).toBe(sound);
  // One undo step each.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await stem(page)).some(([y]) => y === 3 * M)).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await stem(page)).some(([y]) => y === 2.5 * M)).toBe(false);
});

test('Shift cuts at the nearest onset, off the grid', async ({ page }) => {
  await open(page);
  // Quarter-beat grid, and a spot between two quarters: the demo's
  // eighth-note hit at 2.625 measures is nearer than either.
  await page.evaluate(() => ((window as unknown as W).__ez2bms.view.snap = 4));
  const p = await at(page, 2.62 * M);
  await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.keyboard.up('Shift');
  await expect.poll(() => stem(page)).toContainEqual([2.625 * M, 0, true]);
});

test('a cut drags between its neighbours, and no further', async ({ page }) => {
  await open(page);
  const sound = await fp(page);
  await drag(page, await at(page, 3 * M), await at(page, 3.25 * M));
  await expect.poll(() => stem(page)).toContainEqual([3.25 * M, 0, true]);
  expect(await fp(page)).toBe(sound);
  // Past the cut at measure 4: refused, and it stays.
  await drag(page, await at(page, 3.25 * M), await at(page, 4.5 * M));
  await expect(page.getByText(/a cut stays between the cuts either side of it/)).toBeVisible();
  expect((await stem(page)).map(([y]) => y)).toContain(3.25 * M);
  expect(await fp(page)).toBe(sound);
});

test('a slice drags onto a lane at its own time, and back', async ({ page }) => {
  await open(page);
  const sound = await fp(page);
  // A lane free at measure 3.
  const lane = await page.evaluate((y) => {
    const a = (window as unknown as W).__ez2bms;
    const f = (window as unknown as W).__ez2bmsField;
    return f.currentLayout.lanes.find(
      (l: { x: number }) => !a.doc.index.at(l.x, y).length && !a.doc.index.holdCovering(l.x, y),
    ).x as number;
  }, 3 * M);
  // Grab the slice from measure 3 by its body, drop it on the lane lower down.
  await drag(page, await at(page, 3.5 * M), await at(page, 3.2 * M, lane));
  await expect.poll(() => stem(page)).toContainEqual([3 * M, lane, true]);
  expect(await fp(page)).toBe(sound);
  // The strip shows it keyed.
  expect(
    await page.evaluate((y) => {
      const f = (window as unknown as W).__ez2bmsField;
      return f.state.strips[0].view.slices.find((s: { y: number }) => s.y === y).keyed;
    }, 3 * M),
  ).toBe(true);
  // Its note from the lane back onto the strip: the background again.
  await drag(page, await at(page, 3 * M, lane), await at(page, 3 * M, -1));
  await expect.poll(() => stem(page)).toContainEqual([3 * M, 0, true]);
  expect(await fp(page)).toBe(sound);
});

test('the knife cuts the stem from the lanes', async ({ page }) => {
  await open(page);
  const sound = await fp(page);
  await page.keyboard.press('c');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bms.view.tool))
    .toBe('knife');
  await click(page, 2.75 * M, { lane: 11 });
  await expect.poll(() => stem(page)).toContainEqual([2.75 * M, 0, true]);
  expect(await fp(page)).toBe(sound);
});

test('a slice hovered a moment plays', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const heard: unknown[] = [];
    (window as unknown as { heard: unknown[] }).heard = heard;
    const trigger = a.backend.audio.trigger.bind(a.backend.audio);
    a.backend.audio.trigger = (t: unknown) => {
      heard.push(t);
      return trigger(t);
    };
  });
  const p = await at(page, 3.5 * M);
  await page.mouse.move(p.x, p.y);
  // The slice from measure 3: 4.8 s into the stem, to measure 4 (6.4 s).
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { heard: any[] }).heard.at(-1)))
    .toMatchObject({ offset_ms: expect.closeTo(4800, 1), until_ms: expect.closeTo(6400, 1) });
});
