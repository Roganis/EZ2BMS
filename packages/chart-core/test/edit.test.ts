import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ChartDoc } from '../src/edit/doc';
import {
  addChannel,
  copyNotes,
  cycleHoldKind,
  eraseNotes,
  mirrorKeys,
  moveNotes,
  pasteNotes,
  placementConflict,
  placeNote,
  removeChannel,
  renameChannel,
  setBpmAt,
  setLane,
  setLength,
  setStopAt,
  setVelPan,
  shiftColumns,
  swapSides,
  toggleHold,
} from '../src/edit/commands';
import { newChart } from '../src/model/defaults';
import { serializeBmson } from '../src/io/bmson/serialize';
import { modeDef } from '../src/modes/registry';

function makeDoc() {
  const data = newChart({ mode: '10k', tier: 'NM' });
  data.channels.push({ id: 1, name: 'kick.wav' }, { id: 2, name: 'snare.wav' });
  return new ChartDoc(data);
}

const LANES = [0, 1, 2, 10, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25];

type Cmd =
  | { k: 'place'; x: number; y: number; l: number; ch: number }
  | { k: 'erase'; pick: number }
  | { k: 'move'; pick: number; dy: number }
  | { k: 'lane'; pick: number; x: number }
  | { k: 'shift'; pick: number; d: number }
  | { k: 'len'; pick: number; l: number }
  | { k: 'hold'; pick: number }
  | { k: 'kind'; pick: number }
  | { k: 'velpan'; pick: number; vel: number; pan: number }
  | { k: 'mirror'; pick: number }
  | { k: 'swap'; pick: number }
  | { k: 'bpm'; y: number; bpm: number | null }
  | { k: 'stop'; y: number; d: number | null }
  | { k: 'addch' }
  | { k: 'rmch'; pick: number }
  | { k: 'rename'; pick: number }
  | { k: 'copypaste'; pick: number; y: number }
  | { k: 'undo' }
  | { k: 'redo' };

const pick = fc.nat(1000);
const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  fc.record({
    k: fc.constant('place' as const),
    x: fc.constantFrom(...LANES),
    y: fc.nat(40).map((b) => b * 60),
    l: fc.constantFrom(0, 0, 120, 480),
    ch: fc.constantFrom(1, 2),
  }),
  fc.record({ k: fc.constant('erase' as const), pick }),
  fc.record({
    k: fc.constant('move' as const),
    pick,
    dy: fc.integer({ min: -4, max: 4 }).map((b) => b * 60),
  }),
  fc.record({ k: fc.constant('lane' as const), pick, x: fc.constantFrom(...LANES) }),
  fc.record({ k: fc.constant('shift' as const), pick, d: fc.constantFrom(-1, 1, 2) }),
  fc.record({ k: fc.constant('len' as const), pick, l: fc.constantFrom(0, 60, 240) }),
  fc.record({ k: fc.constant('hold' as const), pick }),
  fc.record({ k: fc.constant('kind' as const), pick }),
  fc.record({
    k: fc.constant('velpan' as const),
    pick,
    vel: fc.integer({ min: 0, max: 127 }),
    pan: fc.integer({ min: 0, max: 127 }),
  }),
  fc.record({ k: fc.constant('mirror' as const), pick }),
  fc.record({ k: fc.constant('swap' as const), pick }),
  fc.record({
    k: fc.constant('bpm' as const),
    y: fc.nat(10).map((b) => b * 240),
    bpm: fc.option(fc.integer({ min: 60, max: 300 }), { nil: null }),
  }),
  fc.record({
    k: fc.constant('stop' as const),
    y: fc.nat(10).map((b) => b * 240),
    d: fc.option(fc.constantFrom(60, 240), { nil: null }),
  }),
  fc.constant({ k: 'addch' as const }),
  fc.record({ k: fc.constant('rmch' as const), pick }),
  fc.record({ k: fc.constant('rename' as const), pick }),
  fc.record({ k: fc.constant('copypaste' as const), pick, y: fc.nat(40).map((b) => b * 60) }),
  fc.constant({ k: 'undo' as const }),
  fc.constant({ k: 'redo' as const }),
);

