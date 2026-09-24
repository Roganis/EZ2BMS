import { expect, test, type Page } from '@playwright/test';
import type { E2EWindow } from './hooks';

// Drives the real playfield with the mouse: the renderer's own geometry says
// where each lane and pulse is on screen.

interface Probe {
  lane: (x: number) => number;
  y: (pulse: number) => number;
}

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.waitForFunction(() => '__ez2bmsField' in window);
  // Somewhere empty: past the end of the demo (24 measures).
  await page.keyboard.press('Control+k');
  await page.keyboard.type('goto 30');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

async function probe(page: Page): Promise<Probe> {
  const box = (await page.getByTestId('playfield').boundingBox())!;
  const geo = await page.evaluate(() => {
    const f = (window as unknown as E2EWindow).__ez2bmsField;
    const lanes = f.currentLayout.lanes.map((l): [number, number] => [l.x, l.left + l.width / 2]);
    return { lanes, y0: f.yOf(0), ppp: f.pxPerPulse };
  });
  const lanes = new Map<number, number>(geo.lanes);
  return {
    lane: (x) => box.x + lanes.get(x)!,
    y: (p) => box.y + geo.y0 - p * geo.ppp,
  };
}

const notesAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const d = (window as unknown as E2EWindow).__ez2bms.doc;
      return d.index
        .at(x, y)
        .map((n: { l: number; x: number; y: number }) => ({ x: n.x, y: n.y, l: n.l }));
    },
    [x, y] as const,
  );

const M30 = 30 * 4 * 240;

test('click places a note with the brush; drag up makes a hold; undo and redo', async ({
  page,
}) => {
  await open(page);
  const p = await probe(page);
  const y = M30 + 480;
  await page.mouse.click(p.lane(13), p.y(y));
  expect(await notesAt(page, 13, y)).toEqual([{ x: 13, y, l: 0 }]);

  await page.mouse.move(p.lane(14), p.y(y));
  await page.mouse.down();
  await page.mouse.move(p.lane(14), p.y(y + 240), { steps: 5 });
  await page.mouse.up();
  expect(await notesAt(page, 14, y)).toEqual([{ x: 14, y, l: 240 }]);

  await page.keyboard.press('Control+z');
  expect(await notesAt(page, 14, y)).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect(await notesAt(page, 14, y)).toEqual([{ x: 14, y, l: 240 }]);
});

test('drag moves a note across lanes and time; Esc cancels a drag; right-click erases', async ({
  page,
}) => {
  await open(page);
  const p = await probe(page);
  const y = M30 + 240;
  await page.mouse.click(p.lane(11), p.y(y));
  // Move one lane right, one beat later.
  await page.mouse.move(p.lane(11), p.y(y));
  await page.mouse.down();
  await page.mouse.move(p.lane(12), p.y(y + 240), { steps: 6 });
  await page.mouse.up();
  expect(await notesAt(page, 11, y)).toEqual([]);
  expect(await notesAt(page, 12, y + 240)).toEqual([{ x: 12, y: y + 240, l: 0 }]);
  // Start another drag and abandon it.
  await page.mouse.move(p.lane(12), p.y(y + 240));
  await page.mouse.down();
  await page.mouse.move(p.lane(15), p.y(y + 720), { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await notesAt(page, 12, y + 240)).toEqual([{ x: 12, y: y + 240, l: 0 }]);
  // Erase.
  await page.mouse.click(p.lane(12), p.y(y + 240), { button: 'right' });
  expect(await notesAt(page, 12, y + 240)).toEqual([]);
});

test('keys edit the selection; save writes the chart back', async ({ page }) => {
  await open(page);
  const p = await probe(page);
  const y = M30;
  await page.mouse.click(p.lane(13), p.y(y));
  await page.keyboard.press('l');
  expect(await notesAt(page, 13, y)).toEqual([{ x: 13, y, l: 240 }]);
  await page.keyboard.press('Alt+ArrowRight');
  expect(await notesAt(page, 14, y)).toEqual([{ x: 14, y, l: 240 }]);
  await page.keyboard.press('m');
  expect(await notesAt(page, 12, y)).toEqual([{ x: 12, y, l: 240 }]);
  await expect(page.locator('nav[aria-label=Charts] .dot')).toHaveCount(1);
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved 1 chart')).toBeVisible();
  await expect(page.locator('nav[aria-label=Charts] .dot')).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const a = (window as unknown as E2EWindow).__ez2bms;
    const text = await a.backend.readText(`${a.project.dir}/${a.slot.file}`);
    return JSON.parse(text).sound_channels.flatMap(
      (c: { notes: { x: number; y: number; l: number }[] }) => c.notes,
    );
  });
  expect(saved).toContainEqual(expect.objectContaining({ x: 12, y, l: 240 }));
});

