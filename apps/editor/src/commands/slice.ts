// Stem strips and slicing: which sounds have strips, and (M4.5, M4.6) the
// knife, chopping to the grid and cutting at onsets.

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
      title: 'Stem strips shown / hidden',
      group: 'View',
      enabled: () => !!app.doc,
      run: () => {
        app.strips.show = !app.strips.show;
      },
    },
    {
      id: 'strip.pin',
      title: 'Stem strip for the picked sound on / off',
      group: 'View',
      enabled: () => picked() !== undefined,
      run: () => {
        const d = app.doc!;
        const src = picked()!;
        if (app.strips.has(d, src)) app.strips.unpin(d, src);
        else {
          app.strips.show = true;
          app.strips.pin(d, src);
          toast(`${src}: a strip beside the lanes`, 'info');
        }
      },
    },
  );
}
