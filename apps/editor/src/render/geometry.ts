// Where everything goes on the playfield, as pure numbers (no Pixi), so the
// layout and the pulse <-> pixel mapping can be tested.
//
// The vertical axis is EZ2PORT's: time runs up the screen toward a judge line
// near the bottom, and one beat always takes the same height - BPM changes
// never stretch the grid (ez2/scroll.c). Edit and Play differ only in how many
// pixels a beat takes.

import type { Column, LaneKind } from '@ez2bms/chart-core';
import { laneInfo } from '@ez2bms/chart-core';

/** EZ2PORT's design space is 640x480; everything scales with the height. */
export const DESIGN_H = 480;

/** Lane widths in design units, by kind (the game's proportions). */
export const LANE_W: Record<LaneKind, number> = {
  white: 30,
  blue: 26,
  scratch: 46,
  pedal: 44,
  effector: 30,
};

const GAP = 2;
const GUTTER = 70;
const OFF_W = 22;
/**
 * The background rack's proportions, BmsTWO's Classic BMS view
 * (SequenceView.cpp: BgmSubLaneWidth 14, BgmGroupGap 8, BgmLabelHeight 16).
 */
export const RACK_SUB = 14;
export const RACK_GAP = 8;
export const RACK_LABEL = 16;
/** A stem strip's width and the gap between strips (BmsTWO's wide sound column is 64). */
export const STRIP_W = 64;
const STRIP_GAP = 6;
/**
 * The rack takes the window's width beside the lanes (at least this share of
 * it); a rack wider than that first narrows its sub-lanes, to RACK_SUB_MIN,
 * and only then scrolls sideways - with many sounds, the owner could not see
 * every group (2026-09-28).
 */
const RACK_SHARE = 0.4;
export const RACK_SUB_MIN = 7;
/** The scrollbar under the group names, design units tall. */
export const RACK_BAR = 5;
/** The judge line, in design units above the bottom edge. */
const JUDGE_FROM_BOTTOM = 64;

export interface LaneGeom {
  x: number;
  kind: LaneKind;
  short: string;
  left: number;
  width: number;
  /** A lane with notes that the mode does not play (drawn dimmed). */
  offMode: boolean;
}

export interface Layout {
  width: number;
  height: number;
  /** Screen pixels per design unit. */
  scale: number;
  judgeY: number;
  field: { left: number; right: number };
  lanes: LaneGeom[];
  offLanes: LaneGeom[];
  /** Measure numbers and BPM/STOP flags. */
  gutter: { left: number; right: number };
  /** Stem strips, in order, between the lanes and the rack. */
  strips: { left: number; width: number }[];
  /** Background sounds: one column per sound group, split into sub-lanes; scrolls sideways. */
  rack: RackGeom;
  /**
   * With a game skin: the design x drawn at field.left and the skin's judge
   * line, so skin coordinates map to the screen as
   * x = field.left + (dx - x0) * scale, y = judgeY + (dy - skinJudgeY) * scale.
   */
  design: { x0: number; judgeY: number } | null;
}

export interface RackGroupGeom {
  key: string;
  /** Screen x of the group's first sub-lane (after scrolling). */
  left: number;
  width: number;
  subLanes: number;
}

export interface RackGeom {
  /** The visible window onto the rack, screen pixels. */
  left: number;
  width: number;
  /** The whole rack's width, and how far it is scrolled (screen pixels). */
  content: number;
  scroll: number;
  /** One sub-lane's width, and the label strip's height. */
  sub: number;
  labelH: number;
  groups: RackGroupGeom[];
}

/** Lane boxes from the game's skin, design units. */
export interface SkinGeometry {
  /** By bmson lane x. */
  boxes: ReadonlyMap<number, { x: number; w: number }>;
  judgeY: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  /** The mode's columns in screen order (P2 already reversed). */
  columns: readonly Column[];
  /** Lanes that hold notes but are not in the mode. */
  offModeXs: readonly number[];
  /** How many stem strips to make room for. */
  strips?: number;
  /** The rack's groups, in order, and their sub-lane counts. */
  rackGroups: readonly { key: string; subLanes: number }[];
  /** How far the rack is scrolled, design units (clamped). */
  rackScroll?: number;
  /** 0..1: how much of the rack and off-mode gutter to show (Play hides them). */
  extras: number;
  /** Lay the lanes out as the game's skin does (every column must have a box). */
  skin?: SkinGeometry | null;
}

