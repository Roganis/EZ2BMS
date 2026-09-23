// docs/song-file.md's example is a song file EZ2BMS reads without a warning
// and writes back member for member: the doc cannot drift from the code.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSongFile, serializeSongFile } from '../src/song/songfile';

describe('the song file doc', () => {
  it('shows a song file EZ2BMS reads whole', () => {
    const doc = readFileSync(resolve(import.meta.dirname, '../../../docs/song-file.md'), 'utf8');
    const text = /```json\n([\s\S]*?)```/.exec(doc)![1]!;
    const { song, warnings } = parseSongFile(text);
    expect(warnings).toEqual([]);
    expect(song.extra).toEqual({});
    expect(JSON.parse(serializeSongFile(song))).toEqual(JSON.parse(text));
    // Every member the doc's table lists is in the example.
    const members = [...doc.matchAll(/^\| `(\w+)` /gm)].map((m) => m[1]);
    expect(Object.keys(JSON.parse(text))).toEqual(members);
  });
});
