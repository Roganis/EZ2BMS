// Lint's quick fixes (lint/fixes.ts): each clears its finding, is one undo
// step, and undoes to exactly the chart it started from - for a hand-made
// case per rule, and for random charts full of what lint objects to.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addChannels, placeNote, setBpmAt } from '../src/edit/commands';
import { ChartDoc } from '../src/edit/doc';
import { fixChart, isChartFix, songKeyFor, type ChartFixId } from '../src/lint/fixes';
import { lintChart, lintSong, type Finding } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';
import type { ChartData } from '../src/model/types';

const FILE = 'streetmix1p-abc.bmson';

/** The chart's content, notes by id: what an undo must give back exactly. */
const state = (d: ChartData) =>
  JSON.stringify({
    info: d.info,
    notes: [...d.notes].sort((a, b) => a.id - b.id),
    channels: d.channels,
    bpm: d.bpmEvents,
    stops: d.stopEvents,
    lines: d.lines,
  });

function doc(): { doc: ChartDoc; ch: number } {
  const d = new ChartDoc(newChart({ mode: '5k', tier: 'NM', level: 3, title: 'T' }));
  const [a] = addChannels(d, ['a.wav']);
  placeNote(d, { x: 11, y: 0, ch: a!.id }, false);
  return { doc: d, ch: a!.id };
}
const lint = (d: ChartDoc) => lintChart({ file: FILE, data: d.data, mode: '5k', tier: 'NM' });

/** Apply the fix of `rule`'s finding; check it is gone, undo, check it is back. */
function fixes(d: ChartDoc, rule: string, fix: ChartFixId) {
  const before = state(d.data);
  const found = lint(d).find((f) => f.rule === rule);
  expect(found?.fix?.id, `${rule} offers ${fix}`).toBe(fix);
  expect(fixChart(d, '5k', fix)).toBe(true);
  expect(lint(d).map((f) => f.rule)).not.toContain(rule);
  expect(d.undo()).toBe(true);
  expect(state(d.data)).toBe(before);
  expect(lint(d).map((f) => f.rule)).toContain(rule);
}

describe('quick fixes', () => {
  it('snap notes and hold ends onto EZ2 ticks', () => {
    const { doc: d, ch } = doc();
    d.transact('raw', (tx) =>
      tx.insertNotes([
        { id: d.newNoteId(), ch, x: 12, y: 7, l: 0, c: false },
        { id: d.newNoteId(), ch, x: 13, y: 243, l: 118, c: false },
      ]),
    );
    fixes(d, 'off-grid', 'snap-off-grid');
    fixChart(d, '5k', 'snap-off-grid');
    // 240 pulses a beat: a tick is 5 pulses. 7 -> 5; 243 -> 245, its end 361 -> 360.
    const got = d.data.notes.filter((n) => n.ch === ch && n.y > 0).map((n) => [n.y, n.l]);
    expect(got.sort((a, b) => a[0]! - b[0]!)).toEqual([
      [5, 0],
      [245, 115],
    ]);
  });

  it('move a doubled lane note to the background; shorten a hold that covers a note', () => {
    const { doc: d, ch } = doc();
    d.transact('raw', (tx) =>
      tx.insertNotes([
        { id: d.newNoteId(), ch, x: 11, y: 2, l: 0, c: false }, // same tick as the one at 0
        { id: d.newNoteId(), ch, x: 12, y: 240, l: 480, c: false },
        { id: d.newNoteId(), ch, x: 12, y: 480, l: 0, c: false },
      ]),
    );
    fixes(d, 'lane-duplicates', 'lane-duplicates-to-bgm');
    fixes(d, 'note-in-hold', 'shorten-holds');
    fixChart(d, '5k', 'shorten-holds');
    // It ends a tick before the note it covered.
    expect(d.data.notes.find((n) => n.y === 240)!.l).toBe(235);
  });

  it('remove background copies of a sound; clear up notes; lanes 5K lacks go to the background', () => {
    const { doc: d, ch } = doc();
    d.transact('raw', (tx) =>
      tx.insertNotes([
        { id: d.newNoteId(), ch, x: 0, y: 0, l: 0, c: false },
        { id: d.newNoteId(), ch, x: 12, y: 480, l: 0, c: false, up: true },
        { id: d.newNoteId(), ch, x: 31, y: 960, l: 0, c: false },
      ]),
    );
    fixes(d, 'same-pulse-sound', 'drop-bgm-copies');
    fixes(d, 'up-notes', 'clear-up');
    fixes(d, 'off-mode', 'off-mode-to-bgm');
  });

  it('match the start BPM, bring the level into range, and the title', () => {
    const { doc: d } = doc();
    // A converted chart's start: a change at pulse 0 the header disagrees with.
    d.transact('raw', (tx) => {
      tx.setBpmEvents([{ y: 0, bpm: 180 }]);
      tx.setInfo({ initBpm: 150, level: 25, title: 'A;B' });
    });
    fixes(d, 'init-bpm', 'align-start-bpm');
    fixes(d, 'level', 'clamp-level');
    fixes(d, 'title-semicolon', 'title-semicolon');
    fixChart(d, '5k', 'title-semicolon');
    expect(d.data.info.title).toBe('A,B');
  });

  it('remove unused sounds, and bar lines EZ2 does not draw', () => {
    const { doc: d } = doc();
    addChannels(d, ['spare.wav']);
    d.transact('raw', (tx) => tx.setLines([{ y: 0 }, { y: 720 }, { y: 1440 }]));
    fixes(d, 'unused-sounds', 'remove-unused-sounds');
    fixes(d, 'lines', 'lines-4-4');
  });

  it('does nothing when its finding is gone', () => {
    const { doc: d } = doc();
    for (const id of ['snap-off-grid', 'shorten-holds', 'clamp-level', 'lines-4-4'] as const)
      expect(fixChart(d, '5k', id)).toBe(false);
    expect(d.undo()).toBe(true); // only the notes placed in doc()
  });

  it('offer song fixes for the key and the category', () => {
    const c = { file: FILE, data: doc().doc.data, mode: '5k' as const, tier: 'NM' as const };
    const fixOf = (fs: Finding[], rule: string) => fs.find((f) => f.rule === rule)?.fix?.id;
    expect(fixOf(lintSong({ key: '', charts: [c] }), 'song-key')).toBe('derive-key');
    expect(fixOf(lintSong({ key: 'abc', category: 0, charts: [c] }), 'category')).toBe(
      'category-custom',
    );
    expect(songKeyFor('Neon Parade!', 'x')).toBe('neonparade');
    expect(songKeyFor('ネオン', 'Song 7')).toBe('song7');
    expect(songKeyFor('', '')).toBe('song');
  });
});

