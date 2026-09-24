// Quick fixes for lint findings. Each chart fix is one transaction on one
// chart (a single Ctrl+Z undoes it) that makes its finding go away and
// changes nothing it does not have to: notes keep their sound, velocity,
// pan and kind; a note that cannot stay on its lane goes to the background,
// where it still sounds, rather than being deleted. Song fixes change the
// song file, and the editor applies them.

import { BGM } from '../edit/commands';
import type { ChartDoc, Tx } from '../edit/doc';
import type { ChartData, NoteRec } from '../model/types';
import type { ModeId } from '../modes/ids';
import { deriveSongKey } from '../modes/filenames';
import { modeDef } from '../modes/registry';
import { legacyScroll, legacyScrollIndices, scrollEventFromLegacy } from '../timing/scroll';
import { TickConverter } from '../timing/ticks';

export type ChartFixId =
  | 'snap-off-grid'
  | 'lane-duplicates-to-bgm'
  | 'drop-bgm-copies'
  | 'shorten-holds'
  | 'align-start-bpm'
  | 'clamp-level'
  | 'title-semicolon'
  | 'off-mode-to-bgm'
  | 'clear-up'
  | 'remove-unused-sounds'
  | 'lines-4-4'
  | 'scroll-legacy';

export type SongFixId = 'derive-key' | 'category-custom';

export interface Fix {
  id: ChartFixId | SongFixId;
  label: string;
}

export const isChartFix = (id: Fix['id']): id is ChartFixId =>
  id !== 'derive-key' && id !== 'category-custom';

const res = (d: ChartData) =>
  d.info.resolution && d.info.resolution > 0 ? d.info.resolution : 240;

/** Whether pulse y lands exactly on an EZ2 tick (STOP gaps counted). */
const exact = (tc: TickConverter, y: number) => y >= 0 && tc.tick(y).err < 1e-9;

/** The EZ2-exact pulse nearest y (the earlier one on a tie). */
export function nearestOnGrid(tc: TickConverter, y: number): number {
  for (let d = 0; d <= tc.resolution; d++) {
    if (exact(tc, y - d)) return y - d;
    if (exact(tc, y + d)) return y + d;
  }
  return y;
}

/** The last EZ2-exact pulse on an earlier tick than y's, or undefined. */
function lastTickBefore(tc: TickConverter, y: number): number | undefined {
  const t = tc.tick(y).tick;
  for (let p = y - 1; p >= 0 && p >= y - 2 * tc.resolution; p--)
    if (exact(tc, p) && tc.tick(p).tick < t) return p;
  return undefined;
}

