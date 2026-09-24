// The Controls dialog: the player's bindings - four alternates a channel, in
// keys.ini's grammar so they copy into EZ2PORT's file as they are - bound by
// pressing, the turntables' axes, the debounce, and the timing offsets.
//
// Changes apply at once (settings.controls and the input hub); EZ2PORT's
// own files are only read (Import), never written: "Copy as keys.ini" puts
// the text on the clipboard for the player to paste into the port's file.
// While the dialog is open it holds the pads open, to list and read them.

import {
  DEFAULT_DEBOUNCE_MS,
  formatBindspec,
  fromBytes,
  KEY_ALTS,
  keyconfDefaults,
  parseBindspec,
  toBytes,
  type Keyconf,
} from '@ez2bms/chart-core';
import { t } from '../i18n/i18n.svelte';
import { controlsIni, normControls } from '../input/hub.svelte';
import type { App } from './app.svelte';
import { toast } from './toasts.svelte';

/** A row of the Channels page: a channel (KEY_CHANNELS index) or a turntable. */
export type ControlsRow = number | 'tt0' | 'tt1';

export type ControlsTab = 'channels' | 'devices' | 'timing';

export class ControlsState {
  open = $state(false);
  tab = $state<ControlsTab>('channels');
  /** The bindings shown, as byte-string tokens (chart-core's Keyconf). */
  conf = $state<Keyconf>(keyconfDefaults());
  debounceMs = $state(DEFAULT_DEBOUNCE_MS);
  /** The row waiting for a press. */
  binding = $state<ControlsRow | null>(null);
  private detach: (() => void) | undefined;

  constructor(private readonly app: App) {}

  show(tab: ControlsTab = 'channels'): void {
    const c = normControls(this.app.settings.data.controls);
    this.conf = this.app.input.conf();
    this.debounceMs = c.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.tab = tab;
    this.open = true;
    this.detach?.();
    // Watching only: the keys stay the dialog's.
    this.detach = this.app.input.attach({ keys: 'none', pads: true, edges: () => {} });
  }

  close(): void {
    this.app.calibrator.stop();
    this.app.input.cancelCapture();
    this.binding = null;
    this.detach?.();
    this.detach = undefined;
    this.open = false;
  }

  /** Save what is shown and put it in force. */
  private commit(): void {
    const c = {
      ini: controlsIni($state.snapshot(this.conf) as Keyconf),
      debounceMs: this.debounceMs,
    };
    this.app.settings.set('controls', c);
    this.app.input.apply(c);
  }

  /** A token as the player reads it (tokens are keys.ini bytes). */
  label(token: string): string {
    return fromBytes(token);
  }

  /**
   * Wait for a press and add it to the row; a turntable takes an axis only
   * (anything else pressed is ignored). Esc, or binding another row, gives up.
   */
  async bind(row: ControlsRow): Promise<void> {
    this.binding = row;
    const analog = typeof row === 'string';
    for (;;) {
      const token = await this.app.input.capture(analog);
      if (token === null) {
        if (this.binding === row) this.binding = null;
        return;
      }
      if (analog && parseBindspec(token)?.kind !== 'axis') continue;
      this.binding = null;
      this.add(row, toBytes(token));
      return;
    }
  }

  cancelBind(): void {
    this.app.input.cancelCapture();
    this.binding = null;
  }

  add(row: ControlsRow, token: string): void {
    if (typeof row === 'string') {
      this.conf.analog[row === 'tt0' ? 0 : 1] = token;
    } else {
      const names = this.conf.names[row]!;
      if (names.includes(token)) return toast(t('controls.already', { token: this.label(token) }));
      if (names.length >= KEY_ALTS) return toast(t('controls.full', { n: KEY_ALTS }), 'warn');
      names.push(token);
    }
    this.commit();
  }

  remove(row: ControlsRow, i = 0): void {
    if (typeof row === 'string') this.conf.analog[row === 'tt0' ? 0 : 1] = '';
    else this.conf.names[row]!.splice(i, 1);
    this.commit();
  }

  clear(row: number): void {
    this.conf.names[row] = [];
    this.commit();
  }

  /** A turntable axis's `:rev` or `,vel`. */
  toggle(which: 0 | 1, flag: 'reverse' | 'velocity'): void {
    const spec = parseBindspec(this.conf.analog[which]!);
    if (spec?.kind !== 'axis') return;
    spec[flag] = !spec[flag];
    this.conf.analog[which] = formatBindspec(spec);
    this.commit();
  }

  setDebounce(ms: number): void {
    if (!Number.isFinite(ms)) return;
    this.debounceMs = Math.max(0, Math.min(100, Math.round(ms)));
    this.commit();
  }

  /** Back to EZ2PORT's own defaults (the keyboard layout its docs show). */
  resetDefaults(): void {
    this.conf = keyconfDefaults();
    this.debounceMs = DEFAULT_DEBOUNCE_MS;
    this.commit();
    toast(t('controls.defaultsSet'), 'ok');
  }

  /** Take EZ2PORT's keys.ini (and settings.ini Debounce) again. */
  async importPort(): Promise<void> {
    const p = await this.app.input.readPort();
    if (!p?.keysPath) return toast(t('controls.noPortKeys'), 'warn');
    this.conf = p.conf;
    if (p.debounceMs !== null) this.debounceMs = p.debounceMs;
    this.commit();
    toast(t('controls.imported', { path: p.keysPath }), 'ok');
  }

  /** The bindings as EZ2PORT's keys.ini. */
  keysIni(): string {
    return controlsIni($state.snapshot(this.conf) as Keyconf);
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.keysIni());
      toast(t('controls.copied'), 'ok');
    } catch {
      toast(t('controls.noClipboard'), 'warn');
    }
  }
}
