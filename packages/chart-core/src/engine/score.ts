// EZ2PORT's judgement and scoring (ez2/score.c), transcribed. Everything the
// editor's Play mode reports - KOOL/COOL/GOOD/FAIL/MISS, combo, gauge, score,
// rate, grade, hold instalments - comes from here, and the oracle test replays
// random scripts through both this and the engine's own code.
//
// Details that matter and are kept exactly:
// - windows are in ticks of 1/192 beat at the note's BPM, boundaries inclusive;
// - FAIL is the band between GOOD and MISS; MISS is only a note never pressed;
// - the gauge is f32 and stays dead once it reaches zero;
// - the two negative gauge rates are "crossed" against their .ini names
//   (FAIL costs `Miss`, MISS costs `Fail`);
// - a hold pays instalments by its kind while held, FAIL while released.

import type { SongIni } from './songini';

export enum J {
  NONE = 0,
  KOOL = 1,
  COOL = 2,
  GOOD = 3,
  FAIL = 4,
  MISS = 5,
}

export const J_NAMES: Record<J, string> = {
  [J.NONE]: '-',
  [J.KOOL]: 'KOOL',
  [J.COOL]: 'COOL',
  [J.GOOD]: 'GOOD',
  [J.FAIL]: 'FAIL',
  [J.MISS]: 'MISS',
};

export enum ScoreModel {
  KEYS = 0,
  CATCH = 1,
  CV2 = 2,
  KEYS_ALT = 3,
}

export const TICKS_PER_JUDGE_BEAT = 192;
export const GAUGE_MAX = 100;
export const HOLD_LANES = 24;
export const HOLD_MIXSTYLE7 = 1;
export const HOLD_OPTION_NEG = 2;

const f = Math.fround;
const idiv = (a: number, b: number) => Math.trunc(a / b);

/** Milliseconds per judge tick (1/192 beat) at a BPM. */
export function tickMs(bpm: number): number {
  const b = bpm > 0 ? bpm : 120.0;
  return 60000.0 / (TICKS_PER_JUDGE_BEAT * b);
}

export function judge(dtTicks: number, ini: SongIni): J {
  const adt = dtTicks < 0 ? -dtTicks : dtTicks;
  if (adt <= ini.kool) return J.KOOL;
  if (adt <= ini.cool) return J.COOL;
  if (adt <= ini.good) return J.GOOD;
  if (adt <= ini.miss) return J.FAIL;
  return J.NONE;
}

export function judgeMs(dtMs: number, bpm: number, ini: SongIni): J {
  return judge(dtMs / tickMs(bpm), ini);
}

interface HoldLane {
  active: boolean;
  held: boolean;
  kind: number;
  /** Game grade 1..5 (5 = KOOL). */
  grade: number;
  owed: number;
  due: number;
  step: number;
}

const gameGrade = (j: J) => 6 - j;
const portGrade = (g: number) => (6 - g) as J;

export function scoreValue(j: J): number {
  return j === J.KOOL ? 300 : j === J.COOL ? 150 : j === J.GOOD ? 41 : 0;
}

export function scoreValueAlt(j: J): number {
  return j === J.KOOL ? 170 : j === J.COOL ? 100 : j === J.GOOD ? 40 : 0;
}

export function catchNoteValue(combo: number): number {
  if (combo < 1) return 0;
  // `(log10(combo) * 0.2f) * -250.0f` in C is double arithmetic (the floats promote).
  return 250 - Math.trunc(Math.log10(combo) * f(0.2) * -250);
}

export function cv2Multiplier(combo: number): number {
  let c = combo;
  if (c >= 1500) c = 1499;
  if (c < 2) return 1;
  return f(1.0 + Math.log10(c) / 3.0);
}

export function cv2NoteValue(j: J, combo: number): number {
  const base = j === J.KOOL ? 170 : j === J.COOL ? 100 : j === J.GOOD ? 40 : 0;
  if (!base) return 0;
  return Math.trunc(f(base * cv2Multiplier(combo)));
}

export function scoreMaxFor(model: ScoreModel, notes: number): number {
  if (model === ScoreModel.CATCH) {
    let t = 0;
    for (let i = 0; i < notes; i++) t += catchNoteValue(i + 1);
    return t;
  }
  if (model === ScoreModel.CV2) {
    let t = 0;
    for (let i = 0; i < notes; i++) t += cv2NoteValue(J.KOOL, i);
    return t;
  }
  return notes * 300;
}

export function holdStep(kind: number, ticksPerMeasure: number, rawLen: number): number {
  const beat = idiv(ticksPerMeasure || 192, 4);
  if (kind >= 7 && kind <= 12) return 0;
  switch (kind) {
    case 1:
      return idiv(beat, 2);
    case 2:
      return idiv(beat, 8);
    case 3:
      return idiv(beat, 16);
    case 4:
    case 5:
      return rawLen;
    default:
      return idiv(beat, 4);
  }
}

