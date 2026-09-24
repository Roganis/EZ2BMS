// Importing sounds into the demo song: through the file chooser and by
// dropping files on the window (the browser build stages both in its memory
// file system, as the desktop app copies from disk), and reloading a sound
// edited elsewhere.

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

/** A silent 16-bit mono WAV, `seconds` long at 44.1 kHz. */
function wav(seconds: number): number[] {
  const frames = Math.round(seconds * 44100);
  const b = new DataView(new ArrayBuffer(44 + frames * 2));
  const tag = (at: number, s: string) =>
    [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF');
  b.setUint32(4, 36 + frames * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 44100, true);
  b.setUint32(28, 88200, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  tag(36, 'data');
  b.setUint32(40, frames * 2, true);
  return [...new Uint8Array(b.buffer)];
}

async function open(page: Page) {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

const activeChannels = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as W).__ez2bms.doc.data.channels.map((c: { name: string }) => c.name),
  );
const files = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    return (await a.backend.list(a.project.dir)).map((e: { name: string }) => e.name);
  });

/** Drag files over the window and drop them, as the OS would. */
async function drop(page: Page, list: { name: string; bytes: number[] }[]) {
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([new Uint8Array(f.bytes)], f.name));
    document.body.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, list);
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([new Uint8Array(f.bytes)], f.name));
    document.body.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, list);
}

test('the file chooser imports sounds and adds them to the chart in one step', async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-sounds').click();
  await (
    await chooser
  ).setFiles([
    { name: 'vox_hey.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav(0.5)) },
    { name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('not a sound') },
  ]);
  await expect(
    page.getByText(/Imported 1 sound - 1 sound added to 5K STANDARD NM - skipped readme\.txt/),
  ).toBeVisible();
  expect(await files(page)).toContain('vox_hey.wav');
  expect(await files(page)).not.toContain('readme.txt');
  expect(await activeChannels(page)).toContain('vox_hey.wav');
  const state = await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    return {
      label: a.doc.undoLabel,
      seconds: a.audio.loadedInfo('vox_hey.wav')?.seconds,
      samples: a.project.samples,
    };
  });
  expect(state.label).toBe('Add 1 sound');
  expect(state.seconds).toBeCloseTo(0.5, 3);
  expect(state.samples).toContain('vox_hey.wav');
});

test('dropping files imports them; same bytes are reused, a clash gets a new name', async ({
  page,
}) => {
  await open(page);
  const before = await activeChannels(page);
  await drop(page, [
    { name: 'kick.wav', bytes: [] },
    { name: 'snare.wav', bytes: wav(0.3) },
    { name: 'perc_01.wav', bytes: wav(0.2) },
  ]);
  await expect(page.getByTestId('drop-zone')).toHaveCount(0);
  await expect(page.getByText(/Imported 2 sounds - 2 sounds added/)).toBeVisible();
  const names = await files(page);
  expect(names).toContain('snare (2).wav');
  expect(names).toContain('perc_01.wav');
  expect(names.filter((n) => /^kick/.test(n))).toEqual(['kick.wav']);
  const after = await activeChannels(page);
  expect(after.slice(before.length)).toEqual(['snare (2).wav', 'perc_01.wav']);
  await page.keyboard.press('Control+z');
  expect(await activeChannels(page)).toEqual(before);
});

test('reloading reads a sound edited in another program', async ({ page }) => {
  await open(page);
  const seconds = () =>
    page.evaluate(() => (window as unknown as W).__ez2bms.audio.loadedInfo('kick.wav')?.seconds);
  expect(await seconds()).toBeCloseTo(0.25, 3);
  await page.evaluate(async (bytes) => {
    const a = (window as unknown as W).__ez2bms;
    await a.backend.writeBytes(`${a.project.dir}/kick.wav`, new Uint8Array(bytes), false);
  }, wav(1.5));
  await page.keyboard.press('Control+k');
  await page.keyboard.type('reload sound');
  await page.keyboard.press('Enter');
  await expect.poll(seconds).toBeCloseTo(1.5, 3);
});