export function computeLayout(i: LayoutInput): Layout {
  const scale = Math.max(0.6, Math.min(4, i.height / DESIGN_H));
  const boxes = i.skin && i.columns.every((c) => i.skin!.boxes.has(c.x)) ? i.skin.boxes : null;
  const x0 = boxes ? Math.min(...i.columns.map((c) => boxes.get(c.x)!.x)) : 0;
  const laneUnits = boxes
    ? Math.max(...i.columns.map((c) => boxes.get(c.x)!.x + boxes.get(c.x)!.w)) - x0
    : i.columns.reduce((w, c) => w + LANE_W[c.kind] + GAP, -GAP);
  const offUnits = i.offModeXs.length * (OFF_W + GAP) * i.extras;
  const nStrips = i.strips ?? 0;
  const stripUnits = nStrips ? (nStrips * (STRIP_W + STRIP_GAP) + 6) * i.extras : 0;
  const groups = i.rackGroups;
  const fullUnits = groups.length
    ? groups.reduce((w, g) => w + g.subLanes * RACK_SUB, 0) + RACK_GAP * (groups.length - 1)
    : 0;
  // The room beside everything else at full scale, or the share if that is more.
  const besides = GUTTER + laneUnits + 12 + offUnits + stripUnits + 12 + 16;
  const room = Math.max((RACK_SHARE * i.width) / scale, i.width / scale - besides);
  // Narrower sub-lanes before a scrollbar.
  const narrow = fullUnits > room ? Math.max(RACK_SUB_MIN / RACK_SUB, room / fullUnits) : 1;
  const contentUnits = fullUnits * narrow;
  const shownUnits = Math.min(contentUnits, room);
  const rackUnits = (shownUnits + (groups.length ? 12 : 0)) * i.extras;
  const need = GUTTER + laneUnits + 12 + offUnits + stripUnits + rackUnits + 16;
  // Shrink to fit a narrow window rather than overflow it.
  const s = Math.min(scale, i.width / Math.max(1, need));
  const fieldW = laneUnits * s;
  // Centre the lanes; push right when the gutter would not fit.
  let fieldLeft = (i.width - fieldW) / 2;
  fieldLeft = Math.max(fieldLeft, GUTTER * s);
  const extrasW = (offUnits + stripUnits + rackUnits + 12) * s;
  fieldLeft = Math.min(fieldLeft, Math.max(GUTTER * s, i.width - extrasW - fieldW - 8 * s));
  let x = fieldLeft;
  const lanes = i.columns.map((c) => {
    const b = boxes?.get(c.x);
    const g: LaneGeom = {
      x: c.x,
      kind: c.kind,
      short: c.short,
      left: b ? fieldLeft + (b.x - x0) * s : x,
      width: (b ? b.w : LANE_W[c.kind]) * s,
      offMode: false,
    };
    x += (LANE_W[c.kind] + GAP) * s;
    return g;
  });
  const fieldRight = fieldLeft + fieldW;
  x = fieldRight + 12 * s;
  const offLanes = i.offModeXs.map((lx) => {
    const info = laneInfo(lx);
    const g: LaneGeom = {
      x: lx,
      kind: info?.kind ?? 'white',
      short: info?.short ?? String(lx),
      left: x,
      width: OFF_W * s * i.extras,
      offMode: true,
    };
    x += (OFF_W + GAP) * s * i.extras;
    return g;
  });
  if (offLanes.length) x += 12 * s * i.extras;
  const strips = Array.from({ length: nStrips }, () => {
    const g = { left: x, width: STRIP_W * s * i.extras };
    x += (STRIP_W + STRIP_GAP) * s * i.extras;
    return g;
  });
  if (nStrips) x += 6 * s * i.extras;
  return {
    width: i.width,
    height: i.height,
    scale: s,
    // The game's judge line sits as far above the bottom as it does on its 480-line screen.
    judgeY: i.height - (boxes ? DESIGN_H - i.skin!.judgeY : JUDGE_FROM_BOTTOM) * s,
    field: { left: fieldLeft, right: fieldRight },
    lanes,
    offLanes,
    gutter: { left: Math.max(0, fieldLeft - GUTTER * s), right: fieldLeft - 6 * s },
    strips,
    rack: rackGeom(x, s * i.extras, narrow, groups, contentUnits, shownUnits, i.rackScroll ?? 0),
    design: boxes ? { x0, judgeY: i.skin!.judgeY } : null,
  };
}

