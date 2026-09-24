// Exporting (the Export dialog, state/exporter.svelte.ts): a song imported
// from the made-up EZ2AC folder (?game: chart-core dev/synthgame.ts) sent
// back into it, changed and sent again, and both exports undone; the same
// into a new folder; and the demo song as BMS. What the bytes must be is
// chart-core's and the host's to prove (cabinet-plan, cabinet.oracle,
// bms-write, gamepatch); this is the path through the dialog, read back
// with chart-core's own readers.

import { expect, test, type Page } from '@playwright/test';
import {
  convertBms,
  decodeBms,
  ez2Decrypt,
  EZ2_BME_MAP,
  EZ_NOTE,
  looksPlaintext,
  parseBms,
  parseSongdb,
  readEzff,
  songdbCrypt,
  SYNTH_EZ_TABLES,
  SYNTH_SONGDB_TABLES,
  type ModeId,
} from '@ez2bms/chart-core';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

const read = async (page: Page, path: string): Promise<Uint8Array | null> => {
  const b = await page.evaluate(async (p) => {
    const bytes = await (window as unknown as W).__ez2bms.backend.readFile(p).catch(() => null);
    return bytes ? Array.from(bytes as Uint8Array) : null;
  }, path);
  return b && Uint8Array.from(b);
};

/** Every file under a folder (dot-folders left out) and a digest of its bytes. */
const tree = (page: Page, root: string) =>
  page.evaluate(async (root) => {
    const b = (window as unknown as W).__ez2bms.backend;
    const out: Record<string, string> = {};
    const walk = async (dir: string, rel: string) => {
      for (const e of await b.list(dir)) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.is_dir) await walk(`${dir}/${e.name}`, r);
        else {
          const bytes: Uint8Array = await b.readFile(`${dir}/${e.name}`);
          const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
          out[r] = Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
        }
      }
    };
    await walk(root, '');
    return out;
  }, root);

/** The note records of a chart (the made-up game's own are plaintext; exports are not). */
const ezNotes = (bytes: Uint8Array) =>
  readEzff(looksPlaintext('ez', bytes) ? bytes : ez2Decrypt(bytes, SYNTH_EZ_TABLES.ez))
    .tracks.flatMap((t) => t.records)
    .filter((r) => r.type === EZ_NOTE).length;

const alphaLevels = async (page: Page) => {
  const bin = (await read(page, '/game/system/StreetMix/song.bin'))!;
  const db = parseSongdb(songdbCrypt(bin, SYNTH_SONGDB_TABLES));
  return db.entries.find((e) => e.key === 'alpha')!.steps.map((s) => s.level);
};

async function importAlpha(page: Page) {
  await page.goto('/?e2e&game');
  await page.getByTestId('import').click();
  const w = page.getByTestId('import-wizard');
  await w.getByTestId('import-song').filter({ hasText: 'Alpha Song' }).click();
  await w.getByTestId('import-dest').fill('/songs/Alpha Song');
  await w.getByTestId('import-go').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
}

const openExport = async (page: Page, cmd = 'file.exportCabinet') => {
  await page.evaluate((c) => (window as unknown as W).__ez2bms.commands.run(c), cmd);
  return page.getByTestId('export-dialog');
};

test('a game song goes back where it came from, changed, and both exports are undone', async ({
  page,
}) => {
  await importAlpha(page);
  const before = await tree(page, '/game');
  const original = ezNotes((await read(page, '/game/sound/alpha/streetmix1p-alpha.ez'))!);

  // Unedited: the song it came from is chosen, and only the keysound the
  // folder lacks (another song's, which the import copied in) is new.
  let d = await openExport(page);
  await expect(d.getByTestId('export-target').filter({ hasText: 'Alpha Song' })).toHaveClass(/on/);
  await expect(d.getByTestId('export-sounds')).toContainText('1 new');
  await expect(d.getByTestId('export-songdb').first()).toContainText('unchanged');
  await d.getByTestId('export-go').click();
  await expect(d.getByTestId('export-result')).toContainText('The backup is');
  const ez = (await read(page, '/game/sound/alpha/streetmix1p-alpha.ez'))!;
  expect(looksPlaintext('ez', ez)).toBe(false);
  expect(ezNotes(ez)).toBe(original);
  const once = await tree(page, '/game');
  const changed = Object.keys(once).filter((k) => once[k] !== before[k]);
  expect(changed.filter((k) => !before[k])).toEqual(['sound/alpha/Beta_Bass.ssf']);
  expect(changed.filter((k) => /\.ssf$/i.test(k) && before[k])).toEqual([]);
  expect(once['system/StreetMix/song.bin']).toBe(before['system/StreetMix/song.bin']);
  expect(await alphaLevels(page)).toEqual([3, 7, 0, 0]);
  // The song file remembers where it went.
  expect(
    await page.evaluate(() => (window as unknown as W).__ez2bms.project.sidecar.cabinet),
  ).toEqual({ key: 'alpha' });
  await d.getByRole('button', { name: 'Close' }).click();

  // HD at level 9: song.bin says so.
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const hd = a.project.charts.find((c: { tier: string }) => c.tier === 'HD');
    hd.doc.transact('level', (tx: any) => tx.setInfo({ level: 9 }));
  });
  d = await openExport(page);
  await expect(d.getByTestId('export-chart').filter({ hasText: 'HD' })).toContainText('7 → 9');
  await expect(d.getByTestId('export-sounds')).toContainText('0 new');
  await d.getByTestId('export-go').click();
  await expect(d.getByTestId('export-result')).toBeVisible();
  expect(await alphaLevels(page)).toEqual([3, 9, 0, 0]);

  // Undone, newest first: the game folder is as it was.
  await d.getByTestId('export-tab-history').click();
  await expect(d.getByTestId('backup-row')).toHaveCount(2);
  await d.getByTestId('backup-restore').first().click();
  await expect(d.getByTestId('backup-restore').first()).toHaveText('Restored');
  expect(await alphaLevels(page)).toEqual([3, 7, 0, 0]);
  await d.getByTestId('backup-restore').nth(1).click();
  await expect(d.getByTestId('backup-restore').nth(1)).toHaveText('Restored');
  expect(await tree(page, '/game')).toEqual(before);
});

