// Classic-mode commands: switch it for the song, cycle what a note would key,
// and send every keyed note back to the background.

import type { App } from '../state/app.svelte';
import { ask } from '../state/toasts.svelte';

export function registerClassicCommands(app: App): void {
  const on = () => !!app.doc && app.classic.on;
  app.commands.register(
    {
      id: 'view.classic',
      title: 'Classic mode on / off (key the sound playing there)',
      group: 'Edit',
      keys: ['Mod+Shift+K'],
      global: true,
      enabled: () => !!app.project,
      run: () => app.classic.toggle(),
    },
    {
      id: 'classic.next',
      title: 'Classic: next sound to key',
      group: 'Edit',
      keys: ['Q'],
      enabled: on,
      run: () => app.classic.cycle(1),
    },
    {
      id: 'classic.prev',
      title: 'Classic: previous sound to key',
      group: 'Edit',
      keys: ['Shift+Q'],
      enabled: on,
      run: () => app.classic.cycle(-1),
    },
    {
      id: 'classic.resetAll',
      title: 'Classic: reset all notes to the background',
      group: 'Edit',
      enabled: on,
      run: () =>
        ask('Send every note on a lane back to the background? The music stays the same.', {
          label: 'Reset',
          run: () => app.classic.resetAll(app.doc!),
        }),
    },
  );
}