/** Notes on the chart's playable lanes, by lane, in y order. */
function byLane(d: ChartData, mode: ModeId): Map<number, NoteRec[]> {
  const lanes = new Set(modeDef(mode).columns.map((c) => c.x));
  const out = new Map<number, NoteRec[]>();
  for (const n of d.notes) {
    if (!lanes.has(n.x)) continue;
    const list = out.get(n.x) ?? [];
    list.push(n);
    out.set(n.x, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.y - b.y || a.id - b.id);
  return out;
}

/** Notes on a playable lane sharing an EZ2 tick with an earlier one there. */
export function laneDuplicates(d: ChartData, mode: ModeId): NoteRec[] {
  const tc = new TickConverter(res(d), d.stopEvents);
  const out: NoteRec[] = [];
  for (const list of byLane(d, mode).values()) {
    let last: number | undefined;
    for (const n of list) {
      const t = tc.tick(n.y).tick;
      if (t === last) out.push(n);
      last = t;
    }
  }
  return out;
}

/** Holds that cover a later note on their lane, with the first note each swallows. */
export function swallowingHolds(d: ChartData, mode: ModeId): { hold: NoteRec; first: NoteRec }[] {
  const out: { hold: NoteRec; first: NoteRec }[] = [];
  for (const list of byLane(d, mode).values())
    list.forEach((h, i) => {
      if (h.l <= 0) return;
      const first = list.slice(i + 1).find((n) => n.y > h.y);
      if (first && first.y <= h.y + h.l) out.push({ hold: h, first });
    });
  return out;
}

/** Background notes repeating another note of the same sound at the same pulse. */
export function bgmCopies(d: ChartData): NoteRec[] {
  const groups = new Map<string, NoteRec[]>();
  for (const n of d.notes) {
    const k = `${n.ch}:${n.y}`;
    const g = groups.get(k) ?? [];
    g.push(n);
    groups.set(k, g);
  }
  const out: NoteRec[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const bgm = g.filter((n) => n.x === BGM).sort((a, b) => a.id - b.id);
    // A lane note sounds it already; otherwise the first background one stays.
    out.push(...(g.some((n) => n.x !== BGM) ? bgm : bgm.slice(1)));
  }
  return out;
}

/** Bar lines that are not EZ2's: a line off every fourth beat. */
export function oddLines(d: ChartData): boolean {
  const bar = 4 * res(d);
  return !!d.lines?.some((l) => l.y % bar !== 0);
}

/** Sounds no note plays. */
export function unusedSounds(d: ChartData): ChartData['channels'] {
  const used = new Set(d.notes.map((n) => n.ch));
  return d.channels.filter((c) => !used.has(c.id));
}

const LABEL: Record<ChartFixId, string> = {
  'snap-off-grid': 'Snap them to the nearest EZ2 tick',
  'lane-duplicates-to-bgm': 'Move the extra notes to the background',
  'drop-bgm-copies': 'Remove the background copies',
  'shorten-holds': 'Shorten each hold to end before the note',
  'align-start-bpm': 'Make the start BPM match',
  'clamp-level': 'Bring the level into 1-20',
  'title-semicolon': "Write ',' for ';'",
  'off-mode-to-bgm': 'Move them to the background',
  'clear-up': 'Make them ordinary notes',
  'remove-unused-sounds': 'Remove the unused sounds',
  'lines-4-4': "Use EZ2's 4/4 bar lines",
  'scroll-legacy': "Make them the chart's scroll changes",
};

export function chartFix(id: ChartFixId): Fix {
  return { id, label: LABEL[id] };
}

/**
 * Apply a fix to one chart, as one undo step. Returns whether anything
 * changed (a fix whose finding is already gone does nothing).
 */
export function fixChart(doc: ChartDoc, mode: ModeId, id: ChartFixId): boolean {
  const d = doc.data;
  const tc = new TickConverter(res(d), d.stopEvents);
  const lanes = new Set(modeDef(mode).columns.map((c) => c.x));
  let changed = false;
  const run = (fn: (tx: Tx) => void) => {
    doc.transact(`Fix: ${LABEL[id]}`, fn);
    changed = true;
  };
  switch (id) {
    case 'snap-off-grid': {
      const off = d.notes.filter((n) => !exact(tc, n.y));
      if (!off.length) break;
      run((tx) =>
        tx.patchNotes(
          off.map((n) => {
            const y = nearestOnGrid(tc, n.y);
            if (n.l <= 0) return { id: n.id, patch: { y } };
            // The end snaps too, and a hold stays at least a tick long.
            let end = nearestOnGrid(tc, n.y + n.l);
            if (end <= y) end = nearestOnGrid(tc, y + Math.ceil(tc.resolution / 48));
            return { id: n.id, patch: { y, l: Math.max(1, end - y) } };
          }),
        ),
      );
      break;
    }
    case 'lane-duplicates-to-bgm': {
      const extra = laneDuplicates(d, mode);
      if (extra.length)
        run((tx) => tx.patchNotes(extra.map((n) => ({ id: n.id, patch: { x: BGM, l: 0 } }))));
      break;
    }
    case 'drop-bgm-copies': {
      const copies = bgmCopies(d);
      if (copies.length) run((tx) => tx.deleteNotes(copies.map((n) => n.id)));
      break;
    }
    case 'shorten-holds': {
      const holds = swallowingHolds(d, mode);
      if (!holds.length) break;
      run((tx) =>
        tx.patchNotes(
          holds.map(({ hold, first }) => {
            const end = lastTickBefore(tc, first.y);
            return {
              id: hold.id,
              patch: { l: end !== undefined && end > hold.y ? end - hold.y : 0 },
            };
          }),
        ),
      );
      break;
    }
    case 'align-start-bpm': {
      // The engine takes a change at the start over the header (ChartClock).
      const at0 = d.bpmEvents
        .map((e, i) => ({ ...e, i }))
        .filter((e) => e.y <= 0 && e.bpm > 0)
        .sort((a, b) => a.y - b.y || a.i - b.i)
        .at(-1);
      if (at0 && at0.bpm !== d.info.initBpm) run((tx) => tx.setInfo({ initBpm: at0.bpm }));
      break;
    }
    case 'clamp-level': {
      const lv = d.info.level;
      const want = Math.min(20, Math.max(1, Math.round(Number.isFinite(lv) ? (lv as number) : 1)));
      if (want !== lv) run((tx) => tx.setInfo({ level: want }));
      break;
    }
    case 'title-semicolon': {
      const t = d.info.title ?? '';
      if (t.includes(';')) run((tx) => tx.setInfo({ title: t.replaceAll(';', ',') }));
      break;
    }
    case 'off-mode-to-bgm': {
      const off = d.notes.filter((n) => n.x !== BGM && !lanes.has(n.x));
      if (off.length)
        run((tx) => tx.patchNotes(off.map((n) => ({ id: n.id, patch: { x: BGM, l: 0 } }))));
      break;
    }
    case 'clear-up': {
      const ups = d.notes.filter((n) => n.up);
      if (ups.length)
        run((tx) => tx.patchNotes(ups.map((n) => ({ id: n.id, patch: { up: undefined } }))));
      break;
    }
    case 'remove-unused-sounds': {
      const gone = unusedSounds(d);
      if (gone.length) run((tx) => gone.forEach((c) => tx.deleteChannel(c.id)));
      break;
    }
    case 'lines-4-4':
      if (oddLines(d)) run((tx) => tx.setLines(null));
      break;
    case 'scroll-legacy': {
      // The kept type-6 records become scroll events with their track and
      // second word, so the cabinet still gets the same records back.
      const idx = new Set(legacyScrollIndices(d));
      if (!idx.size) break;
      const kept = d.extra.x_ez_records as unknown[];
      const moved = [...idx].map((i) => scrollEventFromLegacy(legacyScroll(kept[i])!));
      const rest = kept.filter((_, i) => !idx.has(i));
      run((tx) => {
        tx.setScrollEvents([...d.scrollEvents, ...moved]);
        tx.setRootExtra('x_ez_records', rest.length ? rest : undefined);
      });
      break;
    }
  }
  return changed;
}

/**
 * A song key for the derive-key fix: EZ2PORT's derive_key of the title,
 * else of the folder's name, else "song".
 */
export function songKeyFor(title: string, folder = ''): string {
  return deriveSongKey(title) || deriveSongKey(folder) || 'song';
}
