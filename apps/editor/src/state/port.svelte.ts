// What EZ2BMS knows about the player's EZ2PORT: where it is, what this build
// of ez2play can do, and the test run in progress.

import type { Located, Probe, RunEvent } from '../bridge';
import type { App } from './app.svelte';

export interface LogLine {
  stream: 'out' | 'err' | 'ez2bms';
  text: string;
}

export class PortState {
  probe = $state<Probe | null>(null);
  probeError = $state<string | null>(null);
  located = $state<Located | null>(null);
  runId = $state<number | null>(null);
  log = $state<LogLine[]>([]);
  logOpen = $state(false);
  lastExit = $state<string | null>(null);

  constructor(private readonly app: App) {}

  /** Look again: locate from the game folder, fill what is unset, probe ez2play. */
  async detect(): Promise<void> {
    const s = this.app.settings;
    const b = this.app.backend;
    // The bindings follow EZ2PORT's keys.ini until the player picks their own.
    if (b.kind === 'web') return this.app.input.loadControls();
    const root = s.data.gameRoot;
    if (root) {
      this.located = await b.port.locate(root).catch(() => null);
      if (this.located?.ez2play && !s.data.ez2play) s.set('ez2play', this.located.ez2play);
      if (this.located?.songs_root && !s.data.songsRoot)
        s.set('songsRoot', this.located.songs_root);
    }
    this.probe = null;
    this.probeError = null;
    if (s.data.ez2play) {
      try {
        this.probe = await b.port.probe(s.data.ez2play);
      } catch (e) {
        this.probeError = e instanceof Error ? e.message : String(e);
      }
    }
    await this.app.input.loadControls();
  }

  say(text: string): void {
    this.log.push({ stream: 'ez2bms', text });
  }

  onEvent = (e: RunEvent): void => {
    if (e.kind === 'line') this.log.push({ stream: e.stream, text: e.text });
    else {
      this.lastExit = e.outcome;
      this.say(
        e.outcome === 'finished'
          ? 'EZ2PORT closed normally.'
          : e.outcome === 'usage'
            ? 'EZ2PORT did not understand the command line (exit 2): this build may be older or newer than EZ2BMS expects.'
            : e.outcome === 'skipped'
              ? 'EZ2PORT could not find the game data it needs (exit 77).'
              : `EZ2PORT ended: ${e.outcome}${e.code !== null ? ` (exit ${e.code})` : ''}.`,
      );
      this.runId = null;
    }
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 2000);
  };
}
