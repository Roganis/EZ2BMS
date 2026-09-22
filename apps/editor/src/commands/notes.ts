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
  setStopAt,
  shiftColumns,
  swapSides,
  toggleHold,
} from '@ez2bms/chart-core';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';

export function registerNoteCommands(app: App): void {
  const v = app.view;
  const hasSel = () => (app.doc?.selection.ids.size ?? 0) > 0;
  const sel = () => app.doc!.selection.ids;
  const step = () => ((app.doc?.resolution ?? 240) * 4) / v.snap;
  const cursorSnapped = () => Math.round(v.cursor / step()) * step();
  const mode = () => modeDef(app.slot!.mode);
  const refused = (ok: boolean, why: string) => {
    if (!ok) toast(why, 'warn');
  };

  app.commands.register(
    {
      id: 'tool.draw',
      title: 'Draw tool',
      group: 'Edit',
      keys: ['D'],
      run: () => (v.tool = 'draw'),
    },
    {
      id: 'tool.select',
      title: 'Select tool',
      group: 'Edit',
      keys: ['V'],
      run: () => (v.tool = 'select'),
    },
    {
      id: 'edit.stepInput',
      title: 'Step input (place notes with the cabinet keys)',
      group: 'Edit',
      keys: ['Mod+E'],
      global: true,
      enabled: () => !!app.doc,
      run: () => {
        v.stepInput = !v.stepInput;
        toast(
          v.stepInput
            ? 'Step input on: Z S X D C V B, Shift, Space place notes at the cursor'
            : 'Step input off',
        );
      },
    },
    {
      id: 'notes.hold',
      title: 'Long note on/off',
      group: 'Notes',
      keys: ['L'],
      enabled: hasSel,
      run: () =>
        refused(
          toggleHold(app.doc!, sel(), app.doc!.resolution),
          'A hold there would cover another note',
        ),
    },
    {
      id: 'notes.kind',
      title: 'Next hold kind',
      group: 'Notes',
      keys: ['K'],
      enabled: hasSel,
      run: () => cycleHoldKind(app.doc!, sel()),
    },
    {
      id: 'notes.mirror',
      title: 'Mirror keys',
      group: 'Notes',
      keys: ['M'],
      enabled: hasSel,
      run: () => refused(mirrorKeys(app.doc!, sel()), 'Mirroring would put two notes in one place'),
    },
    {
      id: 'notes.swapSides',
      title: 'Swap 1P / 2P',
      group: 'Notes',
      keys: ['Mod+M'],
      global: true,
      enabled: hasSel,
      run: () => refused(swapSides(app.doc!, sel()), 'Swapping would put two notes in one place'),
    },
    {
      id: 'notes.left',
      title: 'Move one lane left',
      group: 'Notes',
      keys: ['Alt+ArrowLeft'],
      enabled: hasSel,
      run: () =>
        refused(
          shiftColumns(app.doc!, sel(), mode(), v.side === 'P1' ? -1 : 1),
          'No lane there, or the lane is taken',
        ),
    },
    {
      id: 'notes.right',
      title: 'Move one lane right',
      group: 'Notes',
      keys: ['Alt+ArrowRight'],
      enabled: hasSel,
      run: () =>
        refused(
          shiftColumns(app.doc!, sel(), mode(), v.side === 'P1' ? 1 : -1),
          'No lane there, or the lane is taken',
        ),
    },
    {
      id: 'notes.later',
      title: 'Move later by one snap',
      group: 'Notes',
      keys: ['Alt+ArrowUp'],
      enabled: hasSel,
      run: () => refused(moveNotes(app.doc!, sel(), { dy: step() }), 'Something is in the way'),
    },
    {
      id: 'notes.earlier',
      title: 'Move earlier by one snap',
      group: 'Notes',
      keys: ['Alt+ArrowDown'],
      enabled: hasSel,
      run: () => refused(moveNotes(app.doc!, sel(), { dy: -step() }), 'Something is in the way'),
    },
    {
      id: 'edit.copy',
      title: 'Copy',
      group: 'Edit',
      keys: ['Mod+C'],
      enabled: hasSel,
      run: () => {
        app.clip = copyNotes(app.doc!, sel(), mode());
        toast(`Copied ${sel().size} note${sel().size === 1 ? '' : 's'}`);
      },
    },
    {
      id: 'edit.cut',
      title: 'Cut',
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
      title: 'Paste at the cursor',
      group: 'Edit',
      keys: ['Mod+V'],
      enabled: () => !!app.doc && !!app.clip,
      run: () => {
        const ids = pasteNotes(app.doc!, app.clip!, cursorSnapped(), mode());
        if (!ids) toast("Can't paste here: notes would overlap", 'warn');
      },
    },
    {
      id: 'edit.duplicate',
      title: 'Duplicate after itself',
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
          toast("Can't duplicate: notes would overlap", 'warn');
      },
    },
    {
      id: 'timing.bpm',
      title: 'Set BPM at the cursor…',
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
        if (!(bpm > 0 && bpm < 1000)) throw new Error('BPM is between 0 and 1000');
        setBpmAt(app.doc!, y, bpm);
      },
    },
    {
      id: 'timing.bpmPrompt',
      title: 'BPM change here…',
      group: 'Timing',
      keys: ['B'],
      enabled: () => !!app.doc,
      run: () => app.openPalette('bpm '),
    },
    {
      id: 'timing.stop',
      title: 'Set STOP at the cursor…',
      group: 'Timing',
      verb: 'stop',
      argHint: 'pulses',
      enabled: () => !!app.doc,
      run: (arg) => {
        const y = cursorSnapped();
        const n = Number(arg ?? 0);
        if (!Number.isFinite(n) || n < 0) throw new Error('a STOP lasts a number of pulses');
        setStopAt(app.doc!, y, n > 0 ? Math.round(n) : null);
      },
    },
    {
      id: 'timing.stopPrompt',
      title: 'STOP here…',
      group: 'Timing',
      keys: ['S'],
      enabled: () => !!app.doc,
      run: () => app.openPalette('stop '),
    },
  );
}
