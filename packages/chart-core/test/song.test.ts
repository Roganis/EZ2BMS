import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import { newChart } from '../src/model/defaults';
import {
  CATEGORIES,
  CUSTOM_CATEGORY,
  applySongMeta,
  categoryLabel,
  effectiveCategory,
  parseSongFile,
  serializeSongFile,
  songMeta,
  unreachableIn,
  validCategory,
} from '../src/song';

describe('categories', () => {
  it("are the port's 48 banks, CUSTOM last", () => {
    expect(CATEGORIES).toHaveLength(48);
    expect(CATEGORIES[0]).toEqual({ id: 1, label: 'HOT', kind: 'featured' });
    expect(CATEGORIES.find((c) => c.label === 'LV13')!.id).toBe(32);
    expect(CATEGORIES.find((c) => c.label === 'LV18+')!.id).toBe(37);
    expect(CATEGORIES.find((c) => c.label === 'ABC')!.id).toBe(38);
    expect(CATEGORIES[46]!.label).toBe('OTH');
    expect(CATEGORIES[CUSTOM_CATEGORY - 1]!.label).toBe('CUSTOM');
  });

  it('take only what song.ini can carry; anything else is CUSTOM', () => {
    for (const bad of [0, 49, -1, 3.5, '7', null, undefined])
      expect(effectiveCategory(bad)).toBe(48);
    expect(validCategory(1)).toBe(1);
    expect(validCategory(48)).toBe(48);
    expect(categoryLabel(12)).toBe('1.5-2.0');
  });

  it("know which banks a mode's pager skips", () => {
    expect(unreachableIn(31)).toEqual([]);
    expect(unreachableIn(32)).toEqual(['ruby']);
    expect(unreachableIn(37)).toEqual(['ruby', '5k-only']);
    expect(unreachableIn(38)).toEqual([]);
  });
});

describe('the song file', () => {
  it('round-trips byte for byte, unknown members kept in their place', () => {
    const text =
      '{\n  "key": "neonparade",\n  "category": 0,\n  "classic": false,\n  "x_future": [1, 2]\n}\n';
    const { song, warnings } = parseSongFile(text);
    expect(warnings).toEqual([]);
    expect(song.category).toBe(0);
    expect(song.extra).toEqual({ x_future: [1, 2] });
    const out = serializeSongFile(song);
    expect(out).toBe(serializeSongFile(parseSongFile(out).song));
    expect(JSON.parse(out)).toEqual(JSON.parse(text));
    // What EZ2BMS wrote comes back identical.
    expect(serializeSongFile(parseSongFile(out).song)).toBe(out);
  });

  it('writes known members first, in a fixed order', () => {
    const s = parseSongFile('{"zz":1,"classic":true,"id":"u1","key":"k"}').song;
    expect(Object.keys(JSON.parse(serializeSongFile(s)))).toEqual(['key', 'id', 'classic', 'zz']);
  });

  it('survives a broken file and odd types without losing them', () => {
    expect(parseSongFile('{nope').song.key).toBe('');
    expect(parseSongFile('{nope').warnings[0]).toMatch(/not valid JSON/);
    const odd = parseSongFile('{"key": 5, "classic": "yes"}');
    expect(odd.song.key).toBe('');
    expect(odd.warnings).toHaveLength(1);
    expect(JSON.parse(serializeSongFile(odd.song))).toEqual({ key: '', classic: 'yes' });
  });
});

describe('song metadata', () => {
  const chart = (tier: 'NM' | 'HD', title: string) => {
    const data = newChart({ mode: '5k', tier, level: 3, title });
    return { data, tier, doc: new ChartDoc(data) };
  };

  it("is the NM chart's, and says which fields differ", () => {
    const hd = chart('HD', 'Other');
    const nm = chart('NM', 'Song');
    nm.data.info.artist = 'A';
    hd.data.info.artist = 'A';
    const m = songMeta([hd, nm]);
    expect(m.values.title).toBe('Song');
    expect(m.differs).toEqual(['title']);
    expect(songMeta([]).values.title).toBe('');
  });

  it('is set in a chart as one undo step, and empty removes a field', () => {
    const c = chart('NM', 'Song');
    const genre = c.data.info.genre;
    expect(applySongMeta(c.doc, { title: 'New', genre: 'Trance', subtitle: '' })).toBe(true);
    expect(c.data.info.title).toBe('New');
    expect(c.data.info.genre).toBe('Trance');
    expect(c.doc.undoLabel).toBe('Song info');
    expect(applySongMeta(c.doc, { title: 'New' })).toBe(false);
    applySongMeta(c.doc, { genre: '' });
    expect('genre' in c.data.info).toBe(false);
    c.doc.undo();
    c.doc.undo();
    expect(c.data.info.title).toBe('Song');
    expect(c.data.info.genre).toBe(genre);
  });
});