/**
 * The neon skin's note heads. `bar` spans the lane, a short slab like the
 * game's own notes; `round` is an orb of one size in every lane, so a chord
 * reads as a row of equal dots whatever the lanes' widths, and a hold is a
 * capsule. The game skin draws notes in its own art and ignores this.
 */
export type NoteShape = 'bar' | 'round';

export const NOTE_SHAPES: readonly NoteShape[] = ['bar', 'round'];

/** Where a note's head and hold body sit in a lane, screen pixels. */
export interface NoteBox {
  /** From the lane's left edge to the head's. */
  inset: number;
  w: number;
  /** Centred on the note's line. */
  h: number;
  /** A hold body's width, centred in the lane. */
  bodyW: number;
  /** How far above or below the note's line a pointer still takes it. */
  reach: number;
}

/** A bar's height and an orb's diameter, design units. */
const BAR_H = 9;
const ORB_D = 18;

export function noteBox(shape: NoteShape, laneWidth: number, scale: number): NoteBox {
  const barH = Math.max(6, Math.round(BAR_H * scale));
  if (shape === 'round') {
    // 18 of the narrowest key's 26 keeps a gap each side; the off-mode
    // gutter's lanes are narrower still, and shrink it.
    const d = Math.max(4, Math.min(Math.round(ORB_D * scale), Math.floor(laneWidth) - 4));
    return {
      inset: (laneWidth - d) / 2,
      w: d,
      h: d,
      bodyW: Math.max(4, Math.round(d * 0.72)),
      // The bar's slack past the edge, not the bar's 0.9 of the height: an
      // orb is twice as tall, and a click that far off it would take it
      // instead of placing a note beside it.
      reach: d / 2 + 0.4 * barH,
    };
  }
  return {
    inset: 1,
    w: Math.max(4, laneWidth - 2),
    h: barH,
    bodyW: Math.max(4, Math.round(laneWidth * 0.72)),
    reach: 0.9 * barH,
  };
}

/** The lane under a screen x, if any (mode lanes, then off-mode lanes). */
export function laneAtX(l: Layout, px: number): LaneGeom | undefined {
  return (
    l.lanes.find((g) => px >= g.left && px < g.left + g.width) ??
    l.offLanes.find((g) => px >= g.left && px < g.left + g.width)
  );
}

/** Pulses <-> screen y. `pxPerBeat` is in screen pixels. */
export class Viewport {
  constructor(
    public resolution: number,
    public cursor: number,
    public pxPerBeat: number,
    public judgeY: number,
  ) {}

  yOf(pulse: number): number {
    return this.judgeY - ((pulse - this.cursor) / this.resolution) * this.pxPerBeat;
  }

  pulseOf(y: number): number {
    return this.cursor + ((this.judgeY - y) / this.pxPerBeat) * this.resolution;
  }

  /** Pulses visible between the bottom and top of a `height`-tall view. */
  visible(height: number): [number, number] {
    return [this.pulseOf(height), this.pulseOf(0)];
  }

  /** Screen pixels per pulse. */
  get pxPerPulse(): number {
    return this.pxPerBeat / this.resolution;
  }
}

function rackGeom(
  left: number,
  k: number,
  narrow: number,
  groups: readonly { key: string; subLanes: number }[],
  contentUnits: number,
  shownUnits: number,
  scrollUnits: number,
): RackGeom {
  const width = shownUnits * k;
  const content = contentUnits * k;
  const scroll = Math.max(0, Math.min(content - width, scrollUnits * k));
  let at = left - scroll;
  return {
    left,
    width,
    content,
    scroll,
    sub: RACK_SUB * narrow * k,
    labelH: RACK_LABEL * k,
    groups: groups.map((g) => {
      const width = g.subLanes * RACK_SUB * narrow * k;
      const geom = { key: g.key, left: at, width, subLanes: g.subLanes };
      at += width + RACK_GAP * narrow * k;
      return geom;
    }),
  };
}
