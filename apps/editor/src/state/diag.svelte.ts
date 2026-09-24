// When something goes wrong. Script errors and host panics go to the app's
// log (the desktop app's log file, src-tauri diag.rs) and are said once in
// a toast; the start after a run that died without closing offers the log;
// the About box copies a report. Nothing leaves the machine.

import type { AppInfo } from '../bridge';
import type { App } from './app.svelte';
import { isoTime } from './autosave';
import { t } from '../i18n/i18n.svelte';
import { ask, toast } from './toasts.svelte';

/** How much of the log a report carries. */
const REPORT_LOG_BYTES = 256 * 1024;
/** At most one "something went wrong" toast in this long (an error storm stays one toast). */
const TOAST_EVERY_MS = 5000;

/** An error's message and, when it has one, its stack. */
export function describeError(e: unknown): { message: string; detail: string } {
  if (e instanceof Error) {
    const message = e.message || e.name;
    return {
      message,
      detail: e.stack && e.stack.includes(message) ? e.stack : `${message}\n${e.stack ?? ''}`,
    };
  }
  const message = typeof e === 'string' ? e : (JSON.stringify(e) ?? String(e));
  return { message, detail: message };
}

/** Browser noise that is not EZ2BMS going wrong. */
const BENIGN = [/^ResizeObserver loop/];

export class Diagnostics {
  info = $state<AppInfo | null>(null);
  aboutOpen = $state(false);
  /** This run's errors, newest last (they are in the log too). */
  errors = $state<string[]>([]);
  private toastAt = -Infinity;
  private stopPanic: (() => void) | undefined;

  constructor(private readonly app: App) {}

  /** Listen for errors, log the start, and offer the log after an unclean exit. */
  async start(): Promise<void> {
    window.addEventListener('error', (e) => this.fail(e.error ?? e.message, 'script'));
    window.addEventListener('unhandledrejection', (e) => this.fail(e.reason, 'promise'));
    this.stopPanic = this.app.backend.diag.onPanic((m) => this.fail(m, 'host'));
    this.info = await this.app.backend.appInfo().catch(() => null);
    this.app.backend.diag.log('info', `editor started (${navigator.userAgent})`);
    if (this.info?.previous_session)
      ask(t('diag.crashed'), {
        label: t('diag.details'),
        run: () => (this.aboutOpen = true),
      });
  }

  stop(): void {
    this.stopPanic?.();
  }

  /** Something failed that nothing caught: log it, and say so (not too often). */
  fail(e: unknown, where: string): void {
    const { message, detail } = describeError(e);
    if (BENIGN.some((re) => re.test(message))) return;
    this.app.backend.diag.log('error', `${where}: ${detail}`);
    this.errors.push(`${isoTime()} ${where}: ${message}`);
    if (this.errors.length > 50) this.errors.shift();
    const now = performance.now();
    if (now - this.toastAt < TOAST_EVERY_MS) return;
    this.toastAt = now;
    toast(t('diag.failed', { message }), 'error');
  }

  /** What to paste into a bug report: the build, the machine, this run's errors, the log's end.
   *  Always in English, whatever the UI language: whoever reads it fixes the code. */
  async report(): Promise<string> {
    const i = this.info ?? (await this.app.backend.appInfo().catch(() => null));
    const log = await this.app.backend.diag.tail(REPORT_LOG_BYTES).catch((e) => `(no log: ${e})`);
    const prev = i?.previous_session;
    return [
      `EZ2BMS ${i?.version ?? '?'} (${i?.commit ?? '?'}) on ${i?.os ?? '?'} ${i?.arch ?? ''}`,
      `Webview: ${navigator.userAgent}`,
      prev
        ? `The run before (${prev.version}, started ${isoTime(prev.started_ms)}) did not close.`
        : 'The run before closed normally.',
      '',
      `Errors this run: ${this.errors.length ? '' : 'none'}`,
      ...this.errors,
      '',
      '--- log ---',
      log,
    ].join('\n');
  }

  async copyReport(): Promise<void> {
    const text = await this.report();
    await navigator.clipboard.writeText(text);
    toast(t('diag.copied'), 'ok');
  }
}