test('saving an untouched chart gives back the same bytes', async ({ page }) => {
  await open(page);
  const same = await page.evaluate(async () => {
    const a = (window as unknown as E2EWindow).__ez2bms;
    const path = `${a.project.dir}/${a.slot.file}`;
    const before = await a.backend.readText(path);
    await a.project.save(a.slot);
    return before === (await a.backend.readText(path));
  });
  expect(same).toBe(true);
});

test('the step input keys toggle notes at the cursor', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+e');
  await page.keyboard.press('z');
  await page.keyboard.press('Space');
  expect(await notesAt(page, 11, M30)).toHaveLength(1);
  expect(await notesAt(page, 10, M30)).toHaveLength(1);
  await page.keyboard.press('z');
  expect(await notesAt(page, 11, M30)).toHaveLength(0);
});

test('Shift-drag selects with a rubber band, even starting on a hold', async ({ page }) => {
  await open(page);
  const p = await probe(page);
  const y = M30 + 240;
  // A hold, and taps beside and above it.
  await page.mouse.move(p.lane(12), p.y(y));
  await page.mouse.down();
  await page.mouse.move(p.lane(12), p.y(y + 480), { steps: 4 });
  await page.mouse.up();
  await page.mouse.click(p.lane(13), p.y(y + 240));
  await page.mouse.click(p.lane(14), p.y(y + 480));
  await page.keyboard.press('Escape'); // Shift-drag adds to the selection: start from none
  await page.keyboard.down('Shift');
  await page.mouse.move(p.lane(12), p.y(y + 360));
  await page.mouse.down();
  await page.mouse.move(p.lane(14) + 20, p.y(y - 120), { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const sel = await page.evaluate(
    () => (window as unknown as E2EWindow).__ez2bms.doc.selection.ids.size,
  );
  expect(sel).toBe(2);
  expect(await notesAt(page, 12, y)).toEqual([{ x: 12, y, l: 480 }]);
});

test('the Inspector says what a hold is judged and counted as; K cycles its kind', async ({
  page,
}) => {
  await open(page);
  const p = await probe(page);
  const y = M30;
  await page.mouse.click(p.lane(13), p.y(y));
  // A one-beat hold: 48 ticks, 54 raw. Kind 0 pays every 12 ticks, 3 times
  // after the head, and the engine counts it as 4 (engine/holdpreview.ts).
  await page.keyboard.press('l');
  await page.evaluate(() => {
    const a = (window as unknown as { __ez2bms: { view: { right: string | null } } }).__ez2bms;
    a.view.right = 'inspector';
  });
  const counts = page.getByTestId('hold-counts');
  await expect(counts).toHaveText('Judged 4× (heads and instalments), counted as 4.');
  await expect(counts).not.toHaveClass(/warn/);
  // K walks the common kinds: 1, 2, 3, then 4, which the counter counts in
  // 1/32s while paying once, so 100% is out of reach.
  for (let i = 0; i < 4; i++) await page.keyboard.press('k');
  await expect(page.locator('#ins-kind')).toHaveValue('4');
  await expect(counts).toHaveClass(/warn/);
  await expect(counts).toContainText('cannot score exactly 100%');
});
