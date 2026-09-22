// Playback commands: the chart as EZ2PORT will sound it, from the cursor.

import { laneInfo } from '@ez2bms/chart-core';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';

export function registerPlayCommands(app: App): void {
  const v = app.view;
  let startedAt = 0;
  app.commands.register(
    {
      id: 'play.toggle',
      title: 'Play / stop from the cursor',
      group: 'Play',
      keys: ['Space'],
      enabled: () => !!app.slot,
      run: async () => {
        if (v.playing) return app.audio.stop();
        startedAt = v.cursor;
        await app.audio.play(app.slot!, v.cursor);
      },
    },
    {
      id: 'play.again',
      title: 'Play again from where playback last started',
      group: 'Play',
      keys: ['Shift+Space'],
      enabled: () => !!app.slot,
      run: async () => {
        if (v.playing) await app.audio.stop();
        v.cursor = startedAt;
        await app.audio.play(app.slot!, startedAt);
      },
    },
    {
      id: 'audio.muteBgm',
      title: 'Mute / unmute background sounds',
      group: 'Play',
      keys: ['Mod+Shift+M'],
      global: true,
      run: () => {
        app.audio.muteBgm = !app.audio.muteBgm;
        toast(app.audio.muteBgm ? 'Background muted' : 'Background on');
        if (app.slot) void app.audio.sync(app.slot);
      },
    },
    {
      id: 'audio.solo',
      title: 'Solo the lane under the pointer (again to clear)',
      group: 'Play',
      keys: ['Mod+Shift+S'],
      global: true,
      run: () => {
        const x = v.hoverLane;
        app.audio.solo = app.audio.solo !== null || x === null ? null : x;
        toast(
          app.audio.solo === null
            ? 'Solo off'
            : `Solo: lane ${laneInfo(app.audio.solo)?.short ?? app.audio.solo}`,
        );
        if (app.slot) void app.audio.sync(app.slot);
      },
    },
  );
}
