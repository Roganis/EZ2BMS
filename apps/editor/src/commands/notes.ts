// Commands that change notes and timing.

import {
  copyNotes,
  cycleHoldKind,
  eraseNotes,
  mirrorKeys,
  modeDef,
  moveNotes,
  pasteNotes,
  setBpmAt,
  setScrollAt,
  setStopAt,
  shiftColumns,
  swapSides,
  toggleHold,
} from '@ez2bms/chart-core';
import { t, tEn, type MessageKey } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';

export function registerNoteCommands(app: App): void {
  const v = app.view;
  const hasSel = () => (app.doc?.selection.ids.size ?? 0) > 0;
  const sel = () => app.doc!.selection.ids;
  const step = () => ((app.doc?.resolution ?? 240) * 4) / v.snap;
  const cursorSnapped = () => Math.round(v.cursor / step()) * step();
  const mode = () => modeDef(app.slot!.mode);
  const refused = (ok: boolean, why: MessageKey) => {
    if (!ok) toast(t(why), 'warn');
  };

  app.commands.register(
    {
      id: 'tool.draw',
      title: tEn('cmd.tool.draw'),
      group: 'Edit',
      keys: ['D'],
      run: () => (v.tool = 'draw'),
    },
    {
      id: 'tool.select',
      title: tEn('cmd.tool.select'),
      group: 'Edit',
      keys: ['V'],
      run: () => (v.tool = 'select'),
    },
    {
      id: 'tool.knife',
      title: tEn('cmd.tool.knife'),
      group: 'Edit',
      keys: ['C'],
      run: () => (v.tool = 'knife'),
    },
    {
      id: 'edit.stepInput',
      title: tEn('cmd.edit.stepInput'),
      group: 'Edit',
      keys: ['Mod+E'],
      global: true,
      enabled: () => !!app.doc,
      run: () => {
        v.stepInput = !v.stepInput;
        toast(t(v.stepInput ? 'notes.stepOn' : 'notes.stepOff'));
      },
    },
    {
      id: 'notes.hold',
      title: tEn('cmd.notes.hold'),
      group: 'Notes',
      keys: ['L'],
      enabled: hasSel,
      run: () => refused(toggleHold(app.doc!, sel(), app.doc!.resolution), 'notes.holdBlocked'),
    },
    {
      id: 'notes.kind',
      title: tEn('cmd.notes.kind'),
      group: 'Notes',
      keys: ['K'],
      enabled: hasSel,
      run: () => cycleHoldKind(app.doc!, sel()),
    },
    {
      id: 'notes.mirror',
      title: tEn('cmd.notes.mirror'),
      group: 'Notes',
      keys: ['M'],
      enabled: hasSel,
      run: () => refused(mirrorKeys(app.doc!, sel()), 'notes.mirrorBlocked'),
    },
    {
      id: 'notes.swapSides',
      title: tEn('cmd.notes.swapSides'),
      group: 'Notes',
      keys: ['Mod+M'],
      global: true,
      enabled: hasSel,
      run: () => refused(swapSides(app.doc!, sel()), 'notes.swapBlocked'),
    },
    {
      id: 'notes.left',
      title: tEn('cmd.notes.left'),
      group: 'Notes',
      keys: ['Alt+ArrowLeft'],
      enabled: hasSel,
      run: () =>
        refused(shiftColumns(app.doc!, sel(), mode(), v.side === 'P1' ? -1 : 1), 'notes.noLane'),
    },
    {
      id: 'notes.right',
      title: tEn('cmd.notes.right'),
      group: 'Notes',
      keys: ['Alt+ArrowRight'],
      enabled: hasSel,
      run: () =>
        refused(shiftColumns(app.doc!, sel(), mode(), v.side === 'P1' ? 1 : -1), 'notes.noLane'),
    },
    {
      id: 'notes.later',
      title: tEn('cmd.notes.later'),
      group: 'Notes',
      keys: ['Alt+ArrowUp'],
      enabled: hasSel,
      run: () => refused(moveNotes(app.doc!, sel(), { dy: step() }), 'notes.inTheWay'),
    },
    {
      id: 'notes.earlier',
      title: tEn('cmd.notes.earlier'),
      group: 'Notes',
      keys: ['Alt+ArrowDown'],
      enabled: hasSel,
      run: () => refused(moveNotes(app.doc!, sel(), { dy: -step() }), 'notes.inTheWay'),
    },
    {
      id: 'edit.copy',
      title: tEn('cmd.edit.copy'),
      group: 'Edit',
      keys: ['Mod+C'],
      enabled: hasSel,
      run: () => {
        app.clip = copyNotes(app.doc!, sel(), mode());
        toast(t('notes.copied', { n: sel().size }));
      },
    },
    {
      id: 'edit.cut',
      title: tEn('cmd.edit.cut'),
      group: 'Edit',
      keys: ['Mod+X'],
      enabled: hasSel,
      run: () => {
        app.clip = copyNotes(app.doc!, sel(), mode());
        eraseNotes(app.doc!, sel());
      },
    },
    {
      id: 'edit.paste',
      title: tEn('cmd.edit.paste'),
      group: 'Edit',
      keys: ['Mod+V'],
      enabled: () => !!app.doc && !!app.clip,
      run: () => {
        const ids = pasteNotes(app.doc!, app.clip!, cursorSnapped(), mode());
        if (!ids) toast(t('notes.cantPaste'), 'warn');
      },
    },
    {
      id: 'edit.duplicate',
      title: tEn('cmd.edit.duplicate'),
      group: 'Edit',
      keys: ['Mod+D'],
      enabled: hasSel,
      run: () => {
        const d = app.doc!;
        const notes = [...sel()].map((id) => d.index.get(id)!).filter(Boolean);
        const y0 = Math.min(...notes.map((n) => n.y));
        const y1 = Math.max(...notes.map((n) => n.y + n.l));
        const clip = copyNotes(d, sel(), mode());
        const span = Math.max(step(), Math.ceil((y1 - y0 + 1) / step()) * step());
        if (!clip || !pasteNotes(d, clip, y0 + span, mode()))
          toast(t('notes.cantDuplicate'), 'warn');
      },
    },
    {
      id: 'timing.bpm',
      title: tEn('cmd.timing.bpm'),
      group: 'Timing',
      verb: 'bpm',
      argHint: '174',
      keys: [],
      enabled: () => !!app.doc,
      run: (arg) => {
        const y = cursorSnapped();
        if (arg === undefined || arg === '' || arg === '-') {
          setBpmAt(app.doc!, y, null);
          return;
        }
        const bpm = Number(arg);
        if (!(bpm > 0 && bpm < 1000)) throw new Error(t('notes.bpmRange'));
        setBpmAt(app.doc!, y, bpm);
      },
    },
    {
      id: 'timing.bpmPrompt',
      title: tEn('cmd.timing.bpmPrompt'),
      group: 'Timing',
      keys: ['B'],
      enabled: () => !!app.doc,
      run: () => app.openPalette('bpm '),
    },
    {
      id: 'timing.stop',
      title: tEn('cmd.timing.stop'),
      group: 'Timing',
      verb: 'stop',
      argHint: 'pulses',
      enabled: () => !!app.doc,
      run: (arg) => {
        const y = cursorSnapped();
        const n = Number(arg ?? 0);
        if (!Number.isFinite(n) || n < 0) throw new Error(t('notes.stopPulses'));
        setStopAt(app.doc!, y, n > 0 ? Math.round(n) : null);
      },
    },
    {
      id: 'timing.scroll',
      title: tEn('cmd.timing.scroll'),
      group: 'Timing',
      verb: 'scroll',
      argHint: '1.5',
      enabled: () => !!app.doc,
      run: (arg) => {
        // A multiplier on the player's speed from here on, as EZ2PORT plays
        // type-6 records: 1.5, ×1.5 or 150%. `-` removes it.
        const y = cursorSnapped();
        const text = (arg ?? '').trim().replace(/^[x×*]/i, '');
        if (text === '' || text === '-') {
          setScrollAt(app.doc!, y, null);
          return;
        }
        const rate = text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
        if (!(rate > 0 && rate <= 100)) throw new Error(t('notes.scrollRate'));
        setScrollAt(app.doc!, y, rate);
      },
    },
    {
      id: 'timing.stopPrompt',
      title: tEn('cmd.timing.stopPrompt'),
      group: 'Timing',
      keys: ['S'],
      enabled: () => !!app.doc,
      run: () => app.openPalette('stop '),
    },
  );
}