test('into a new folder shaped like the game, with what each file replaces', async ({ page }) => {
  await importAlpha(page);
  const before = await tree(page, '/game');
  await page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const hd = a.project.charts.find((c: { tier: string }) => c.tier === 'HD');
    hd.doc.transact('level', (tx: any) => tx.setInfo({ level: 9 }));
  });
  const d = await openExport(page);
  await d.getByTestId('export-dest-folder').check();
  await d.getByTestId('export-folder').fill('/out/cabinet');
  await expect(d.getByTestId('export-go')).toBeEnabled();
  await d.getByTestId('export-go').click();
  await expect(d.getByTestId('export-result')).toContainText('/out/cabinet');
  const out = await tree(page, '/out/cabinet');
  expect(Object.keys(out).sort()).toEqual(
    [
      'EZ2BMS-EXPORT.txt',
      'sound/alpha/7streetmix1p-alpha.ez',
      'sound/alpha/7streetmix1p-alpha.ezi',
      'sound/alpha/Beta_Bass.ssf',
      'sound/alpha/StreetMix1p-alpha-hd.ez',
      'sound/alpha/StreetMix1p-alpha-hd.ezi',
      'sound/alpha/streetmix1p-alpha.ez',
      'sound/alpha/streetmix1p-alpha.ezi',
      'system/StreetMix/song.bin',
    ].sort(),
  );
  const note = new TextDecoder().decode((await read(page, '/out/cabinet/EZ2BMS-EXPORT.txt'))!);
  expect(note).toContain('system/StreetMix/song.bin');
  // The game folder itself is untouched.
  expect(await tree(page, '/game')).toEqual(before);
});

test('the demo song as BMS: charts that read back, and their sounds beside them', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.getByTestId('open-folder').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  const d = await openExport(page, 'file.exportBms');
  await d.getByTestId('bms-export-dest').fill('/out/bms');
  await d.getByTestId('bms-export-go').click();
  await expect(d.getByTestId('bms-export-result')).toContainText('/out/bms');
  const want: { stem: string; mode: string; notes: number }[] = await page.evaluate(() => {
    const p = (window as unknown as W).__ez2bms.project;
    return p.charts.map((c: any) => ({
      stem: c.file.replace(/\.bmson$/i, ''),
      mode: c.mode,
      notes: c.doc.data.notes.filter((n: { x: number }) => n.x).length,
    }));
  });
  const files = Object.keys(await tree(page, '/out/bms'));
  expect(files.filter((f) => /\.bm[se]$/.test(f))).toHaveLength(want.length);
  for (const w of want) {
    // Each chart's BMS is named after its bmson.
    const f = files.find((x) => x.replace(/\.bm[se]$/, '') === w.stem)!;
    expect(f, w.stem).toBeDefined();
    const text = decodeBms((await read(page, `/out/bms/${f}`))!).text;
    const back = convertBms(parseBms(text), {
      mode: w.mode as ModeId,
      map: EZ2_BME_MAP,
      resolve: (n) => n,
    });
    expect(back.data.notes.filter((n) => n.x).length).toBe(w.notes);
    // Every #WAV the chart names is in the folder.
    for (const m of text.matchAll(/^#WAV\w\w (.+)$/gim))
      expect(files.map((x) => x.toLowerCase())).toContain(m[1]!.trim().toLowerCase());
  }
});
