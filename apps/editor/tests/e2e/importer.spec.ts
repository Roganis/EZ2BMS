// Importing songs (the wizard, state/importer.svelte.ts): a song of the
// made-up EZ2AC folder (?game: chart-core dev/synthgame.ts), a Shift-JIS BMS
// folder with a #RANDOM, and one written beside its BMS files. The reading
// itself is chart-core's and tested there (ez-import, bms); this is the
// path from the start screen to an open song, and what Issues then says.

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
