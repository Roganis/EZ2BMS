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
  slot: {
    mode: string;
    doc: { data: { notes: { id: number; x: number; y: number; l: number }[] } };
  };
  play: { hidden: Set<number> };
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

/**
 * KOOLs so far in the run (the HUD's counts: its last judgement alone can be
 * a later note's MISS by the time a busy machine looks).
 */
const koolsNow = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __ez2bms: { play: { hud: { counts: number[] } | null } } }).__ez2bms
        .play.hud?.counts[1] ?? 0,
  );

/** The KOOL count on the result card. */
async function kools(page: Page): Promise<number> {
  const row = page.getByTestId('result').locator('tr', { hasText: 'KOOL' }).locator('td');
  return Number(await row.textContent());
}

/** A button edge on the plugged board, `at` ms after the note. */
interface Press {
  button: number;
  down: boolean;
  at: number;
}

/**
 * During test play: wait until the song is just past the first note on lane
 * `x` from `fromY`, then press on the board at the note's song time plus each
 * press's `at` (the presses are stamped in the past - a press is judged when
 * it happened). Presses are data, not a function: the page runs under the
 * desktop app's content policy, which forbids building code from text.
 */
async function atNote(page: Page, x: number, fromY: number, presses: Press[]): Promise<number> {
  return page.evaluate(
    async ({ x, fromY, presses }) => {
      const w = window as unknown as W;
      const app = w.__ez2bms;
      const pad = w.__ez2bmsPad;
      const note = app.slot.doc.data.notes
        .filter((n) => n.x === x && n.y >= fromY)
        .sort((a, b) => a.y - b.y)[0]!;
      const noteMs = app.audio.msAt(app.slot, note.y);
      const song = () => app.audio.songMsAtHost(pad.hostNow() / 1e6) ?? -Infinity;
      // Close in by timers, then spin the last stretch: a press older than
      // 200 ms is taken as now (the age rule), and a busy test machine can
      // be late to a timer by that much.
      while (song() < noteMs - 300) await new Promise((r) => setTimeout(r, 5));
      while (song() < noteMs + 5);
      for (const p of presses)
        pad.button('0810:e501', p.button, p.down, pad.hostAtSong(noteMs + p.at));
      return note.id;
    },
    { x, fromY, presses },
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
  await atNote(page, 11, 1920, [
    { button: 0, down: true, at: 0 },
    { button: 0, down: false, at: 10 },
  ]);
  await expect.poll(() => koolsNow(page)).toBeGreaterThanOrEqual(1);
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
  // Buttons 2 and 5 are Key2 and Key5 (frets), button 22 the turntable's up
  // pulse (Scratch1).
  await bind(
    page,
    '[Keys]\nKey2 = X, 0810:e501/b1\nKey5 = B, 0810:e501/b4\nScratch1 = 0810:e501/b21\n',
  );
  await page.evaluate(() => (window as unknown as W).__ez2bmsPad.plug());
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bmsPad.active))
    .toBe(true);
  // The lane tour's holds from beat 4. Key2's: fretted right on it, no strum.
  const alone = await atNote(page, 12, 960, [
    { button: 1, down: true, at: 0 },
    { button: 1, down: false, at: 5 },
  ]);
  // Key5's, 600 ms later: fretted early, strummed on the note.
  const strummed = await atNote(page, 15, 960, [
    { button: 4, down: true, at: -60 },
    { button: 21, down: true, at: 0 },
    { button: 21, down: false, at: 5 },
  ]);
  const hit = (id: number) =>
    page.evaluate((id) => (window as unknown as W).__ez2bms.play.hidden.has(id), id);
  await expect.poll(() => hit(strummed)).toBe(true);
  expect(await hit(alone)).toBe(false);
  // The head, and the hold's instalments while the fret stays down. (The
  // lane tour is short: the run may already be over, so no Esc here.)
  await expect.poll(() => koolsNow(page)).toBeGreaterThanOrEqual(1);
});

async function openControls(page: Page) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Controls and timing');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('controls-dialog')).toBeVisible();
}

const chips = (page: Page, channel: string) =>
  page.getByTestId(`controls-row-${channel}`).getByTestId('binding-token');

