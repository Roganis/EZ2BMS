// Publish and Test in EZ2PORT.

import { chartBaseName, modeNames } from '@ez2bms/chart-core';
import { buildPackage } from '../port/package';
import { songFindings } from '../port/lint';
import type { App } from '../state/app.svelte';

export function registerPortCommands(app: App): void {
  const port = app.port;
  const s = app.settings;

  const test = async (auto: boolean) => {
    const slot = app.slot;
    if (!slot) return;
    // What would stop Publish in the chart being tested stops the test too:
    // EZ2PORT would reject it, or play something else than what is charted.
    const errors = songFindings(app).filter((f) => f.severity === 'error' && f.chart === slot.file);
    if (errors.length) {
      app.view.right = 'issues';
      throw new Error(
        `${errors.length} problem${errors.length === 1 ? '' : 's'} in ${slot.label} to fix first (see Issues)`,
      );
    }
    if (!s.data.ez2play || !s.data.gameRoot) {
      app.view.right = 'port';
      throw new Error('Set your game folder (and ez2play) in the EZ2PORT tab first');
    }
    if (port.runId !== null) await app.backend.port.stop(port.runId).catch(() => {});
    if (app.play.active) await app.play.stop(false);
    else if (app.view.playing) await app.audio.stop();
    await app.audio.sync(slot);
    const key = app.project!.sidecar.key || 'ez2bmstest';
    const { spec } = buildPackage(app, { only: slot, key });
    const fromCursor = !!port.probe?.start_at && app.view.cursor > 0;
    port.log = [];
    port.logOpen = true;
    port.say(
      `Testing ${slot.label} in EZ2PORT${auto ? ' (autoplay)' : ''}` +
        (fromCursor
          ? ' from the cursor'
          : app.view.cursor > 0
            ? ' from the start - this ez2play has no --start yet'
            : ''),
    );
    port.runId = await app.backend.port.test(
      {
        package: spec,
        chart_file: `${chartBaseName(slot.mode, key, slot.tier)}.ez`,
        mode: modeNames(slot.mode).portName,
        ez2play: s.data.ez2play,
        game_root: s.data.gameRoot,
        exe: s.data.exe,
        auto,
        windowed: true,
        // The song's movie, whatever the operator ini says (it is what is being tested).
        bga: spec.copies?.length ? true : null,
        start_ms: fromCursor ? app.audio.msAt(slot, app.view.cursor) : null,
        skip_ready: !!port.probe?.skip_ready,
      },
      port.onEvent,
    );
  };

  app.commands.register(
    {
      id: 'port.publish',
      title: 'Publish to EZ2PORT',
      group: 'EZ2PORT',
      keys: ['Mod+Shift+P'],
      global: true,
      enabled: () => !!app.project,
      // The dialog shows what would be written, and whether it can be.
      run: () => app.publish.start(),
    },
    {
      id: 'port.test',
      title: 'Test in EZ2PORT',
      group: 'EZ2PORT',
      keys: ['F5'],
      global: true,
      enabled: () => !!app.slot,
      run: () => test(false),
    },
    {
      id: 'port.testAuto',
      title: 'Watch in EZ2PORT (autoplay)',
      group: 'EZ2PORT',
      keys: ['Shift+F5'],
      global: true,
      enabled: () => !!app.slot,
      run: () => test(true),
    },
    {
      id: 'port.stop',
      title: 'Stop the EZ2PORT test',
      group: 'EZ2PORT',
      enabled: () => port.runId !== null,
      run: () => app.backend.port.stop(port.runId!),
    },
    {
      id: 'view.port',
      title: 'EZ2PORT settings',
      group: 'View',
      run: () => (app.view.right = app.view.right === 'port' ? null : 'port'),
    },
    {
      id: 'view.issues',
      title: 'Issues (pre-flight check)',
      group: 'View',
      keys: ['Mod+Shift+I'],
      global: true,
      run: () => (app.view.right = app.view.right === 'issues' ? null : 'issues'),
    },
    {
      id: 'view.log',
      title: 'EZ2PORT log',
      group: 'View',
      run: () => (port.logOpen = !port.logOpen),
    },
  );
}
