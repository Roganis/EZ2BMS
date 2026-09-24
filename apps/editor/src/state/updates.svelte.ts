// A newer EZ2BMS: looked for at start (at most once a day, a setting, never
// while a chart plays), or when asked; its notes shown; installed only when
// you say so. The update's signature is checked against the key built into
// this app before anything runs (tauri-plugin-updater), and nothing is
// sent anywhere but the request for the newest release.

import type { UpdateInfo } from '../bridge';
import type { App } from './app.svelte';
import { checkDue, offer } from './updatecheck';
import { ask, toast } from './toasts.svelte';

/** How long after start the daily look waits (the song and audio come first). */
const START_DELAY_MS = 8000;

export type UpdateStage =
  'idle' | 'checking' | 'none' | 'available' | 'installing' | 'installed' | 'failed';

export class Updates {
  stage = $state<UpdateStage>('idle');
  info = $state<UpdateInfo | null>(null);
  /** Why this build cannot update itself (bridge UpdateBackend.unsupported). */
  unsupported = $state<'no-key' | 'package' | null>(null);
  progress = $state<{ done: number; total: number | null } | null>(null);
  error = $state<string | null>(null);
  dialogOpen = $state(false);

  constructor(private readonly app: App) {}

  /** At start: the daily look, if it is due and turned on. */
  async start(): Promise<void> {
    this.unsupported = await this.app.backend.updates.unsupported().catch(() => 'no-key' as const);
    if (this.unsupported === 'no-key') return;
    if (!checkDue(this.app.settings.data.updates, Date.now())) return;
    setTimeout(() => void this.whenIdle(() => this.check(false)), START_DELAY_MS);
  }

  /** Run `f` once nothing is playing or recording (a check or its toast must not interrupt). */
  private async whenIdle(f: () => Promise<void>): Promise<void> {
    const a = this.app;
    while (a.view.playing || a.play.active || a.recorder.active)
      await new Promise((r) => setTimeout(r, 2000));
    await f();
  }

  /** Look for a newer version; `manual`: asked for, so say what was found either way. */
  async check(manual: boolean): Promise<void> {
    if (this.stage === 'checking' || this.stage === 'installing') return;
    this.stage = 'checking';
    this.error = null;
    const s = this.app.settings;
    try {
      const info = await this.app.backend.updates.check();
      s.set('updates', { ...s.data.updates, lastCheckMs: Date.now() });
      this.info = info;
      this.stage = info ? 'available' : 'none';
      if (!info) {
        if (manual) toast(`EZ2BMS is up to date`, 'ok');
        return;
      }
      this.app.backend.diag.log('info', `update available: ${info.current} -> ${info.version}`);
      if (manual) this.dialogOpen = true;
      else if (offer(s.data.updates, info.version, false))
        ask(
          `EZ2BMS ${info.version} is out (you have ${info.current}).`,
          {
            label: "What's new",
            run: () => (this.dialogOpen = true),
          },
          'info',
        );
    } catch (e) {
      this.stage = 'failed';
      this.error = e instanceof Error ? e.message : String(e);
      this.app.backend.diag.log('warn', `update check failed: ${this.error}`);
      if (manual) toast(`Could not look for updates: ${this.error}`, 'error');
    }
  }

  /** Download and install the version found; the app then starts again on it. */
  async install(): Promise<void> {
    if (!this.info || this.stage === 'installing') return;
    const p = this.app.project;
    if (p?.dirty) {
      toast('Save your charts first: installing restarts EZ2BMS', 'warn');
      return;
    }
    this.stage = 'installing';
    this.progress = { done: 0, total: null };
    try {
      await this.app.backend.updates.install((done, total) => (this.progress = { done, total }));
      this.stage = 'installed';
      this.app.backend.diag.log('info', `update ${this.info.version} installed; restarting`);
      await this.app.backend.updates.restart();
    } catch (e) {
      this.stage = 'failed';
      this.error = e instanceof Error ? e.message : String(e);
      this.app.backend.diag.log('error', `update install failed: ${this.error}`);
    }
  }

  /** Do not offer this version at start again (a later one is). */
  skip(): void {
    if (!this.info) return;
    const s = this.app.settings;
    s.set('updates', { ...s.data.updates, skip: this.info.version });
    this.dialogOpen = false;
  }

  setAutoCheck(on: boolean): void {
    const s = this.app.settings;
    s.set('updates', { ...s.data.updates, check: on });
  }
}