export function holdInstalments(kind: number, tpm: number, rawLen: number, flags = 0): number {
  const step = holdStep(kind, tpm, rawLen);
  if (step === 0) return 0;
  let n = Math.floor(rawLen / step);
  if (flags & HOLD_MIXSTYLE7) {
    // plain quotient
  } else if (!(flags & HOLD_OPTION_NEG)) n -= kind !== 6 ? 1 : 0;
  else if (kind !== 6) n = 0;
  if (n <= 0) n = 1;
  return n;
}

/** What the engine counts a note record as (head + instalments), for the maximum and the rate. */
export function noteCounted(kind: number, tpm: number, rawLen: number, flags = 0): number {
  let beat = idiv(tpm || 192, 4);
  let n = 0;
  if (!(kind >= 9 && kind <= 12)) n = 1;
  if (kind >= 7 && kind <= 12) return n;
  if (flags & (HOLD_MIXSTYLE7 | HOLD_OPTION_NEG) || kind === 6) {
    return n + (rawLen > 6 && kind === 6 ? 1 : 0);
  }
  if (rawLen <= 6) return n;
  beat *= 4;
  let step: number;
  switch (kind) {
    case 1:
      step = idiv(beat, 2);
      break;
    case 2:
      step = idiv(beat, 8);
      break;
    case 3:
      step = idiv(beat, 16);
      break;
    case 4:
      step = idiv(beat, 32);
      break;
    default:
      step = idiv(beat, 4);
  }
  if (step === 0) return n;
  let q = Math.floor((rawLen * 4) / step) - 1;
  if (q <= 0) q = 1;
  return n + q;
}

export function scoreRank(ratePct: number): number {
  const steps = [100, 98, 95, 93, 90, 85, 80, 70, 60, 50];
  const i = steps.findIndex((s) => ratePct >= s);
  return i < 0 ? 0 : 10 - i;
}

export const RANK_NAMES = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'S1', 'S2', 'S3', 'S4'];

export class Score {
  counts = [0, 0, 0, 0, 0, 0];
  notes = 0;
  combo = 0;
  maxCombo = 0;
  score = 0;
  gauge: number;
  gaugeMax: number;
  failed = false;
  model: ScoreModel = ScoreModel.KEYS;
  cv2Started = false;
  holdFlags = 0;
  holdThreshold = 4;
  lastHoldGrade: J = J.NONE;
  holdPaid = 0;
  readonly holds: HoldLane[] = Array.from({ length: HOLD_LANES }, () => ({
    active: false,
    held: false,
    kind: 0,
    grade: 0,
    owed: 0,
    due: 0,
    step: 0,
  }));
  /** Called for every hold instalment paid, with its lane, for UI effects. */
  onInstalment?: (j: J, lane: number) => void;

  constructor(gaugeStart = GAUGE_MAX, gaugeMax = GAUGE_MAX) {
    this.gaugeMax = gaugeMax > 0 ? f(gaugeMax) : GAUGE_MAX;
    this.gauge = f(Math.min(gaugeStart, this.gaugeMax));
  }

  /** ez2_score_commit. */
  commit(j: J, count: number, flag: boolean, ini: SongIni): void {
    if (j <= J.NONE || j > J.MISS) return;
    if (count <= 0) return;
    this.counts[j]!++;
    this.notes++;
    let delta = 0;
    switch (j) {
      case J.KOOL:
        delta = ini.gaugeKool;
        break;
      case J.COOL:
        delta = ini.gaugeCool;
        break;
      case J.GOOD:
        delta = ini.gaugeGood;
        break;
      case J.FAIL:
        delta = ini.gaugeMiss;
        break;
      case J.MISS:
        delta = ini.gaugeFail;
        break;
    }
    if (j === J.KOOL || j === J.COOL || j === J.GOOD) {
      const builds = this.model !== ScoreModel.CV2 || j !== J.GOOD;
      if (builds && flag) {
        if (this.model === ScoreModel.CV2 && !this.cv2Started) {
          this.cv2Started = true;
          this.combo = count - 1;
        } else {
          this.combo += count;
        }
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      }
      if (this.model === ScoreModel.CATCH) this.score += catchNoteValue(this.combo);
      else if (this.model === ScoreModel.CV2) this.score += cv2NoteValue(j, this.combo);
      else if (this.model === ScoreModel.KEYS_ALT) this.score += scoreValueAlt(j);
      else this.score += scoreValue(j);
    } else if (flag) {
      this.combo = 0;
      this.cv2Started = false;
    }
    if (this.gauge > 0) {
      this.gauge = f(this.gauge + delta);
      if (this.gauge > this.gaugeMax) this.gauge = this.gaugeMax;
      if (this.gauge <= 0) {
        this.gauge = 0;
        this.failed = true;
      }
    }
  }

