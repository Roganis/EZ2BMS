// The song's art settings: crop geometry, the importer's choice of image for a
// song that names none, the song file members, lint and the package files.
// The pixels themselves are checked against the port in art.oracle.test.ts.

import { describe, expect, it } from 'vitest';
import { lintSong } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';
import type { ChartInfo } from '../src/model/types';
import { compileSong } from '../src/publish/package';
import { readSongIni } from '../src/publish/songini-read';
import {
  centreSquare,
  centredVisible,
  defaultEyecatch,
  eyecatchExtent,
  findImage,
  parseSongFile,
  serializeSongFile,
  songArt,
} from '../src/song';

const info = (fields: Partial<ChartInfo>): ChartInfo => ({
  ...newChart({ mode: '5k', tier: 'NM', level: 1 }).info,
  ...fields,
});

describe('crop geometry', () => {
  it("cuts the importer's centred square and a centred 4:3", () => {
    expect(centreSquare(300, 200)).toEqual({ x: 50, y: 0, w: 200, h: 200 });
    expect(centreSquare(5, 8)).toEqual({ x: 0, y: 1, w: 5, h: 5 });
    expect(centredVisible(1920, 1080)).toEqual({ x: 240, y: 0, w: 1440, h: 1080 });
    expect(centredVisible(400, 400)).toEqual({ x: 0, y: 50, w: 400, h: 300 });
  });

  it('carries a visible crop on to the whole 1024x512, rounded as ez2bms-media does', () => {
    // The Rust test's case: a 1000x750 crop covers 1600x800 of the image.
    expect(eyecatchExtent({ x: 7, y: -3, w: 1000, h: 750 })).toEqual({
      x: 7,
      y: -3,
      w: 1600,
      h: 800,
    });
    expect(eyecatchExtent({ x: 0, y: 0, w: 3, h: 3 })).toEqual({ x: 0, y: 0, w: 5, h: 3 });
  });

  it('takes art already made 2:1 whole', () => {
    expect(defaultEyecatch('a.png', 1024, 512)).toEqual({ src: 'a.png', mode: 'stretch' });
    expect(defaultEyecatch('a.png', 1601, 800)).toEqual({ src: 'a.png', mode: 'stretch' });
    expect(defaultEyecatch('a.png', 800, 600)).toEqual({
      src: 'a.png',
      mode: 'visible',
      crop: { x: 0, y: 0, w: 800, h: 600 },
    });
  });
});

describe("the song's art", () => {
  const images = ['art/Jacket.PNG', 'wide.jpg', 'back.bmp'];
  const find = (n: string) => findImage(images, n);

  it("falls back to the importer's pick, in its order", () => {
    const infos = [
      info({}),
      info({ eyecatchImage: 'art/jacket.png', titleImage: 'wide.jpg', backImage: 'back.bmp' }),
    ];
    const art = songArt({}, infos, find);
    expect(art.disc).toMatchObject({
      src: 'art/jacket.png',
      path: 'art/Jacket.PNG',
      from: 'chart',
      field: 'eyecatch_image',
      job: { kind: 'disc' },
    });
    expect(art.eyecatch).toMatchObject({
      path: 'wide.jpg',
      field: 'title_image',
      job: { kind: 'eyecatch', mode: 'stretch' },
    });
  });

  it('skips a named image that is not there, as the importer does', () => {
    const art = songArt({}, [info({ eyecatchImage: 'gone.png', backImage: 'back.bmp' })], find);
    expect(art.disc?.field).toBe('back_image');
    expect(art.eyecatch?.field).toBe('back_image');
    expect(songArt({}, [info({ eyecatchImage: 'gone.png' })], find)).toEqual({});
  });

  it("uses the song file's choice, and null means none", () => {
    const infos = [info({ eyecatchImage: 'wide.jpg' })];
    const art = songArt(
      {
        disc: { src: 'back.bmp', crop: { x: 1, y: 2, w: 3, h: 3 } },
        eyecatch: { src: 'missing.png', mode: 'stretch' },
      },
      infos,
      find,
    );
    expect(art.disc).toMatchObject({
      from: 'song',
      path: 'back.bmp',
      job: { kind: 'disc', crop: { x: 1, y: 2, w: 3, h: 3 } },
    });
    expect(art.eyecatch).toMatchObject({ from: 'song', path: undefined });
    expect(songArt({ disc: null, eyecatch: null }, infos, find)).toEqual({});
  });

  it('is linted: a missing image is an error, no disc a warning', () => {
    const c = {
      file: 'streetmix1p-abc.bmson',
      data: newChart({ mode: '5k', tier: 'NM', level: 3 }),
      mode: '5k' as const,
      tier: 'NM' as const,
    };
    const rules = (art: Parameters<typeof lintSong>[0]['art']) =>
      lintSong({ key: 'abc', charts: [c], ...(art ? { art } : {}) })
        .filter((f) => f.rule === 'art-missing' || f.rule === 'no-disc')
        .map((f) => `${f.rule}:${f.severity}`);
    expect(rules(undefined)).toEqual([]);
    expect(rules({})).toEqual(['no-disc:warning']);
    expect(rules(songArt({ disc: { src: 'nope.png' } }, [], () => undefined)).sort()).toEqual([
      'art-missing:error',
    ]);
  });
});

describe('art in the song file', () => {
  it('round-trips, in its place among the known members', () => {
    const text = serializeSongFile({
      key: 'abc',
      classic: true,
      disc: { src: 'j.png', crop: { x: -4, y: 0, w: 90, h: 90 } },
      eyecatch: { src: 'w.png', mode: 'visible', crop: { x: 0, y: 1, w: 400, h: 300 } },
      published: { root: '/s', key: 'abc' },
      extra: { later: 1 },
    });
    expect(Object.keys(JSON.parse(text))).toEqual([
      'key',
      'classic',
      'disc',
      'eyecatch',
      'published',
      'later',
    ]);
    const back = parseSongFile(text);
    expect(back.warnings).toEqual([]);
    expect(serializeSongFile(back.song)).toBe(text);
    const none = parseSongFile('{"key":"abc","disc":null}').song;
    expect(none.disc).toBeNull();
    expect(serializeSongFile(none)).toContain('"disc": null');
  });

  it('keeps a setting it cannot read as it is, and says so', () => {
    const odd =
      '{"key":"abc","disc":{"src":"j.png","crop":{"x":0,"y":0,"w":5,"h":6}},"eyecatch":{"src":"w.png","mode":"visible"}}';
    const { song, warnings } = parseSongFile(odd);
    expect(song.disc).toBeUndefined();
    expect(song.eyecatch).toBeUndefined();
    expect(warnings).toHaveLength(2);
    expect(JSON.parse(serializeSongFile(song))).toEqual(JSON.parse(odd));
  });
});

describe('art in the package', () => {
  it("is written under the importer's names and listed in [Assets]", () => {
    const plan = compileSong(
      {
        key: 'abc',
        title: 'T',
        artist: '',
        genre: '',
        discAbm: new Uint8Array([1]),
        eyecatchAbm: new Uint8Array([2]),
      },
      [{ data: newChart({ mode: '5k', tier: 'NM', level: 1 }), mode: '5k', tier: 'NM' }],
    );
    expect(plan.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['disc.abm', 'eyecatch.abm']),
    );
    const ini = readSongIni(plan.files[0]!.bytes);
    expect(ini.assets).toMatchObject({ disc: 'disc.abm', eyecatch: 'eyecatch.abm' });
  });
});
