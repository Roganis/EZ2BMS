// Controllers in test play, through the browser build's pretend pads
// (window.__ez2bmsPad): a button pressed at an exact host time is judged at
// that time, and ScratchMix is fret-and-strum - a fret alone does nothing,
// the turntable strums what is held.

import { expect, test, type Page } from '@playwright/test';

interface PadApi {
  plug(info?: object): string;
  button(key: string, index: number, down: boolean, hostNs?: number): void;
  hostNow(): number;
  hostAtSong(ms: number): number;
  readonly active: boolean;
}

interface InputApp {
  settings: { set(k: 'controls', v: { ini: string; debounceMs: number }): void };
  input: { apply(c: { ini: string; debounceMs: number }): void };
  audio: { songMsAtHost(h: number): number | undefined; msAt(slot: unknown, y: number): number };
  slot: { mode: string; doc: { data: { notes: { x: number; y: number; l: number }[] } } };
  project: { charts: { file: string }[] };
  selectChart(i: number): void;
}

type W = Window & { __ez2bms: InputApp; __ez2bmsPad: PadApi };

async function open(page: Page, extra = '') {
  await page.goto(`/?e2e${extra}`);
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

/** Bindings for the test (keys.ini text over the port's defaults), no debounce. */
async function bind(page: Page, ini: string) {
  await page.evaluate((ini) => {
    const app = (window as unknown as W).__ez2bms;
    const c = { ini, debounceMs: 0 };
    app.settings.set('controls', c);
    app.input.apply(c);
  }, ini);
}

/** The KOOL count on the result card. */
async function kools(page: Page): Promise<number> {
  const row = page.getByTestId('result').locator('tr', { hasText: 'KOOL' }).locator('td');
  return Number(await row.textContent());
}

/**
 * During test play: wait until the song is `after` ms past the first note on
 * lane `x` from `fromY`, then run `presses` with that note's song time (the
 * presses are stamped in the past - a press is judged when it happened).
 */
async function atNote(
  page: Page,
  x: number,
  fromY: number,
  presses: (pad: PadApi, key: string, noteMs: number) => void,
) {
  await page.evaluate(
    async ({ x, fromY, presses }) => {
      const w = window as unknown as W;
      const app = w.__ez2bms;
      const note = app.slot.doc.data.notes
        .filter((n) => n.x === x && n.y >= fromY)
        .sort((a, b) => a.y - b.y)[0]!;
      const noteMs = app.audio.msAt(app.slot, note.y);
      const song = () => app.audio.songMsAtHost(w.__ez2bmsPad.hostNow() / 1e6);
      while ((song() ?? -Infinity) < noteMs + 20) await new Promise((r) => setTimeout(r, 5));
      new Function('pad', 'key', 'noteMs', presses)(w.__ez2bmsPad, '0810:e501', noteMs);
    },
    { x, fromY, presses: `(${presses.toString()})(pad, key, noteMs)` },
  );
}

test('a controller button pressed at an exact time is judged at that time', async ({ page }) => {
  await open(page);
  // The cabinet bridge's button 1 is Key1, beside the keyboard's Z.
  await bind(page, '[Keys]\nKey1 = Z, 0810:e501/b0\n');
  expect(await page.evaluate(() => (window as unknown as W).__ez2bmsPad.plug())).toBe('0810:e501');
  await page.keyboard.press('Shift+Tab');
  // Test play opens the pads.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bmsPad.active))
    .toBe(true);
  await atNote(page, 11, 240, (pad, key, noteMs) => {
    pad.button(key, 0, true, pad.hostAtSong(noteMs));
    pad.button(key, 0, false, pad.hostAtSong(noteMs + 10));
  });
  await expect(page.getByTestId('hud-judge')).toHaveText(/KOOL/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result')).toBeVisible();
  expect(await kools(page)).toBe(1);
  // Out of test play the pads close again.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bmsPad.active))
    .toBe(false);
});

test('ScratchMix: a fret alone is silent, a strum plays the held fret', async ({ page }) => {
  await open(page, '&modes');
  await page.evaluate(() => {
    const app = (window as unknown as W).__ez2bms;
    app.selectChart(app.project.charts.findIndex((c) => c.file.startsWith('scratchmix1p')));
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bms.slot.mode))
    .toBe('scratch');
  // Buttons 2 and 3 are Key2 and Key3 (frets), button 22 the turntable's up
  // pulse (Scratch1).
  await bind(
    page,
    '[Keys]\nKey2 = X, 0810:e501/b1\nKey3 = C, 0810:e501/b2\nScratch1 = 0810:e501/b21\n',
  );
  await page.evaluate(() => (window as unknown as W).__ez2bmsPad.plug());
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bmsPad.active))
    .toBe(true);
  // The lane tour's holds from beat 4. Key2's: fretted right on it, no strum.
  await atNote(page, 12, 960, (pad, key, noteMs) => {
    pad.button(key, 1, true, pad.hostAtSong(noteMs));
    pad.button(key, 1, false, pad.hostAtSong(noteMs + 5));
  });
  // Nothing in the chart is hit before the strum below: no KOOL yet.
  await page.waitForTimeout(150);
  await expect(page.getByTestId('hud-judge')).not.toHaveText(/KOOL/);
  // Key3's: fretted early, strummed on the note.
  await atNote(page, 13, 960, (pad, key, noteMs) => {
    pad.button(key, 2, true, pad.hostAtSong(noteMs - 60));
    pad.button(key, 21, true, pad.hostAtSong(noteMs));
    pad.button(key, 21, false, pad.hostAtSong(noteMs + 5));
  });
  await expect(page.getByTestId('hud-judge')).toHaveText(/KOOL/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('result')).toBeVisible();
  // The head, and the hold's instalments while the fret stays down.
  expect(await kools(page)).toBeGreaterThanOrEqual(1);
});
