// Record mode end to end, with presses at exact song times through the
// browser build's pretend controller (window.__ez2bmsPad): a brush take lands
// on its pulses, skips a note already there and goes in as one undo step; a
// Classic take keys what plays and sounds exactly the same; Discard leaves
// the chart alone; ScratchMix records the frets the turntable strums.

import { expect, test, type Page } from '@playwright/test';

interface RecApp {
  doc: {
    resolution: number;
    data: {
      notes: { id: number; x: number; y: number; l: number; ch: number }[];
      channels: { id: number; name: string }[];
    };
    undo(): void;
  };
  view: { cursor: number; brush: number | null; snap: number };
  settings: { set(k: string, v: unknown): void };
  input: { apply(c: { ini: string; debounceMs: number }): void };
  audio: { songMsAtHost(h: number): number | undefined; msAt(slot: unknown, y: number): number };
  slot: unknown;
  recorder: { state: string };
  classic: { fingerprint(doc: unknown): string };
  project: { charts: { file: string }[] };
  selectChart(i: number): void;
}
interface Pad {
  plug(): string;
  button(key: string, index: number, down: boolean, hostNs?: number): void;
  hostNow(): number;
  hostAtSong(ms: number): number;
}
type W = Window & { __ez2bms: RecApp; __ez2bmsPad: Pad };

async function open(page: Page, extra = '') {
  await page.goto(`/?e2e${extra}`);
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

/** Pad buttons on channels (keys.ini text over the defaults), no debounce, the pad plugged in. */
async function setup(page: Page, ini: string) {
  await page.evaluate((ini) => {
    const w = window as unknown as W;
    const c = { ini, debounceMs: 0 };
    w.__ez2bms.settings.set('controls', c);
    w.__ez2bms.input.apply(c);
    w.__ez2bmsPad.plug();
  }, ini);
}

/** The chart's notes, in a stable order, for comparing. */
const notes = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify(
      [...(window as unknown as W).__ez2bms.doc.data.notes]
        .map((n) => ({ ...n }))
        .sort((a, b) => a.id - b.id),
    ),
  );

interface Act {
  pulse: number;
  button: number;
  down: boolean;
}

/**
 * Once recording has started: each action at its pulse's song time exactly,
 * sent a few ms after that time (EZ2PORT's age rule takes a press older than
 * 200 ms as now, so the page spins the last stretch rather than trusting a
 * timer on a busy machine).
 */
async function perform(page: Page, acts: Act[]) {
  await page.evaluate(async (acts) => {
    const w = window as unknown as W;
    const app = w.__ez2bms;
    const pad = w.__ez2bmsPad;
    const sleep = () => new Promise((r) => setTimeout(r, 5));
    while (app.recorder.state !== 'countin' && app.recorder.state !== 'recording') await sleep();
    const song = () => app.audio.songMsAtHost(pad.hostNow() / 1e6) ?? -Infinity;
    for (const a of acts) {
      const t = app.audio.msAt(app.slot, a.pulse);
      while (song() < t - 300) await sleep();
      while (song() < t + 5);
      pad.button('0810:e501', a.button, a.down, pad.hostAtSong(t));
    }
  }, acts);
}

/** From measure 3: a free 1/16 on lane 12, a free one for a hold, and a note on lane 11. */
async function plan(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as W).__ez2bms.doc;
    const res = d.resolution;
    const from = 8 * res;
    const free = (x: number, y: number, l: number) =>
      !d.data.notes.some((n) => n.x === x && n.y <= y + l && n.y + n.l >= y);
    const step = res / 4;
    const odd = (k: number) => from + (2 * k + 1) * step;
    let tap = -1;
    let hold = -1;
    for (let k = 0; k < 16 && (tap < 0 || hold < 0); k++) {
      if (tap < 0 && free(12, odd(k), 0)) tap = odd(k);
      else if (tap >= 0 && hold < 0 && odd(k) > tap + res && free(12, odd(k), 2 * res))
        hold = odd(k);
    }
    const clash = d.data.notes
      .filter((n) => n.x === 11 && n.y > from && n.y < from + 8 * res)
      .sort((a, b) => a.y - b.y)[0]!.y;
    return { from, res, tap, hold, clash };
  });
}