function run(doc: ChartDoc, c: Cmd): void {
  const notes = [...doc.index.all()];
  const some = (p: number) => (notes.length ? [notes[p % notes.length]!.id] : []);
  const mode = modeDef('10k');
  switch (c.k) {
    case 'place':
      if (doc.channel(c.ch)) placeNote(doc, { x: c.x, y: c.y, l: c.l, ch: c.ch });
      break;
    case 'erase':
      eraseNotes(doc, some(c.pick));
      break;
    case 'move':
      moveNotes(doc, some(c.pick), { dy: c.dy });
      break;
    case 'lane':
      setLane(doc, some(c.pick), c.x);
      break;
    case 'shift':
      shiftColumns(doc, some(c.pick), mode, c.d);
      break;
    case 'len':
      setLength(doc, some(c.pick), c.l);
      break;
    case 'hold':
      toggleHold(doc, some(c.pick), 240);
      break;
    case 'kind':
      cycleHoldKind(doc, some(c.pick));
      break;
    case 'velpan':
      if (notes.length) setVelPan(doc, some(c.pick), { vel: c.vel, pan: c.pan });
      break;
    case 'mirror':
      mirrorKeys(doc, some(c.pick));
      break;
    case 'swap':
      swapSides(doc, some(c.pick));
      break;
    case 'bpm':
      setBpmAt(doc, c.y, c.bpm);
      break;
    case 'stop':
      setStopAt(doc, c.y, c.d);
      break;
    case 'addch':
      addChannel(doc, `s${doc.data.channels.length}.wav`);
      break;
    case 'rmch': {
      const ch = doc.data.channels[c.pick % Math.max(1, doc.data.channels.length)];
      if (ch && doc.data.channels.length > 1) removeChannel(doc, ch.id);
      break;
    }
    case 'rename': {
      const ch = doc.data.channels[c.pick % Math.max(1, doc.data.channels.length)];
      if (ch) renameChannel(doc, ch.id, `r${c.pick}.wav`);
      break;
    }
    case 'copypaste': {
      const clip = copyNotes(doc, some(c.pick), mode);
      if (clip) pasteNotes(doc, clip, c.y, mode);
      break;
    }
    case 'undo':
      doc.undo();
      break;
    case 'redo':
      doc.redo();
      break;
  }
}

/** The chart's semantic state (ids included, order-independent). */
function state(doc: ChartDoc): string {
  const notes = [...doc.data.notes].sort((a, b) => a.id - b.id);
  return JSON.stringify({ text: serializeBmson(doc.data), notes });
}

/** Lanes stay playable: no two notes at one pulse, no note inside a hold. */
function lanesValid(doc: ChartDoc): boolean {
  for (const x of doc.index.laneKeys()) {
    if (x === 0) continue;
    const lane = doc.index.lane(x);
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1]!;
      const b = lane[i]!;
      if (a.y === b.y) return false;
    }
    for (const n of lane) {
      for (const h of lane) if (h !== n && h.l > 0 && n.y > h.y && n.y <= h.y + h.l) return false;
    }
  }
  return true;
}

describe('ChartDoc editing (model-based)', () => {
  it('keeps the index exact, the lanes legal, and undo/redo lossless', () => {
    fc.assert(
      fc.property(fc.array(cmdArb, { minLength: 1, maxLength: 60 }), (cmds) => {
        const doc = makeDoc();
        const initial = state(doc);
        for (const c of cmds) {
          run(doc, c);
          expect(doc.index.check(doc.data.notes)).toBeUndefined();
          expect(lanesValid(doc)).toBe(true);
          for (const id of doc.selection.ids) expect(doc.index.has(id)).toBe(true);
        }
        const final = state(doc);
        let undone = 0;
        while (doc.undo()) undone++;
        expect(state(doc)).toBe(initial);
        expect(doc.dirty).toBe(false);
        for (let i = 0; i < undone; i++) doc.redo();
        expect(state(doc)).toBe(final);
        expect(doc.index.check(doc.data.notes)).toBeUndefined();
      }),
      { numRuns: 150 },
    );
  });
});

describe('placement rules', () => {
  it('one note per lane per pulse, nothing inside a hold', () => {
    const doc = makeDoc();
    expect(placeNote(doc, { x: 11, y: 0, ch: 1, l: 480 })).toBeDefined();
    expect(placementConflict(doc, 11, 0, 0)).toMatch(/already/);
    expect(placementConflict(doc, 11, 240, 0)).toMatch(/inside a hold/);
    expect(placementConflict(doc, 11, 480, 0)).toMatch(/inside a hold/); // the hold's end counts
    expect(placementConflict(doc, 11, 481, 0)).toBeUndefined();
    expect(placementConflict(doc, 12, 240, 0)).toBeUndefined();
    expect(placementConflict(doc, 0, 0, 0)).toBeUndefined(); // background is unlimited
    placeNote(doc, { x: 12, y: 480, ch: 1 });
    expect(placementConflict(doc, 12, 0, 600)).toMatch(/cover/);
  });

  it('refuses a move that collides, and changes nothing', () => {
    const doc = makeDoc();
    const a = placeNote(doc, { x: 11, y: 0, ch: 1 })!;
    placeNote(doc, { x: 11, y: 240, ch: 1 });
    const before = state(doc);
    expect(moveNotes(doc, [a], { dy: 240 })).toBe(false);
    expect(state(doc)).toBe(before);
  });
});

