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
/** The rack never takes more than this share of the window; a wider one scrolls sideways. */
const RACK_SHARE = 0.4;
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
  const groups = i.rackGroups;
  const contentUnits = groups.length
    ? groups.reduce((w, g) => w + g.subLanes * RACK_SUB, 0) + RACK_GAP * (groups.length - 1)
    : 0;
  const shownUnits = Math.min(contentUnits, (RACK_SHARE * i.width) / scale);
  const rackUnits = (shownUnits + (groups.length ? 12 : 0)) * i.extras;
  const need = GUTTER + laneUnits + 12 + offUnits + rackUnits + 16;
  // Shrink to fit a narrow window rather than overflow it.
  const s = Math.min(scale, i.width / Math.max(1, need));
  const fieldW = laneUnits * s;
  // Centre the lanes; push right when the gutter would not fit.
  let fieldLeft = (i.width - fieldW) / 2;
  fieldLeft = Math.max(fieldLeft, GUTTER * s);
  const extrasW = (offUnits + rackUnits + 12) * s;
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
    rack: rackGeom(x, s * i.extras, groups, contentUnits, shownUnits, i.rackScroll ?? 0),
    design: boxes ? { x0, judgeY: i.skin!.judgeY } : null,
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
    sub: RACK_SUB * k,
    labelH: RACK_LABEL * k,
    groups: groups.map((g) => {
      const geom = { key: g.key, left: at, width: g.subLanes * RACK_SUB * k, subLanes: g.subLanes };
      at += geom.width + RACK_GAP * k;
      return geom;
    }),
  };
}