test('a brush take lands on its pulses, skips a note already there, and undoes in one step', async ({
  page,
}) => {
  await open(page);
  await setup(page, '[Keys]\nKey1 = Z, 0810:e501/b0\nKey2 = S, 0810:e501/b1\n');
  const p = await plan(page);
  expect(p.tap).toBeGreaterThan(0);
  expect(p.hold).toBeGreaterThan(0);
  await page.evaluate((from) => {
    const app = (window as unknown as W).__ez2bms;
    app.view.cursor = from;
    app.view.brush = app.doc.data.channels.find((c) => c.name === 'clap.wav')!.id;
  }, p.from);
  const before = await notes(page);

  await page.keyboard.press('r');
  const acts: Act[] = [
    { pulse: p.tap, button: 1, down: true },
    { pulse: p.tap + 10, button: 1, down: false },
    { pulse: p.clash, button: 0, down: true },
    { pulse: p.clash + 10, button: 0, down: false },
    { pulse: p.hold, button: 1, down: true },
    { pulse: p.hold + 2 * p.res, button: 1, down: false },
  ].sort((a, b) => a.pulse - b.pulse);
  await perform(page, acts);
  await page.keyboard.press('r');

  const review = page.getByTestId('record-review');
  await expect(review).toBeVisible();
  await expect(page.getByTestId('record-count')).toHaveText('3 notes');
  await expect(page.getByTestId('record-clash')).toContainText('1 on notes');
  await page.keyboard.press('Enter');
  await expect(review).toBeHidden();

  const placed = await page.evaluate(
    ({ tap, hold }) => {
      const d = (window as unknown as W).__ez2bms.doc;
      const clap = d.data.channels.find((c) => c.name === 'clap.wav')!.id;
      return d.data.notes
        .filter((n) => n.ch === clap && n.x === 12 && (n.y === tap || n.y === hold))
        .map((n) => [n.y, n.l])
        .sort((a, b) => a[0]! - b[0]!);
    },
    { tap: p.tap, hold: p.hold },
  );
  // Exactly on the pulses pressed; the hold to its release.
  expect(placed).toEqual([
    [p.tap, 0],
    [p.hold, 2 * p.res],
  ]);
  // Nothing new where lane 11 had its note.
  const at11 = await page.evaluate(
    (y) =>
      (window as unknown as W).__ez2bms.doc.data.notes.filter((n) => n.x === 11 && n.y === y)
        .length,
    p.clash,
  );
  expect(at11).toBe(1);
  // One undo takes the whole take away.
  await page.evaluate(() => (window as unknown as W).__ez2bms.doc.undo());
  expect(await notes(page)).toBe(before);
});

test('a Classic take keys what plays there, and the song sounds exactly the same', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('classic-toggle').click();
  await setup(page, '[Keys]\nKey2 = S, 0810:e501/b1\n');
  const p = await plan(page);
  await page.evaluate((from) => ((window as unknown as W).__ez2bms.view.cursor = from), p.from);
  const sound = await page.evaluate(() => {
    const app = (window as unknown as W).__ez2bms;
    return app.classic.fingerprint(app.doc);
  });
  await page.keyboard.press('r');
  await perform(page, [
    { pulse: p.tap, button: 1, down: true },
    { pulse: p.tap + 10, button: 1, down: false },
  ]);
  await page.keyboard.press('r');
  await expect(page.getByTestId('record-review')).toBeVisible();
  await expect(page.getByTestId('record-ok')).toHaveText('1 to place');
  await page.getByTestId('record-keep').click();
  await expect(page.getByTestId('record-review')).toBeHidden();
  const after = await page.evaluate((y) => {
    const app = (window as unknown as W).__ez2bms;
    return {
      sound: app.classic.fingerprint(app.doc),
      keyed: app.doc.data.notes.filter((n) => n.x === 12 && n.y === y).length,
    };
  }, p.tap);
  expect(after.keyed).toBe(1);
  expect(after.sound).toBe(sound);
});

test('Discard leaves the chart as it was', async ({ page }) => {
  await open(page);
  await setup(page, '[Keys]\nKey2 = S, 0810:e501/b1\n');
  const p = await plan(page);
  await page.evaluate((from) => {
    const app = (window as unknown as W).__ez2bms;
    app.view.cursor = from;
    app.view.brush = app.doc.data.channels[0]!.id;
  }, p.from);
  const before = await notes(page);
  await page.keyboard.press('r');
  await perform(page, [
    { pulse: p.tap, button: 1, down: true },
    { pulse: p.tap + 10, button: 1, down: false },
  ]);
  await page.keyboard.press('r');
  await expect(page.getByTestId('record-review')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-panel')).toBeHidden();
  expect(await notes(page)).toBe(before);
});

test('ScratchMix records the frets the turntable strums, not a fret alone', async ({ page }) => {
  await open(page, '&modes');
  await page.evaluate(() => {
    const app = (window as unknown as W).__ez2bms;
    app.selectChart(app.project.charts.findIndex((c) => c.file.startsWith('scratchmix1p')));
  });
  await setup(page, '[Keys]\nKey2 = X, 0810:e501/b1\nScratch1 = 0810:e501/b21\n');
  const res = await page.evaluate(() => {
    const app = (window as unknown as W).__ez2bms;
    app.view.cursor = 8 * app.doc.resolution;
    app.view.brush = app.doc.data.channels[0]!.id;
    return app.doc.resolution;
  });
  // The lane tour's notes are all before beat 8: from there on it is empty.
  const alone = 9 * res;
  const strummed = 10 * res;
  await page.keyboard.press('r');
  await perform(page, [
    { pulse: alone, button: 1, down: true },
    { pulse: alone + 10, button: 1, down: false },
    { pulse: strummed - 15, button: 1, down: true },
    { pulse: strummed, button: 21, down: true },
    { pulse: strummed + 10, button: 21, down: false },
    { pulse: strummed + 20, button: 1, down: false },
  ]);
  await page.keyboard.press('r');
  await expect(page.getByTestId('record-count')).toHaveText('1 notes');
  await page.keyboard.press('Enter');
  const on12 = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.doc.data.notes
      .filter((n) => n.x === 12)
      .map((n) => [n.y, n.l]),
  );
  expect(on12).toContainEqual([strummed, 0]);
  expect(on12.some(([y]) => y === alone)).toBe(false);
});
