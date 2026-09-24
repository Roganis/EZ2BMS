// The editor's commands. Anything a key, a button or the palette does is here.

import { t, tEn } from '../i18n/i18n.svelte';
import { SNAP_GRIDS, eraseNotes, measureStart } from '@ez2bms/chart-core';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';
import { baseName } from '../bridge';

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
      title: tEn('cmd.file.open'),
      group: 'File',
      keys: ['Mod+O'],
      global: true,
      run: async () => {
        const dir = await app.backend.pickFolder(t('project.pickFolder'));
        if (dir) app.leaveProject(baseName(dir), () => app.openProject(dir));
      },
    },
    {
      id: 'file.save',
      title: tEn('cmd.file.save'),
      group: 'File',
      keys: ['Mod+S'],
      global: true,
      enabled: () => !!app.project,
      run: async () => {
        const p = app.project!;
        const n = await p.saveAll();
        toast(n ? t('project.saved', { n }) : t('project.nothingToSave'), n ? 'ok' : 'info');
        // A chart whose new name the disk refused keeps its old one; say so.
        for (const f of p.renameFailures.splice(0))
          toast(t('project.keptOldName', { detail: f }), 'warn');
      },
    },
    {
      id: 'file.newSong',
      title: tEn('cmd.file.newSong'),
      group: 'File',
      global: true,
      run: () => app.newSong(),
    },
    {
      id: 'file.import',
      title: tEn('cmd.file.import'),
      group: 'File',
      global: true,
      run: () => app.importer.show(),
    },
    {
      id: 'file.exportCabinet',
      title: tEn('cmd.file.exportCabinet'),
      group: 'File',
      enabled: () => !!app.project?.charts.length,
      run: () => app.exporter.show('cabinet'),
    },
    {
      id: 'file.exportBms',
      title: tEn('cmd.file.exportBms'),
      group: 'File',
      enabled: () => !!app.project?.charts.length,
      run: () => app.exporter.show('bms'),
    },
    {
      id: 'file.exportRestore',
      title: tEn('cmd.file.exportRestore'),
      group: 'File',
      enabled: () => !!app.project,
      run: () => app.exporter.show('history'),
    },
    {
      id: 'song.clearImportNotes',
      title: tEn('cmd.song.clearImportNotes'),
      group: 'File',
      enabled: () =>
        !!app.project &&
        (app.project.importNotes.length > 0 ||
          app.project.charts.some((c) => c.importNotes.length > 0)),
      run: () => app.project!.clearImportNotes(),
    },
    {
      id: 'chart.new',
      title: tEn('cmd.chart.new'),
      group: 'Chart',
      keys: ['Mod+N'],
      global: true,
      enabled: () => !!app.project,
      run: () => (v.newChartOpen = true),
    },
    {
      id: 'file.close',
      title: tEn('cmd.file.close'),
      group: 'File',
      enabled: () => !!app.project,
      run: () => app.closeProject(),
    },
    // ---- Edit
    {
      id: 'edit.undo',
      title: tEn('cmd.edit.undo'),
      group: 'Edit',
      keys: ['Mod+Z'],
      global: true,
      enabled: () => !!app.doc?.canUndo,
      run: () => app.doc!.undo(),
    },
    {
      id: 'edit.redo',
      title: tEn('cmd.edit.redo'),
      group: 'Edit',
      keys: ['Mod+Shift+Z', 'Mod+Y'],
      global: true,
      enabled: () => !!app.doc?.canRedo,
      run: () => app.doc!.redo(),
    },
    {
      id: 'edit.selectAll',
      title: tEn('cmd.edit.selectAll'),
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
      title: tEn('cmd.edit.deselect'),
      group: 'Edit',
      keys: ['Escape'],
      enabled: hasSel,
      run: () => app.doc!.setSelection([]),
    },
    {
      id: 'edit.delete',
      title: tEn('cmd.edit.delete'),
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
      title: tEn('cmd.view.palette'),
      group: 'View',
      keys: ['Mod+K'],
      global: true,
      run: () => (v.paletteOpen = !v.paletteOpen),
    },
    {
      id: 'view.togglePlay',
      title: tEn('cmd.view.togglePlay'),
      group: 'View',
      keys: ['Tab'],
      enabled: hasDoc,
      run: () => (v.mode = v.mode === 'edit' ? 'play' : 'edit'),
    },
    {
      id: 'view.snapFiner',
      title: tEn('cmd.view.snapFiner'),
      group: 'View',
      keys: [']'],
      run: () =>
        (v.snap = SNAP_GRIDS[Math.min(SNAP_GRIDS.length - 1, snapIndex() + 1)]!.perMeasure),
    },
    {
      id: 'view.snapCoarser',
      title: tEn('cmd.view.snapCoarser'),
      group: 'View',
      keys: ['['],
      run: () => (v.snap = SNAP_GRIDS[Math.max(0, snapIndex() - 1)]!.perMeasure),
    },
    {
      id: 'view.snap',
      title: tEn('cmd.view.snap'),
      group: 'View',
      verb: 'snap',
      argHint: '1/16',
      run: (arg) => {
        const n = Number((arg ?? '').replace(/^1\//, ''));
        const g = SNAP_GRIDS.find((s) => s.perMeasure === n);
        if (!g)
          throw new Error(
            t('app.snapArg', { verb: 'snap', grids: SNAP_GRIDS.map((s) => s.label).join(' ') }),
          );
        v.snap = g.perMeasure;
      },
    },
    {
      id: 'view.zoomIn',
      title: tEn('cmd.view.zoomIn'),
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
      title: tEn('cmd.view.zoomOut'),
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
      title: tEn('cmd.view.speed'),
      group: 'View',
      verb: 'speed',
      argHint: '250',
      run: (arg) => {
        const n = Math.round(Number(arg) / 25) * 25;
        if (!(n >= SPEED_MIN && n <= SPEED_MAX))
          throw new Error(t('app.speedArg', { verb: 'speed' }));
        v.speed = n;
        app.settings.set('speed', n);
      },
    },
    {
      id: 'view.side',
      title: tEn('cmd.view.side'),
      group: 'View',
      keys: ['F2'],
      run: () => {
        v.side = v.side === 'P1' ? 'P2' : 'P1';
        app.settings.set('side', v.side);
      },
    },
    {
      id: 'view.gameSkin',
      title: tEn('cmd.view.gameSkin'),
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
      title: tEn('cmd.view.left'),
      group: 'View',
      keys: ['Mod+B'],
      global: true,
      run: () => (v.leftOpen = !v.leftOpen),
    },
    {
      id: 'view.workbench',
      title: tEn('cmd.view.workbench'),
      group: 'View',
      keys: ['Mod+Shift+B'],
      global: true,
      enabled: () => !!app.project,
      run: () => {
        v.workbench = !v.workbench;
        if (v.workbench) v.songManager = false;
      },
    },
    {
      id: 'view.songManager',
      title: tEn('cmd.view.songManager'),
      group: 'View',
      keys: ['Mod+Shift+L'],
      global: true,
      enabled: () => !!app.project,
      run: () => {
        v.songManager = !v.songManager;
        if (v.songManager) v.workbench = false;
      },
    },
    {
      id: 'sounds.import',
      title: tEn('cmd.sounds.import'),
      group: 'Chart',
      enabled: () => !!app.project,
      run: () => app.sounds.importPicked(),
    },
    {
      id: 'sounds.reload',
      title: tEn('cmd.sounds.reload'),
      group: 'Chart',
      enabled: () => !!app.project,
      run: async () => {
        await app.audio.reload(app.project!);
        toast(t('sounds.reloaded'), 'ok');
      },
    },
    {
      id: 'sounds.removeUnused',
      title: tEn('cmd.sounds.removeUnused'),
      group: 'Chart',
      enabled: () => !!app.project,
      run: () => app.sounds.removeUnused(),
    },
    {
      id: 'app.preferences',
      title: tEn('cmd.app.preferences'),
      group: 'File',
      keys: ['Mod+,'],
      global: true,
      run: () => (app.prefsOpen = true),
    },
    {
      id: 'help.about',
      title: tEn('cmd.help.about'),
      group: 'Help',
      global: true,
      run: () => (app.diag.aboutOpen = true),
    },
    {
      id: 'help.updates',
      title: tEn('cmd.help.updates'),
      group: 'Help',
      global: true,
      enabled: () => app.updates.unsupported !== 'no-key',
      run: () => app.updates.check(true),
    },
    {
      id: 'help.report',
      title: tEn('cmd.help.report'),
      group: 'Help',
      global: true,
      run: () => app.diag.copyReport(),
    },
    {
      id: 'help.logs',
      title: tEn('cmd.help.logs'),
      group: 'Help',
      global: true,
      run: () => app.backend.diag.revealLogs(),
    },
    {
      id: 'view.inspector',
      title: tEn('cmd.view.inspector'),
      group: 'View',
      keys: ['Mod+I'],
      global: true,
      run: () => (v.right = v.right === 'inspector' ? null : 'inspector'),
    },
    {
      id: 'view.chartInfo',
      title: tEn('cmd.view.chartInfo'),
      group: 'View',
      keys: ['Mod+J'],
      global: true,
      run: () => (v.right = v.right === 'chart' ? null : 'chart'),
    },
    {
      id: 'view.timing',
      title: tEn('cmd.view.timing'),
      group: 'View',
      keys: ['Mod+T'],
      global: true,
      run: () => (v.right = v.right === 'timing' ? null : 'timing'),
    },
    {
      id: 'view.goto',
      title: tEn('cmd.view.goto'),
      group: 'View',
      verb: 'goto',
      argHint: 'measure',
      enabled: hasDoc,
      run: (arg) => {
        const m = Number(arg);
        if (!Number.isInteger(m) || m < 0) throw new Error(t('app.gotoArg', { verb: 'goto' }));
        v.cursor = measureStart(m, app.doc!.resolution);
      },
    },
    {
      id: 'view.start',
      title: tEn('cmd.view.start'),
      group: 'View',
      keys: ['Home'],
      enabled: hasDoc,
      run: () => (v.cursor = 0),
    },
    {
      id: 'view.end',
      title: tEn('cmd.view.end'),
      group: 'View',
      keys: ['End'],
      enabled: hasDoc,
      run: () => (v.cursor = Math.max(0, ...app.doc!.data.notes.map((n) => n.y + n.l))),
    },
    {
      id: 'view.stepUp',
      title: tEn('cmd.view.stepUp'),
      group: 'View',
      keys: ['ArrowUp'],
      enabled: hasDoc,
      run: () =>
        (v.cursor = Math.floor(v.cursor / stepPulses() + 1e-9) * stepPulses() + stepPulses()),
    },
    {
      id: 'view.stepDown',
      title: tEn('cmd.view.stepDown'),
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
      title: tEn('cmd.view.measureUp'),
      group: 'View',
      keys: ['PageUp'],
      enabled: hasDoc,
      run: () => (v.cursor += app.doc!.resolution * 4),
    },
    {
      id: 'view.measureDown',
      title: tEn('cmd.view.measureDown'),
      group: 'View',
      keys: ['PageDown'],
      enabled: hasDoc,
      run: () => (v.cursor = Math.max(0, v.cursor - app.doc!.resolution * 4)),
    },
    // ---- Chart
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `chart.select${i + 1}`,
      title: tEn('app.switchChart', { n: i + 1 }),
      group: 'Chart' as const,
      keys: [`Mod+${i + 1}`],
      global: true,
      enabled: () => !!app.project?.charts[i],
      run: () => app.selectChart(i),
    })),
  );
}
