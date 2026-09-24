// Classic-mode commands: switch it for the song, cycle what a note would key,
// and send every keyed note back to the background.

import { t, tEn } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import { ask } from '../state/toasts.svelte';

export function registerClassicCommands(app: App): void {
  const on = () => !!app.doc && app.classic.on;
  app.commands.register(
    {
      id: 'view.classic',
      title: tEn('cmd.view.classic'),
      group: 'Edit',
      keys: ['Mod+Shift+K'],
      global: true,
      enabled: () => !!app.project,
      run: () => app.classic.toggle(),
    },
    {
      id: 'classic.next',
      title: tEn('cmd.classic.next'),
      group: 'Edit',
      keys: ['Q'],
      enabled: on,
      run: () => app.classic.cycle(1),
    },
    {
      id: 'classic.prev',
      title: tEn('cmd.classic.prev'),
      group: 'Edit',
      keys: ['Shift+Q'],
      enabled: on,
      run: () => app.classic.cycle(-1),
    },
    {
      id: 'classic.resetAll',
      title: tEn('cmd.classic.resetAll'),
      group: 'Edit',
      enabled: on,
      run: () =>
        ask(t('classic.resetAsk'), {
          label: t('classic.resetGo'),
          run: () => app.classic.resetAll(app.doc!),
        }),
    },
  );
}
