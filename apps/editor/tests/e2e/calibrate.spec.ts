// The latency tests and the picture offset, with taps at exact times through
// the browser build's pretend controller: tapping 30 ms after every click
// gives an input offset of 30; tapping to the flashes, with that offset in
// force, gives the picture offset; and the shown cursor leads what is heard
// by the picture offset.

import { expect, test, type Page } from '@playwright/test';

interface CalApp {
  settings: { set(k: string, v: unknown): void; data: Record<string, number> };
  input: { apply(c: { ini: string; debounceMs: number }): void };
  audio: {
    songMsAtHost(h: number): number | undefined;
    heardNow(): number | undefined;
    msAt(slot: unknown, y: number): number;
  };
  calibrator: { running: boolean };
  view: { cursor: number };
  slot: unknown;
}
interface Pad {
  plug(): string;
  button(key: string, index: number, down: boolean, hostNs?: number): void;
  hostNow(): number;
  hostAtSong(ms: number): number;
}
type W = Window & { __ez2bms: CalApp; __ez2bmsPad: Pad };

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as W;
    const c = { ini: '[Keys]\nKey1 = Z, 0810:e501/b0\n', debounceMs: 0 };
    w.__ez2bms.settings.set('controls', c);
    w.__ez2bms.input.apply(c);
    w.__ez2bmsPad.plug();
  });
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Controls and timing');
  await page.keyboard.press('Enter');
  await page.getByTestId('controls-tab-timing').click();
}

/**
 * While a test runs: tap beat k (at 1000 + 500k ms) `offsets[k]` ms late,
 * each tap sent just after its time (a press more than 200 ms old would be
 * taken as now).
 */
async function tapAlong(page: Page, offsets: number[]) {
  await page.evaluate(async (offsets) => {
    const w = window as unknown as W;
    const pad = w.__ez2bmsPad;
    const app = w.__ez2bms;
    const sleep = () => new Promise((r) => setTimeout(r, 5));
    while (!app.calibrator.running) await sleep();
    const song = () => app.audio.songMsAtHost(pad.hostNow() / 1e6) ?? -Infinity;
    for (let k = 0; k < offsets.length; k++) {
      const t = 1000 + 500 * k + offsets[k]!;
      while (song() < t - 250) await sleep();
      while (song() < t + 5);
      pad.button('0810:e501', 0, true, pad.hostAtSong(t));
      pad.button('0810:e501', 0, false, pad.hostAtSong(t + 5));
    }
  }, offsets);
}

/** Warm-up taps anywhere, then a steady player `late` ms late with a little jitter and one slip. */
const player = (late: number) =>
  Array.from({ length: 20 }, (_, k) =>
    k < 4 ? [-120, 90, 60, -40][k]! : k === 11 ? late + 180 : late + ((k * 7) % 5) - 2,
  );

test('the sound test sets the input offset; the picture test the picture offset', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await open(page);
  await page.getByTestId('calibrate-sound').click();
  await tapAlong(page, player(30));
  await expect(page.getByTestId('calibrate-result')).toContainText('30 ms late', {
    timeout: 5000,
  });
  await page.getByTestId('calibrate-apply').click();
  const input = await page.evaluate(
    () => (window as unknown as W).__ez2bms.settings.data.inputOffsetMs,
  );
  expect(input).toBe(30);
  await expect(page.getByTestId('offset-input')).toHaveValue('30');

  // The picture: taps 50 ms after each flash, 30 of it the input's.
  await page.getByTestId('calibrate-picture').click();
  // The flash lights on each beat (watched every frame: it lasts 90 ms of 500).
  await page.waitForFunction(
    () => document.querySelector('[data-testid=calibrate-flash]')?.classList.contains('on'),
    undefined,
    { polling: 'raf', timeout: 5000 },
  );
  await tapAlong(page, player(50));
  await expect(page.getByTestId('calibrate-result')).toContainText('20 ms late', {
    timeout: 5000,
  });
  await page.getByTestId('calibrate-apply').click();
  expect(
    await page.evaluate(() => (window as unknown as W).__ez2bms.settings.data.visualOffsetMs),
  ).toBe(20);
});

test('too few taps give no answer', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await page.getByTestId('calibrate-sound').click();
  await tapAlong(page, [0, 0, 0, 0, 30, 30]);
  await expect(page.getByTestId('calibrate-failed')).toBeVisible({ timeout: 12_000 });
});

test('the shown cursor leads what is heard by the picture offset', async ({ page }) => {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  const lead = async () => {
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    // Read in an animation frame, which runs just after the one that moved
    // the cursor: both see nearly the same moment (a busy machine can put a
    // few ms between them).
    const d = await page.evaluate(
      () =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() => {
            const app = (window as unknown as W).__ez2bms;
            resolve(app.audio.msAt(app.slot, app.view.cursor) - app.audio.heardNow()!);
          }),
        ),
    );
    await page.keyboard.press('Space');
    await page.keyboard.press('Home');
    return d;
  };
  // Without an offset the cursor is what is heard.
  expect(Math.abs(await lead())).toBeLessThan(15);
  await page.evaluate(() => (window as unknown as W).__ez2bms.settings.set('visualOffsetMs', 200));
  const d = await lead();
  expect(Math.abs(d - 200)).toBeLessThan(15);
});
