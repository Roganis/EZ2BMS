// Classic mode for the open song (BmsTWO's Classic BMS Mode): placing a note
// keys the sound already playing there, deleting un-keys it, right-click
// splits or heals a slice. Whether it is on is saved with the song
// (ez2bms.song.json); the rules - and the promise that none of it changes
// what autoplay sounds like - are chart-core's (edit/classic.ts).

import {
  classicCandidates,
  classicCheck,
  classicHeal,
  classicKey,
  classicSplit,
  classicUnkey,
  fingerprint,
  groupKeyOf,
  resetAllToBgm,
  snapToSample,
  splitCandidates,
  type Candidate,
  type ChartDoc,
  type ClassicEnv,
  type NoteId,
  type NoteRec,
} from '@ez2bms/chart-core';
import type { App } from './app.svelte';
import { toast } from './toasts.svelte';

export class ClassicState {
  /** What a note at the pointer would key, best first. */
  cands = $state.raw<Candidate[]>([]);
  /** Which of them (Q / Shift+Q cycle). */
  index = $state(0);
  private at: { doc: ChartDoc; x: number; y: number; l: number; version: number } | undefined;
  /** Splits Classic made, per chart: un-keying one heals it rather than leaving a stray cut. */
  private readonly made = new WeakMap<ChartDoc, Set<NoteId>>();

  constructor(private readonly app: App) {}

  get on(): boolean {
    const p = this.app.project;
    return !!p && (p.sidecar.classic ?? p.classicDefault);
  }

  toggle(): void {
    const p = this.app.project;
    if (!p) return;
    p.sidecar.classic = !this.on;
    void p.saveSidecar();
    this.clear();
    toast(
      this.on
        ? 'Classic mode: placing a note keys the sound playing there'
        : 'Classic mode off: notes use the picked sound',
      'info',
    );
  }

  env(): ClassicEnv {
    return { samples: this.app.audio.lengths(), brush: this.app.view.brush };
  }

  /** Work out what a note at (x, y), `l` long, would key - only when something moved. */
  hover(doc: ChartDoc, x: number, y: number, l: number): void {
    const a = this.at;
    if (a && a.doc === doc && a.x === x && a.y === y && a.l === l && a.version === doc.version)
      return;
    const moved = !a || a.doc !== doc || a.x !== x || a.y !== y;
    this.at = { doc, x, y, l, version: doc.version };
    this.cands = classicCandidates(doc, x, y, l, this.env());
    if (moved || this.index >= this.cands.length) this.index = 0;
  }

  clear(): void {
    this.cands = [];
    this.index = 0;
    this.at = undefined;
  }

  get current(): Candidate | undefined {
    return this.cands[this.index];
  }

  cycle(d: number): void {
    const n = this.cands.length;
    if (n) this.index = (this.index + d + n) % n;
  }

  /** "stem_pad.wav (2/3) · slice", for the ghost and the status bar. */
  label(doc: ChartDoc): string {
    const c = this.current;
    if (!c) return 'nothing sounds here';
    const name = doc.channel(c.ch)?.name ?? '?';
    const of = this.cands.length > 1 ? ` (${this.index + 1}/${this.cands.length})` : '';
    return `${name}${of}${c.bad ? ' - would change the sound' : c.kind === 'split' ? ' · slice' : ''}`;
  }

  /** The note in the rack the current candidate comes from. */
  get hint(): NoteId | null {
    const c = this.current;
    return c ? (c.kind === 'note' ? c.id : c.from) : null;
  }

  private madeOf(doc: ChartDoc): Set<NoteId> {
    let s = this.made.get(doc);
    // Bookkeeping only: nothing renders from it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    if (!s) this.made.set(doc, (s = new Set()));
    return s;
  }

  /** Key the current candidate at (x, y), `l` long. */
  key(doc: ChartDoc, x: number, y: number, l: number): boolean {
    this.hover(doc, x, y, l);
    const c = this.current;
    if (!c) {
      toast('Nothing sounds there to key', 'warn');
      return false;
    }
    const r = classicKey(doc, x, y, l, c, this.env());
    if (!r.ok) {
      toast(`Can't key that: ${r.reason}`, 'warn');
      return false;
    }
    if (c.kind === 'split' && r.id !== undefined) this.madeOf(doc).add(r.id);
    this.app.view.brush = c.ch;
    this.clear();
    return true;
  }

  /** Splits made on Classic's behalf (a recorded take's): un-keying heals them too. */
  remember(doc: ChartDoc, splits: Iterable<NoteId>): void {
    const s = this.madeOf(doc);
    for (const id of splits) s.add(id);
  }

  /** Delete in Classic mode: back to the background (and heal splits Classic made). */
  unkey(doc: ChartDoc, ids: Iterable<NoteId>): void {
    const r = classicUnkey(doc, ids, { ...this.env(), healable: this.madeOf(doc) });
    if (!r.ok) toast(`Can't do that in Classic mode: ${r.reason}`, 'warn');
    this.clear();
  }

  /** Right-click: un-key a lane note, heal a split, or split what sounds at y. */
  right(doc: ChartDoc, note: NoteRec | undefined, y: number): void {
    const env = this.env();
    if (note) {
      if (note.x !== 0) return this.unkey(doc, [note.id]);
      if (!note.c) {
        toast('That is where a sound starts - Classic mode never removes one', 'warn');
        return;
      }
      const r = classicHeal(doc, note.id, env);
      if (!r.ok) toast(`Can't heal that split: ${r.reason}`, 'warn');
      return;
    }
    const c = splitCandidates(doc, y, env).find((k) => !k.bad);
    if (!c) {
      toast('Nothing sounds there to split', 'warn');
      return;
    }
    const r = classicSplit(doc, y, c, env);
    if (!r.ok) toast(`Can't split there: ${r.reason}`, 'warn');
  }

  /** Whether a drag may put notes on these lanes (same positions) without changing the sound. */
  canMove(doc: ChartDoc, targets: { id: NoteId; x: number }[]): boolean {
    const patch = targets.map((t) => ({ id: t.id, patch: { x: t.x } }));
    return classicCheck(doc, { patch }, this.env()).ok;
  }

  resetAll(doc: ChartDoc): void {
    const r = resetAllToBgm(doc, this.env());
    if (!r.ok) toast(`Can't reset: ${r.reason}`, 'warn');
    else toast(`${r.count} note${r.count === 1 ? '' : 's'} back in the background`, 'ok');
  }

  /** Snap to the picked sound's group (BmsTWO's magnet in Classic mode). */
  snap(doc: ChartDoc, p: number, within: number): number | undefined {
    const b = this.app.view.brush;
    const ch = b !== null ? doc.channel(b) : undefined;
    return ch ? snapToSample(doc, p, within, groupKeyOf(ch.name)) : undefined;
  }

  /** How the chart sounds, as a string (end-to-end tests compare it across edits). */
  fingerprint(doc: ChartDoc): string {
    return fingerprint(doc.data, this.app.audio.lengths());
  }
}