describe('quick fixes on random charts', () => {
  const note = fc.record({
    x: fc.constantFrom(0, 11, 12, 13, 14, 15, 16, 31),
    y: fc.integer({ min: 0, max: 2000 }),
    l: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 600 })),
    up: fc.boolean(),
    ch: fc.integer({ min: 0, max: 2 }),
  });
  const chart = fc.record({
    notes: fc.array(note, { maxLength: 40 }),
    bpmAt0: fc.option(fc.integer({ min: 60, max: 240 })),
    level: fc.integer({ min: -3, max: 30 }),
    lines: fc.option(fc.array(fc.integer({ min: 0, max: 20 }).map((b) => ({ y: b * 240 })))),
    title: fc.constantFrom('T', 'A;B'),
    stop: fc.option(
      fc.record({
        y: fc.integer({ min: 0, max: 2000 }),
        duration: fc.integer({ min: 1, max: 97 }),
      }),
    ),
  });

  it('each fix takes its rule off the list (or its fix off the finding), in one undo step', () => {
    fc.assert(
      fc.property(chart, (c) => {
        const d = new ChartDoc(
          newChart({ mode: '5k', tier: 'NM', level: c.level, title: c.title }),
        );
        const chs = addChannels(d, ['a.wav', 'b.wav', 'c.wav']);
        d.transact('raw', (tx) => {
          tx.insertNotes(
            c.notes.map((n) => ({
              id: d.newNoteId(),
              ch: chs[n.ch]!.id,
              x: n.x,
              y: n.y,
              l: n.l,
              c: false,
              ...(n.up ? { up: true } : {}),
            })),
          );
          if (c.lines) tx.setLines(c.lines);
          if (c.stop) tx.setStopEvents([c.stop]);
        });
        if (c.bpmAt0) setBpmAt(d, 0, c.bpmAt0);
        // Linted afresh after each fix: one fix can clear another's finding
        // (notes snapped onto one tick, then one moved off the lane).
        const tried = new Set<string>();
        for (;;) {
          const f = lint(d).find((g) => g.fix && isChartFix(g.fix.id) && !tried.has(g.rule));
          if (!f || !f.fix || !isChartFix(f.fix.id)) break;
          tried.add(f.rule);
          const before = state(d.data);
          expect(fixChart(d, '5k', f.fix.id)).toBe(true);
          const after = lint(d).filter((g) => g.rule === f.rule);
          expect(
            after.filter((g) => g.fix?.id === f.fix!.id),
            `${f.rule} fixed`,
          ).toEqual([]);
          const fixedState = state(d.data);
          d.undo();
          expect(state(d.data), `${f.fix.id} undoes`).toBe(before);
          d.redo();
          expect(state(d.data)).toBe(fixedState);
        }
      }),
      { numRuns: 200 },
    );
  });
});
