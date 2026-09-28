// Importing songs (the wizard, state/importer.svelte.ts): a song of the
// made-up EZ2AC folder (?game: chart-core dev/synthgame.ts) with its disc and
// eyecatch, a Shift-JIS BMS
// folder with a #RANDOM, and one written beside its BMS files. The reading
// itself is chart-core's and tested there (ez-import, bms); this is the
// path from the start screen to an open song, and what Issues then says.

import { SONGDB_TABLE_VA, synthPe } from '@ez2bms/chart-core';
import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- the ?e2e hook is the live App */
type W = Window & { __ez2bms: any };

const song = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as W).__ez2bms;
    const p = a.project;
    return {
      dir: p.dir as string,
      charts: p.charts.map((c: { file: string }) => c.file) as string[],
      key: p.sidecar.key as string,
      category: p.sidecar.category as number,
      samples: p.samples as string[],
      title: a.doc.data.info.title as string,
    };
  });

test('a song of the EZ2AC folder becomes a song folder: charts, keysounds, key, category, notes', async ({
  page,
}) => {
  await page.goto('/?e2e&game');
  await page.getByTestId('import').click();
  const w = page.getByTestId('import-wizard');
  await expect(w.getByTestId('import-song')).toHaveCount(2);
  await w.getByTestId('import-song').filter({ hasText: 'Alpha Song' }).click();
  // "alphasong" is a folder under sound/: never the new song's key.
  await expect(w.getByTestId('import-key')).toHaveText('alphasong2');
  await expect(w).toContainText('scroll-speed change');
  await w.getByTestId('import-dest').fill('/songs/Alpha Song');
  await w.getByTestId('import-go').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  await expect(w).toBeHidden();
  const s = await song(page);
  expect(s).toMatchObject({
    dir: '/songs/Alpha Song',
    key: 'alphasong2',
    category: 9,
    title: 'Alpha Song',
  });
  expect(s.charts).toEqual([
    'streetmix1p-alphasong2.bmson',
    'streetmix1p-alphasong2-hd.bmson',
    '7streetmix1p-alphasong2.bmson',
  ]);
  // The .ssf keysounds as WAVs, another song's under its folder.
  expect(s.samples).toEqual(['Beta/Bass.wav', 'kick.wav', 'pad.wav', 'snare.wav']);
  const riff = await page.evaluate(async () => {
    const b = await (window as unknown as W).__ez2bms.backend.readFile(
      '/songs/Alpha Song/kick.wav',
    );
    return String.fromCharCode(...b.subarray(0, 4));
  });
  expect(riff).toBe('RIFF');
  // The game's disc and eyecatch (system/disc, system/eyecatch) as plain BMPs,
  // named by the song file - and drawn in the song manager's Art tab.
  const art = await page.evaluate(async () => {
    const a = (window as unknown as W).__ez2bms;
    const head = async (f: string) =>
      String.fromCharCode(...(await a.backend.readFile(`/songs/Alpha Song/${f}`)).subarray(0, 2));
    return {
      disc: a.project.sidecar.disc,
      eyecatch: a.project.sidecar.eyecatch,
      heads: [await head('disc.bmp'), await head('eyecatch.bmp')],
      images: a.project.images,
    };
  });
  expect(art).toEqual({
    disc: { src: 'disc.bmp' },
    eyecatch: { src: 'eyecatch.bmp', mode: 'stretch' },
    heads: ['BM', 'BM'],
    images: ['disc.bmp', 'eyecatch.bmp'],
  });
  await page.getByTestId('open-song').click();
  await page.getByTestId('song-tab-art').click();
  for (const card of ['disc', 'eyecatch'] as const) {
    await expect(page.getByTestId(`art-${card}`)).not.toContainText('not in the song folder');
    await expect
      .poll(() =>
        page
          .getByTestId(`art-${card}`)
          .getByTestId('art-preview')
          .evaluate((c: HTMLCanvasElement) => {
            const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 16) if (d[i]! + d[i + 1]! + d[i + 2]! > 60) n++;
            return n / (d.length / 16);
          }),
      )
      .toBeGreaterThan(0.2);
  }
  await page.keyboard.press('Escape');
  // What could not come across is in Issues, until forgotten.
  await page.getByTestId('lint').click();
  const issues = page.getByTestId('issues');
  await expect(issues.locator('[data-rule="import-scroll"]')).toBeVisible();
  await expect(issues.locator('[data-rule="import-key"]')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as W).__ez2bms.commands.run('song.clearImportNotes'),
  );
  await expect(issues.locator('[data-rule="import-scroll"]')).toHaveCount(0);
});

/** テスト曲 in Shift-JIS. */
const SJIS = [0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x8b, 0xc8];
const bms = (lines: string) => [
  ...[...'#TITLE '].map((c) => c.charCodeAt(0)),
  ...SJIS,
  ...[...`\r\n${lines}`].map((c) => c.charCodeAt(0)),
];

