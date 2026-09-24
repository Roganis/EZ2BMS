// Playback commands: the chart as EZ2PORT will sound it, from the cursor.

import { laneInfo } from '@ez2bms/chart-core';
import { t, tEn } from '../i18n/i18n.svelte';
import type { App } from '../state/app.svelte';
import { toast } from '../state/toasts.svelte';

export function registerPlayCommands(app: App): void {
  const v = app.view;
  let startedAt = 0;
  app.commands.register(
    {
      id: 'play.toggle',
      title: tEn('cmd.play.toggle'),
      group: 'Play',
      keys: ['Space'],
      enabled: () => !!app.slot,
      run: async () => {
        if (app.play.active) return app.play.stop(true);
        if (v.playing) return app.audio.stop();
        startedAt = v.cursor;
        // In the Play view, Space is autoplay with judgements and the HUD.
        if (v.mode === 'play') return app.play.start('auto');
        await app.audio.play(app.slot!, v.cursor);
      },
    },
    {
      id: 'play.test',
      title: tEn('cmd.play.test'),
      group: 'Play',
      keys: ['Shift+Tab'],
      enabled: () => !!app.slot,
      run: async () => {
        if (app.play.active === 'test') return app.play.stop(true);
        startedAt = v.cursor;
        await app.play.start('test');
      },
    },
    {
      id: 'play.record',
      title: tEn('cmd.play.record'),
      group: 'Play',
      keys: ['R'],
      enabled: () => !!app.slot && !app.play.active,
      run: () => app.recorder.toggle(),
    },
    {
      id: 'input.controls',
      title: tEn('cmd.input.controls'),
      group: 'Play',
      global: true,
      run: () => app.controls.show(),
    },
    {
      id: 'play.again',
      title: tEn('cmd.play.again'),
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
      title: tEn('cmd.audio.muteBgm'),
      group: 'Play',
      keys: ['Mod+Shift+M'],
      global: true,
      run: () => {
        app.audio.muteBgm = !app.audio.muteBgm;
        toast(t(app.audio.muteBgm ? 'play.bgmMuted' : 'play.bgmOn'));
        if (app.slot) void app.audio.sync(app.slot);
      },
    },
    {
      id: 'audio.solo',
      title: tEn('cmd.audio.solo'),
      group: 'Play',
      keys: ['Mod+Shift+S'],
      global: true,
      run: () => {
        const x = v.hoverLane;
        app.audio.solo = app.audio.solo !== null || x === null ? null : x;
        toast(
          app.audio.solo === null
            ? t('play.soloOff')
            : t('play.solo', { lane: laneInfo(app.audio.solo)?.short ?? app.audio.solo }),
        );
        if (app.slot) void app.audio.sync(app.slot);
      },
    },
  );
}
