// The song's BGA: the setting, the movie a publish uses, song.ini, and lint.
// The importer's own pick is checked against EZ2PORT in bga.oracle.test.ts.

import { describe, expect, it } from 'vitest';
import { lintSong, type BgaCheck } from '../src/lint/lint';
import type { MovieInfo } from '../src/media/movie';
import { newChart } from '../src/model/defaults';
import type { ChartData } from '../src/model/types';
import { chartBga, packageBgaName, readBgaSettings, songBga } from '../src/publish/bga';
import { compileSong } from '../src/publish/package';
import { readSongIni } from '../src/publish/songini-read';
import { parseSongFile, serializeSongFile } from '../src/song/songfile';

function withBga(events: [number, number][], header: [number, string][]): ChartData {
  const c = newChart({ mode: '5k', tier: 'NM', level: 1, bpm: 120 });
  c.bga = {
    header: header.map(([id, name]) => ({ id, name })),
    bga: events.map(([y, id]) => ({ y, id })),
    layer: [],
    poor: [],
  };
  return c;
}

describe("the chart's movie, as the importer picks it", () => {
  it('is the earliest event, by the header entry with its id, at its time', () => {
    // 120 BPM at resolution 240: a beat is 500 ms.
    const c = withBga(
      [
        [960, 2],
        [480, 1],
        [480, 2],
      ],
      [
        [2, 'b.mp4'],
        [1, 'a.mp4'],
      ],
    );
    expect(chartBga(c)).toEqual({ src: 'a.mp4', startMs: 1000 });
    // A STOP before it delays it; one at its own pulse does not.
    c.stopEvents = [{ y: 240, duration: 240 }];
    expect(chartBga(c)!.startMs).toBe(1500);
    c.stopEvents = [{ y: 480, duration: 240 }];
    expect(chartBga(c)!.startMs).toBe(1000);
  });

  it('is the first header entry when no event names one, at 0 with no events', () => {
    expect(chartBga(withBga([], [[5, 'intro.webm']]))).toEqual({ src: 'intro.webm', startMs: 0 });
    expect(chartBga(withBga([[240, 9]], [[5, 'x.wmv']]))).toEqual({ src: 'x.wmv', startMs: 500 });
    expect(chartBga(withBga([], []))).toBeUndefined();
    expect(chartBga(newChart({ mode: '5k', tier: 'NM' }))).toBeUndefined();
  });
});

describe("the song's movie", () => {
  const find = (n: string) =>
    ['bga/Clip.MP4', 'other.webm'].find((p) => p.toLowerCase() === n.toLowerCase());
  const charts = [newChart({ mode: '5k', tier: 'NM' }), withBga([[480, 1]], [[1, 'bga/clip.mp4']])];

  it("follows the first chart naming one, or the song file's choice", () => {
    expect(songBga(undefined, charts, find)).toEqual({
      src: 'bga/clip.mp4',
      path: 'bga/Clip.MP4',
      startMs: 1000,
      from: 'chart',
      movie: true,
    });
    expect(songBga({ startMs: -250 }, charts, find)).toMatchObject({
      startMs: -250,
      from: 'chart',
    });
    // Another movie starts at 0 unless told otherwise; the same one keeps the event's time.
    expect(songBga({ file: 'other.webm' }, charts, find)).toMatchObject({
      path: 'other.webm',
      startMs: 0,
      from: 'song',
    });
    expect(songBga({ file: 'bga/clip.mp4' }, charts, find)).toMatchObject({ startMs: 1000 });
    expect(songBga(null, charts, find)).toBeUndefined();
    expect(songBga(undefined, [charts[0]!], find)).toBeUndefined();
    expect(songBga({ file: 'still.png' }, charts, find)).toMatchObject({
      movie: false,
      path: undefined,
    });
  });

  it('is kept in the song file, and named bga.<ext> in the package', () => {
    expect(readBgaSettings({ file: 'a.mp4', startMs: -40 })).toEqual({
      file: 'a.mp4',
      startMs: -40,
    });
    expect(readBgaSettings(null)).toBeNull();
    expect(readBgaSettings({ startMs: 1.5 })).toBeUndefined();
    expect(readBgaSettings({ file: 'a.mp4', loop: true })).toBeUndefined();
    const text = '{"key":"abc","bga":{"file":"Movie Clip.MKV","startMs":1200},"x":1}';
    const { song, warnings } = parseSongFile(text);
    expect(warnings).toEqual([]);
    expect(JSON.parse(serializeSongFile(song))).toEqual(JSON.parse(text));
    expect(serializeSongFile(parseSongFile('{"key":"abc","bga":null}').song)).toContain(
      '"bga": null',
    );
    expect(packageBgaName('Movie Clip.MKV')).toBe('bga.mkv');
    const plan = compileSong(
      { key: 'abc', title: 'T', artist: '', genre: '', bga: { file: 'bga.mkv', startMs: 1200 } },
      [{ data: newChart({ mode: '5k', tier: 'NM', level: 1 }), mode: '5k', tier: 'NM' }],
    );
    expect(readSongIni(plan.files[0]!.bytes).bga).toEqual({ file: 'bga.mkv', startMs: 1200 });
  });
});

describe('BGA lint', () => {
  const chart = {
    file: 'streetmix1p-abc.bmson',
    data: newChart({ mode: '5k', tier: 'NM', level: 3 }),
    mode: '5k' as const,
    tier: 'NM' as const,
  };
  const movie = (m: Partial<MovieInfo>): MovieInfo => ({
    container: 'mp4',
    codec: 'h264',
    width: 640,
    height: 480,
    durationMs: 60_000,
    ...m,
  });
  const found = (b: Partial<BgaCheck>) =>
    lintSong({
      key: 'abc',
      charts: [chart],
      bga: { src: 'm.mp4', path: 'm.mp4', startMs: 0, movie: true, songEndMs: 50_000, ...b },
    })
      .filter((f) => /bga|art-missing/.test(f.rule))
      .map((f) => `${f.rule}:${f.severity}`);

  it('passes a 640x480 H.264 MP4 as long as the song, and one not yet read', () => {
    expect(found({ probe: movie({}) })).toEqual([]);
    expect(found({})).toEqual([]);
  });

  it('refuses what the port cannot play, and says what it will do to the rest', () => {
    expect(found({ path: undefined })).toEqual(['art-missing:error']);
    expect(found({ movie: false, src: 'still.png' })).toEqual(['bga-not-movie:warning']);
    expect(found({ probe: { error: 'unreadable' } })).toEqual(['bga-unreadable:error']);
    expect(found({ probe: movie({ container: 'avi', codec: 'mpeg4' }) })).toEqual([
      'bga-codec:error',
    ]);
    expect(found({ probe: movie({ codec: 'hevc' }) })).toEqual(['bga-codec:error']);
    expect(found({ probe: movie({ width: 1280, height: 960 }) })).toEqual(['bga-large:warning']);
    expect(found({ probe: movie({ width: 1280, height: 720 }) })).toEqual([
      'bga-large:warning',
      'bga-aspect:info',
    ]);
    expect(found({ probe: movie({ width: 854, height: 480 }) })).toEqual(['bga-aspect:info']);
    expect(found({ probe: movie({ durationMs: 30_000 }) })).toEqual(['bga-short:warning']);
    // Starting at 25 s, a 30 s movie lasts past the song's end; no length, no judgement.
    expect(found({ startMs: 25_000, probe: movie({ durationMs: 30_000 }) })).toEqual([]);
    expect(found({ probe: movie({ durationMs: null }) })).toEqual([]);
  });
});
