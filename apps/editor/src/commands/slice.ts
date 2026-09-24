// Stem strips and slicing: which sounds have strips, and the panel that
// chops a stem to the grid and cuts it at its onsets (the knife tool is
// with the other tools, in notes.ts).

import { t, tEn } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';

export function registerSliceCommands(app: App): void {
  const picked = () => {
    const d = app.doc;
    const b = app.view.brush;
    return d && b !== null ? d.channel(b)?.name : undefined;
  };
  app.commands.register(
    {
      id: 'view.strips',
      title: tEn('cmd.view.strips'),
      group: 'View',
      enabled: () => !!app.doc,
      run: () => {
        app.strips.show = !app.strips.show;
      },
    },
    {
      id: 'strip.chop',
      title: tEn('cmd.strip.chop'),
      group: 'Edit',
      keys: ['Mod+Shift+G'],
      enabled: () => !!app.doc && app.strips.focused(app.doc) !== undefined,
      run: () => {
        app.strips.show = true;
        app.strips.panel = app.strips.focused(app.doc!)!;
      },
    },
    {
      id: 'strip.onsets',
      title: tEn('cmd.strip.onsets'),
      group: 'Edit',
      keys: ['Mod+Shift+O'],
      enabled: () => !!app.doc && app.strips.focused(app.doc) !== undefined,
      run: () => {
        app.strips.show = true;
        app.strips.panel = app.strips.focused(app.doc!)!;
        app.strips.suggest = true;
      },
    },
    {
      id: 'strip.pin',
      title: tEn('cmd.strip.pin'),
      group: 'View',
      enabled: () => picked() !== undefined,
      run: () => {
        const d = app.doc!;
        const src = picked()!;
        if (app.strips.has(d, src)) app.strips.unpin(d, src);
        else {
          app.strips.show = true;
          app.strips.pin(d, src);
          toast(t('strip.pinned', { sound: src }), 'info');
        }
      },
    },
  );
}