test('Controls: a button bound by pressing it plays the lane in test play', async ({ page }) => {
  await open(page);
  const key = await page.evaluate(() => (window as unknown as W).__ez2bmsPad.plug());
  await openControls(page);
  // The dialog opens the pads and lists what it finds.
  await page.getByTestId('controls-tab-devices').click();
  await expect(page.getByTestId('pad-device')).toContainText(key);
  await page.evaluate((k) => (window as unknown as W).__ez2bmsPad.button(k, 6, true), key);
  await expect(page.getByTestId('pad-readout')).toContainText('b6');
  await page.evaluate((k) => (window as unknown as W).__ez2bmsPad.button(k, 6, false), key);

  await page.getByTestId('controls-tab-channels').click();
  await expect(chips(page, 'Key1')).toHaveText(['Z']);
  await page.getByTestId('controls-row-Key1').getByTestId('binding-add').click();
  await expect(page.getByTestId('binding-wait')).toBeVisible();
  await page.evaluate((k) => (window as unknown as W).__ez2bmsPad.button(k, 4, true), key);
  await expect(chips(page, 'Key1')).toHaveText(['Z', `${key}/b4`]);
  await page.evaluate((k) => (window as unknown as W).__ez2bmsPad.button(k, 4, false), key);
  // A key, bound by pressing it; Esc gives up waiting and leaves the dialog open.
  await page.getByTestId('controls-row-Key2').getByTestId('binding-add').click();
  await page.keyboard.press('q');
  await expect(chips(page, 'Key2')).toHaveText(['S', 'Q']);
  await page.getByTestId('controls-row-Key3').getByTestId('binding-add').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('binding-wait')).toBeHidden();
  await expect(page.getByTestId('controls-dialog')).toBeVisible();
  await page.getByTestId('controls-close').click();
  await expect(page.getByTestId('controls-dialog')).toBeHidden();

  // Kept in the settings, in keys.ini's grammar.
  const ini = await page.evaluate(
    () =>
      (window as unknown as { __ez2bms: { settings: { data: { controls: { ini: string } } } } })
        .__ez2bms.settings.data.controls.ini,
  );
  expect(ini).toContain(`Key1 = Z, ${key}/b4`);
  expect(ini).toContain('Key2 = S, Q');

  // And in force: the pad's fifth button hits Key1's note.
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__ez2bmsPad.active))
    .toBe(true);
  await atNote(page, 11, 1920, [
    { button: 4, down: true, at: 0 },
    { button: 4, down: false, at: 10 },
  ]);
  await expect.poll(() => koolsNow(page)).toBeGreaterThanOrEqual(1);
});

test("Controls: import EZ2PORT's keys.ini, reset, and copy as keys.ini", async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  // EZ2PORT's per-user keys.ini (the browser build's stand-in folder).
  await page.evaluate(() =>
    (
      window as unknown as {
        __ez2bms: { backend: { writeText(p: string, t: string, b: boolean): Promise<void> } };
      }
    ).__ez2bms.backend.writeText(
      '/config/ez2port/keys.ini',
      '[Keys]\nKey1 = A, 0810:e501/b0\n[Analog]\nTurntable = 0810:e501/a0\n',
      false,
    ),
  );
  await openControls(page);
  await page.getByTestId('controls-import').click();
  await expect(chips(page, 'Key1')).toHaveText(['A', '0810:e501/b0']);
  await expect(chips(page, 'Key2')).toHaveText(['S']);
  await expect(page.getByTestId('controls-row-Turntable')).toContainText('0810:e501/a0');
  // The turntable's flags write the token.
  await page.getByTestId('tt-rev').check();
  await expect(page.getByTestId('controls-row-Turntable')).toContainText('0810:e501/a0:rev');

  await page.getByTestId('controls-copy').click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Key1 = A, 0810:e501/b0');
  expect(text).toContain('Turntable = 0810:e501/a0:rev');

  await page.getByTestId('controls-reset').click();
  await expect(chips(page, 'Key1')).toHaveText(['Z']);
  await expect(page.getByTestId('controls-row-Turntable')).not.toContainText('0810');
});