  apply(j: J, ini: SongIni): void {
    this.commit(j, 1, true, ini);
  }

  /** ez2_score_hold_press: pay the head, then start the hold (lane = column index). */
  holdPress(
    lane: number,
    j: J,
    rawLen: number,
    startTick: number,
    kind: number,
    tpm: number,
    ini: SongIni,
  ): void {
    if (j <= J.NONE || j > J.MISS) return;
    this.commit(j, 1, true, ini);
    if (lane < 0 || lane >= HOLD_LANES) return;
    const h = this.holds[lane]!;
    if (kind >= 7 && kind <= 12) {
      h.kind = kind;
      return;
    }
    if (holdStep(kind, tpm, rawLen) === 0) return;
    let g = gameGrade(j);
    if (!(this.holdFlags & HOLD_OPTION_NEG) && kind !== 6) {
      if (g === 4) g = 5;
    } else {
      if (g === 4) g = 5;
      if (g !== 5) return;
    }
    h.active = true;
    h.held = true;
    h.kind = kind;
    h.grade = g;
    h.owed = holdInstalments(kind, tpm, rawLen, this.holdFlags);
    h.due = startTick;
    h.step = holdStep(kind, tpm, rawLen);
  }

  setHeld(lane: number, held: boolean): void {
    if (lane < 0 || lane >= HOLD_LANES) return;
    this.holds[lane]!.held = held;
  }

  private pay(g: number, ini: SongIni, lane: number): void {
    const j = portGrade(g);
    this.commit(j, 1, true, ini);
    this.lastHoldGrade = j;
    this.holdPaid++;
    this.onInstalment?.(j, lane);
  }

  private pump(h: HoldLane, lane: number, now: number, ini: SongIni): void {
    if (h.grade < 3) {
      if (!(this.holdFlags & HOLD_OPTION_NEG)) h.grade = 3;
      return;
    }
    const due = h.due + h.step;
    if (now <= due) return;
    h.due = due;
    if (h.kind === 6) {
      if (h.owed === 1 && h.grade === 5) this.pay(5, ini, lane);
    } else {
      this.pay(h.grade, ini, lane);
    }
    h.owed -= 1;
  }

  private tick(h: HoldLane, lane: number, now: number, ini: SongIni): void {
    const due = h.due + h.step;
    if (now <= due) return;
    h.due = due;
    if (h.kind === 6) {
      const owed = h.owed;
      let g: number;
      if (owed >= 1 && owed <= 2) {
        if (h.grade === 5) {
          const late = (now - due) * 4;
          const window = (h.step * 4 * 4) >>> 6;
          g = owed === 1 ? (late < window ? 3 : 4) : late < window ? 2 : 3;
        } else {
          g = 3;
        }
      } else {
        g = 2;
      }
      h.grade = g;
      this.pay(g, ini, lane);
      h.owed = 0;
      return;
    }
    if (h.grade >= 3) h.grade = 2;
    this.pay(h.grade, ini, lane);
    h.owed -= 1;
  }

  /** ez2_score_hold_advance, with the song position in chart ticks. */
  holdAdvance(nowTick: number, ini: SongIni): void {
    this.holds.forEach((h, lane) => {
      if (!h.active) return;
      if (h.owed <= 0) {
        h.active = false;
        h.owed = 0;
        return;
      }
      if (h.kind >= 7 && h.kind <= 12) return;
      if (h.held) this.pump(h, lane, nowTick, ini);
      else this.tick(h, lane, nowTick, ini);
      if (h.owed <= 0) {
        h.active = false;
        h.owed = 0;
      }
    });
  }

  holdPending(): number {
    return this.holds.reduce((n, h) => n + (h.active ? h.owed : 0), 0);
  }

  maxFor(notes: number): number {
    return scoreMaxFor(this.model, notes);
  }

  rate(notes: number): number {
    const max = this.maxFor(notes);
    return max <= 0 ? 0 : (this.score / max) * 100.0;
  }

  rankHits(notes: number): number {
    if (notes <= 0) return 0;
    const pct = ((this.counts[J.KOOL]! + this.counts[J.COOL]!) / notes) * 100.0;
    const steps = [95, 90, 80, 70, 60, 50];
    const i = steps.findIndex((s) => pct >= s);
    return i < 0 ? 0 : 6 - i;
  }

  grade(notes: number): number {
    return this.model === ScoreModel.CV2 ? this.rankHits(notes) : scoreRank(this.rate(notes));
  }

  gradeName(g: number): string {
    if (this.model === ScoreModel.CV2) return ['F', 'E', 'D', 'C', 'B', 'A', 'S'][g] ?? '?';
    return RANK_NAMES[g] ?? '?';
  }
}