describe('transactions, drafts and history', () => {
  it('rolls back everything when a transaction throws', () => {
    const doc = makeDoc();
    placeNote(doc, { x: 11, y: 0, ch: 1 });
    const before = state(doc);
    expect(() =>
      doc.transact('broken', (tx) => {
        tx.insertNotes([{ id: doc.newNoteId(), ch: 1, x: 12, y: 0, l: 0, c: false }]);
        tx.deleteNotes([999]);
      }),
    ).toThrow();
    expect(state(doc)).toBe(before);
    expect(doc.undoLabel).toBe('Place note');
  });

  it('a draft replaces its content on update and commits as one step', () => {
    const doc = makeDoc();
    const id = placeNote(doc, { x: 11, y: 0, ch: 1 })!;
    const draft = doc.begin('Drag');
    for (const dy of [60, 120, 180])
      draft.update((tx) => tx.patchNotes([{ id, patch: { y: dy } }]));
    expect(doc.index.get(id)!.y).toBe(180);
    draft.commit();
    expect(doc.undoLabel).toBe('Drag');
    doc.undo();
    expect(doc.index.get(id)!.y).toBe(0);
  });

  it('a cancelled draft leaves no trace', () => {
    const doc = makeDoc();
    const id = placeNote(doc, { x: 11, y: 0, ch: 1 })!;
    const draft = doc.begin('Drag');
    draft.update((tx) => tx.patchNotes([{ id, patch: { x: 13 } }]));
    draft.cancel();
    expect(doc.index.get(id)!.x).toBe(11);
    expect(doc.undoLabel).toBe('Place note');
  });

  it('merges quick edits with the same key into one undo step', () => {
    const doc = makeDoc();
    const id = placeNote(doc, { x: 11, y: 0, ch: 1 })!;
    for (const v of [10, 20, 30]) setVelPan(doc, [id], { vel: v }, 'vel');
    doc.undo();
    expect(doc.index.get(id)!.vel).toBeUndefined();
    expect(doc.undoLabel).toBe('Place note');
  });

  it('tracks the saved state', () => {
    const doc = makeDoc();
    expect(doc.dirty).toBe(false);
    placeNote(doc, { x: 11, y: 0, ch: 1 });
    expect(doc.dirty).toBe(true);
    doc.markSaved();
    expect(doc.dirty).toBe(false);
    doc.undo();
    expect(doc.dirty).toBe(true);
    doc.redo();
    expect(doc.dirty).toBe(false);
  });

  it('restores the selection on undo', () => {
    const doc = makeDoc();
    const a = placeNote(doc, { x: 11, y: 0, ch: 1 })!;
    doc.setSelection([a]);
    eraseNotes(doc, [a]);
    expect(doc.selection.ids.size).toBe(0);
    doc.undo();
    expect([...doc.selection.ids]).toEqual([a]);
  });

  it('reports what changed', () => {
    const doc = makeDoc();
    const seen: string[] = [];
    doc.onChange((cs) => seen.push([...cs.lanes].join(',') + (cs.timing ? ' timing' : '')));
    placeNote(doc, { x: 13, y: 0, ch: 1 });
    setBpmAt(doc, 960, 200);
    expect(seen).toEqual(['13', ' timing']);
  });
});

describe('commands', () => {
  it('shifts across any number of columns (no 9-lane limit)', () => {
    const doc = makeDoc();
    const id = placeNote(doc, { x: 1, y: 0, ch: 1 })!;
    const mode = modeDef('10k');
    expect(shiftColumns(doc, [id], mode, 12)).toBe(true);
    expect(doc.index.get(id)!.x).toBe(2); // turntable 1P -> turntable 2P, 12 columns right
    expect(shiftColumns(doc, [id], mode, 1)).toBe(false);
  });

  it('pastes into another mode by column, and into the same mode by lane', () => {
    const doc = makeDoc();
    const a = placeNote(doc, { x: 11, y: 0, ch: 1 })!;
    const b = placeNote(doc, { x: 25, y: 60, ch: 2 })!;
    const clip = copyNotes(doc, [a, b], modeDef('10k'))!;
    const ids = pasteNotes(doc, clip, 960, modeDef('5k'))!;
    // Lane 11 exists in 5K; lane 25 (10K column 11) does not: background.
    expect(ids.map((i) => doc.index.get(i)!.x)).toEqual([11, 0]);
    expect(ids.map((i) => doc.index.get(i)!.y)).toEqual([960, 1020]);
  });

  it('sets init_bpm for a change at the start', () => {
    const doc = makeDoc();
    setBpmAt(doc, 0, 174);
    expect(doc.data.info.initBpm).toBe(174);
    expect(doc.data.bpmEvents).toEqual([]);
  });
});