async function stageBms(page: Page, dir: string) {
  const body =
    '#PLAYLEVEL 4\r\n#BPM 150\r\n#WAV01 kick.wav\r\n#RANDOM 2\r\n#IF 1\r\n#00111:01\r\n#ENDIF\r\n#IF 2\r\n#00112:01\r\n#ENDIF\r\n#ENDRANDOM\r\n';
  await page.evaluate(
    async ([dir, bytes]) => {
      const b = (window as unknown as W).__ez2bms.backend;
      await b.writeBytes(`${dir}/song_n.bme`, Uint8Array.from(bytes as number[]), false);
      await b.writeBytes(`${dir}/Kick.wav`, new Uint8Array(0), false);
    },
    [dir, bms(body)] as const,
  );
}

test('an executable that does not decrypt song.bin is passed over, and named when it is the only one', async ({
  page,
}) => {
  await page.goto('/?e2e&game');
  const write = (path: string, bytes: number[]) =>
    page.evaluate(
      ([path, bytes]) =>
        (window as unknown as W).__ez2bms.backend.writeBytes(
          path,
          new Uint8Array(bytes as number[]),
          false,
        ),
      [path, bytes] as const,
    );
  // Another program beside the game, listed before the real one, mapping the
  // table address with other bytes: it was taken before, and every song.bin
  // then said the wrong magic. Now it is passed over.
  await write('/game/a-launcher.exe', [
    ...synthPe([{ va: SONGDB_TABLE_VA, bytes: new Uint8Array(64).fill(0x5a) }]),
  ]);
  // No executable chosen on the EZ2PORT panel ("let EZ2PORT find it").
  await page.evaluate(() => (window as unknown as W).__ez2bms.settings.set('exe', null));
  await page.getByTestId('import').click();
  const w = page.getByTestId('import-wizard');
  await expect(w.getByTestId('import-song')).toHaveCount(2);
  // The one chosen on the EZ2PORT panel (the made-up game's) no longer holds
  // the tables, and nothing else does: it says which, and what to do. (A new
  // page: the wizard keeps the game it read.)
  await page.goto('/?e2e&game');
  await write('/game/ez2ac_unpacked.exe', [0x4d, 0x5a, 0, 0]);
  await page.getByTestId('import').click();
  await expect(w).toContainText('ez2ac_unpacked.exe');
  await expect(w).toContainText('does not decrypt song.bin');
  // "Read again" stays a button, not the list's whole height.
  const again = (await w.getByRole('button', { name: 'Read again' }).boundingBox())!;
  expect(again.height).toBeLessThan(60);
});

test('a Shift-JIS BMS folder imports with the random value chosen', async ({ page }) => {
  await page.goto('/?e2e');
  await stageBms(page, '/bms/Test Song');
  await page.getByTestId('import').click();
  const w = page.getByTestId('import-wizard');
  await w.getByTestId('import-tab-bms').click();
  await w.getByTestId('bms-dir').fill('/bms/Test Song');
  await w.getByTestId('bms-load').click();
  const row = w.locator('tr[data-file="song_n.bme"]');
  await expect(row).toContainText('テスト曲');
  await expect(row.getByTestId('bms-encoding')).toHaveValue('shift_jis');
  // #RANDOM 2: the second branch puts the note on key 2.
  await row.getByTestId('bms-random-0').selectOption('2');
  await w.getByTestId('import-dest').fill('/songs/Test Song');
  await w.getByTestId('import-go').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  const s = await song(page);
  expect(s.dir).toBe('/songs/Test Song');
  expect(s.title).toBe('テスト曲');
  expect(s.samples).toEqual(['Kick.wav']);
  const lanes = await page.evaluate(() =>
    (window as unknown as W).__ez2bms.doc.data.notes.map((n: { x: number }) => n.x),
  );
  expect(lanes).toEqual([12]);
});

test('a BMS folder can take the song beside its files, copying nothing', async ({ page }) => {
  await page.goto('/?e2e');
  await stageBms(page, '/bms/Here');
  await page.getByTestId('import').click();
  const w = page.getByTestId('import-wizard');
  await w.getByTestId('import-tab-bms').click();
  await w.getByTestId('bms-dir').fill('/bms/Here');
  await w.getByTestId('bms-load').click();
  await w.getByTestId('bms-inplace').check();
  await w.getByTestId('import-go').click();
  await expect(page.locator('[data-testid=playfield] canvas')).toBeVisible();
  const s = await song(page);
  expect(s.dir).toBe('/bms/Here');
  expect(s.charts).toEqual(['streetmix1p-.bmson'.replace('-.', `-${s.key}.`)]);
  const listed = await page.evaluate(async () =>
    ((await (window as unknown as W).__ez2bms.backend.list('/bms/Here')) as { name: string }[])
      .map((e) => e.name)
      .sort(),
  );
  expect(listed).toEqual(['Kick.wav', 'ez2bms.song.json', s.charts[0], 'song_n.bme'].sort());
});
