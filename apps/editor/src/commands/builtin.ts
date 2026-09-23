// The editor's commands. Anything a key, a button or the palette does is here.

import { SNAP_GRIDS, eraseNotes, measureStart } from '@ez2bms/chart-core';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';

const SPEED_MIN = 50;
const SPEED_MAX = 999;

export function registerBuiltins(app: App): void {
  const v = app.view;
  const hasDoc = () => !!app.doc;
  const hasSel = () => (app.doc?.selection.ids.size ?? 0) > 0;
  const snapIndex = () =>
    Math.max(
      0,
      SNAP_GRIDS.findIndex((g) => g.perMeasure === v.snap),
    );
  const stepPulses = () => ((app.doc?.resolution ?? 240) * 4) / v.snap;

  app.commands.register(
    // ---- File
    {
      id: 'file.open',
      title: 'Open song folder…',
      group: 'File',
      keys: ['Mod+O'],
      global: true,
      run: async () => {
        const dir = await app.backend.pickFolder('Open a song folder');
        if (dir) await app.openProject(dir);
      },
    },
    {
      id: 'file.save',
      title: 'Save',
      group: 'File',
      keys: ['Mod+S'],
      global: true,
      enabled: () => !!app.project,
      run: async () => {
        const n = await app.project!.saveAll();
        toast(n ? `Saved ${n} chart${n === 1 ? '' : 's'}` : 'Nothing to save', n ? 'ok' : 'info');
      },
    },
    {
      id: 'file.newSong',
      title: 'New song…',
      group: 'File',
      global: true,
      run: () => app.newSong(),
    },
    {
      id: 'chart.new',
      title: 'New chart…',
      group: 'Chart',
      keys: ['Mod+N'],
      global: true,
      enabled: () => !!app.project,
      run: () => (v.newChartOpen = true),
    },
    {
      id: 'file.close',
      title: 'Close song',
      group: 'File',
      enabled: () => !!app.project,
      run: () => app.closeProject(),
    },
    // ---- Edit
    {
      id: 'edit.undo',
      title: 'Undo',
      group: 'Edit',
      keys: ['Mod+Z'],
      global: true,
      enabled: () => !!app.doc?.canUndo,
      run: () => app.doc!.undo(),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      group: 'Edit',
      keys: ['Mod+Shift+Z', 'Mod+Y'],
      global: true,
      enabled: () => !!app.doc?.canRedo,
      run: () => app.doc!.redo(),
    },
    {
      id: 'edit.selectAll',
      title: 'Select all notes',
      group: 'Edit',
      keys: ['Mod+A'],
      enabled: hasDoc,
      run: () => {
        const d = app.doc!;
        d.setSelection(d.data.notes.map((n) => n.id));
      },
    },
    {
      id: 'edit.deselect',
      title: 'Select nothing',
      group: 'Edit',
      keys: ['Escape'],
      enabled: hasSel,
      run: () => app.doc!.setSelection([]),
    },
    {
      id: 'edit.delete',
      title: 'Delete selected notes',
      group: 'Edit',
      keys: ['Delete', 'Backspace'],
      enabled: hasSel,
      // In Classic mode a note is only un-keyed: the sound it plays stays in the background.
      run: () =>
        app.classic.on
          ? app.classic.unkey(app.doc!, app.doc!.selection.ids)
          : eraseNotes(app.doc!, app.doc!.selection.ids),
    },
    // ---- View
    {
      id: 'view.palette',
      title: 'Command palette',
      group: 'View',
      keys: ['Mod+K'],
      global: true,
      run: () => (v.paletteOpen = !v.paletteOpen),
    },
    {
      id: 'view.togglePlay',
      title: 'Switch Edit / Play view',
      group: 'View',
      keys: ['Tab'],
      enabled: hasDoc,
      run: () => (v.mode = v.mode === 'edit' ? 'play' : 'edit'),
    },
    {
      id: 'view.snapFiner',
      title: 'Finer snap',
      group: 'View',
      keys: [']'],
      run: () =>
        (v.snap = SNAP_GRIDS[Math.min(SNAP_GRIDS.length - 1, snapIndex() + 1)]!.perMeasure),
    },
    {
      id: 'view.snapCoarser',
      title: 'Coarser snap',
      group: 'View',
      keys: ['['],
      run: () => (v.snap = SNAP_GRIDS[Math.max(0, snapIndex() - 1)]!.perMeasure),
    },
    {
      id: 'view.snap',
      title: 'Snap to…',
      group: 'View',
      verb: 'snap',
      argHint: '1/16',
      run: (arg) => {
        const n = Number((arg ?? '').replace(/^1\//, ''));
        const g = SNAP_GRIDS.find((s) => s.perMeasure === n);
        if (!g) throw new Error(`snap is one of ${SNAP_GRIDS.map((s) => s.label).join(' ')}`);
        v.snap = g.perMeasure;
      },
    },
    {
      id: 'view.zoomIn',
      title: 'Zoom in',
      group: 'View',
      keys: ['Mod+=', 'Mod++'],
      global: true,
      run: () => {
        if (v.mode === 'play') v.speed = Math.min(SPEED_MAX, v.speed + 25);
        else v.zoom = Math.min(1200, v.zoom * 1.25);
      },
    },
    {
      id: 'view.zoomOut',
      title: 'Zoom out',
      group: 'View',
      keys: ['Mod+-'],
      global: true,
      run: () => {
        if (v.mode === 'play') v.speed = Math.max(SPEED_MIN, v.speed - 25);
        else v.zoom = Math.max(12, v.zoom / 1.25);
      },
    },
    {
      id: 'view.speed',
      title: 'Play speed…',
      group: 'View',
      verb: 'speed',
      argHint: '250',
      run: (arg) => {
        const n = Math.round(Number(arg) / 25) * 25;
        if (!(n >= SPEED_MIN && n <= SPEED_MAX)) throw new Error('speed is 50-999 %');
        v.speed = n;
        app.settings.set('speed', n);
      },
    },
    {
      id: 'view.side',
      title: 'Swap P1 / P2 view',
      group: 'View',
      keys: ['F2'],
      run: () => {
        v.side = v.side === 'P1' ? 'P2' : 'P1';
        app.settings.set('side', v.side);
      },
    },
    {
      id: 'view.gameSkin',
      title: 'Game skin on / off',
      group: 'View',
      enabled: () => !!app.settings.data.gameRoot,
      run: () => {
        const on = !app.settings.data.gameSkin;
        app.settings.set('gameSkin', on);
        if (on && app.skin.status.kind !== 'ready' && app.skin.status.kind !== 'loading')
          toast(app.skin.status.text, 'warn');
      },
    },
    {
      id: 'view.left',
      title: 'Show / hide sounds',
      group: 'View',
      keys: ['Mod+B'],
      global: true,
      run: () => (v.leftOpen = !v.leftOpen),
    },
    {
      id: 'view.workbench',
      title: 'Keysound workbench',
      group: 'View',
      keys: ['Mod+Shift+B'],
      global: true,
      enabled: () => !!app.project,
      run: () => (v.workbench = !v.workbench),
    },
    {
      id: 'sounds.removeUnused',
      title: 'Remove unused sounds from every chart',
      group: 'Chart',
      enabled: () => !!app.project,
      run: () => app.sounds.removeUnused(),
    },
    {
      id: 'view.inspector',
      title: 'Inspector',
      group: 'View',
      keys: ['Mod+I'],
      global: true,
      run: () => (v.right = v.right === 'inspector' ? null : 'inspector'),
    },
    {
      id: 'view.chartInfo',
      title: 'Chart info',
      group: 'View',
      keys: ['Mod+J'],
      global: true,
      run: () => (v.right = v.right === 'chart' ? null : 'chart'),
    },
    {
      id: 'view.timing',
      title: 'Timing',
      group: 'View',
      keys: ['Mod+T'],
      global: true,
      run: () => (v.right = v.right === 'timing' ? null : 'timing'),
    },
    {
      id: 'view.goto',
      title: 'Go to measure…',
      group: 'View',
      verb: 'goto',
      argHint: 'measure',
      enabled: hasDoc,
      run: (arg) => {
        const m = Number(arg);
        if (!Number.isInteger(m) || m < 0) throw new Error('goto takes a measure number');
        v.cursor = measureStart(m, app.doc!.resolution);
      },
    },
    {
      id: 'view.start',
      title: 'Go to start',
      group: 'View',
      keys: ['Home'],
      enabled: hasDoc,
      run: () => (v.cursor = 0),
    },
    {
      id: 'view.end',
      title: 'Go to last note',
      group: 'View',
      keys: ['End'],
      enabled: hasDoc,
      run: () => (v.cursor = Math.max(0, ...app.doc!.data.notes.map((n) => n.y + n.l))),
    },
    {
      id: 'view.stepUp',
      title: 'Cursor up one snap',
      group: 'View',
      keys: ['ArrowUp'],
      enabled: hasDoc,
      run: () =>
        (v.cursor = Math.floor(v.cursor / stepPulses() + 1e-9) * stepPulses() + stepPulses()),
    },
    {
      id: 'view.stepDown',
      title: 'Cursor down one snap',
      group: 'View',
      keys: ['ArrowDown'],
      enabled: hasDoc,
      run: () =>
        (v.cursor = Math.max(
          0,
          Math.ceil(v.cursor / stepPulses() - 1e-9) * stepPulses() - stepPulses(),
        )),
    },
    {
      id: 'view.measureUp',
      title: 'Cursor up one measure',
      group: 'View',
      keys: ['PageUp'],
      enabled: hasDoc,
      run: () => (v.cursor += app.doc!.resolution * 4),
    },
    {
      id: 'view.measureDown',
      title: 'Cursor down one measure',
      group: 'View',
      keys: ['PageDown'],
      enabled: hasDoc,
      run: () => (v.cursor = Math.max(0, v.cursor - app.doc!.resolution * 4)),
    },
    // ---- Chart
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `chart.select${i + 1}`,
      title: `Switch to chart ${i + 1}`,
      group: 'Chart' as const,
      keys: [`Mod+${i + 1}`],
      global: true,
      enabled: () => !!app.project?.charts[i],
      run: () => app.selectChart(i),
    })),
  );
}
