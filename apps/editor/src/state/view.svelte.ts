// How the chart is being looked at: Edit or Play, zoom, the cursor, snap,
// side, tool. Not saved with the chart.

import type { ChannelId } from '@ez2bms/chart-core';

export type ViewMode = 'edit' | 'play';
export type Tool = 'draw' | 'select';
export type RightDrawer = 'inspector' | 'chart' | 'timing' | 'issues' | 'port';

/** EZ2PORT scrolls 1.6 px per tick at 100 %: 76.8 px per beat in its 480-line design space. */
export const ENGINE_PX_PER_BEAT = 76.8;
export const DESIGN_HEIGHT = 480;

export class View {
  mode = $state<ViewMode>('edit');
  /** Edit-mode pixels per beat, in design units (scaled with the window). */
  zoom = $state(56);
  /** Play-mode speed dial, percent (50-999 in steps of 25, as the cabinet). */
  speed = $state(250);
  /** The pulse at the judge line. */
  cursor = $state(0);
  /** Snap grid: divisions of a 4/4 measure. */
  snap = $state(16);
  side = $state<'P1' | 'P2'>('P1');
  tool = $state<Tool>('draw');
  /** The sound new notes are drawn with. */
  brush = $state<ChannelId | null>(null);
  leftOpen = $state(true);
  right = $state<RightDrawer | null>('inspector');
  paletteOpen = $state(false);
  newChartOpen = $state(false);
  playing = $state(false);
  /** Step input: the cabinet's keys place notes at the cursor. */
  stepInput = $state(false);
  /** Lane under the pointer (bmson x), for the lane header glow. */
  hoverLane = $state<number | null>(null);
  /** The keysound workbench is open over the playfield. */
  workbench = $state(false);
  /** The song manager is open over the playfield. */
  songManager = $state(false);
  /** Its page: the charts, the title plate, the disc and eyecatch, or the preview. */
  songTab = $state<'charts' | 'plate' | 'art' | 'preview'>('charts');
  /** Something covers the chart: only app-wide keys act. */
  get covered(): boolean {
    return this.workbench || this.songManager;
  }
  /** How far the background rack is scrolled sideways, design units. */
  rackScroll = $state(0);

  /** Pixels per beat in design units, for the current mode. */
  get designPxPerBeat(): number {
    return this.mode === 'play' ? (ENGINE_PX_PER_BEAT * this.speed) / 100 : this.zoom;
  }
}
