// The Publish dialog's state: preparing, the review, writing, the result.
// The work is port/publish.ts's; this only holds where the dialog is.

import type { Finding } from '@ez2bms/chart-core';
import { errorText, t } from '../i18n/i18n.svelte';
import {
  preparePublish,
  publishErrors,
  refusal,
  writePublish,
  writtenText,
  type Review,
  type Written,
} from '../port/publish';
import type { App } from './app.svelte';
import { toast } from './toasts.svelte';

export type PublishStage =
  | { kind: 'closed' }
  | { kind: 'no-root' }
  | { kind: 'preparing' }
  | { kind: 'errors'; errors: Finding[] }
  | { kind: 'ready'; review: Review }
  | { kind: 'writing'; review: Review }
  | { kind: 'done'; review: Review; written: Written; text: string }
  | { kind: 'failed'; message: string; review?: Review };

export class PublishState {
  stage = $state.raw<PublishStage>({ kind: 'closed' });
  /** Someone else's package: its key, typed, says to replace it. */
  confirmKey = $state('');
  /** An earlier EZ2BMS package without an id: replace it. */
  confirmLegacy = $state(false);
  private seq = 0;

  constructor(private readonly app: App) {}

  get open(): boolean {
    return this.stage.kind !== 'closed';
  }

  /** Open the dialog and work out what publishing would do. */
  async start(): Promise<void> {
    if (!this.app.project) return;
    this.confirmKey = '';
    this.confirmLegacy = false;
    // Errors first: there is nothing to publish anywhere until they are fixed.
    const errors = publishErrors(this.app);
    if (errors.length) {
      this.stage = { kind: 'errors', errors };
      return;
    }
    const root = this.app.settings.data.songsRoot;
    if (!root) {
      this.stage = { kind: 'no-root' };
      return;
    }
    const n = ++this.seq;
    this.stage = { kind: 'preparing' };
    try {
      const review = await preparePublish(this.app, root);
      if (n === this.seq) this.stage = { kind: 'ready', review };
    } catch (e) {
      if (n === this.seq) this.stage = { kind: 'failed', message: errorText(e) };
    }
  }

  /** Choose the songs folder, then prepare. */
  async pickRoot(): Promise<void> {
    const dir = await this.app.backend.pickFolder(t('publish.pickRoot'));
    if (!dir) return;
    this.app.settings.set('songsRoot', dir);
    await this.start();
  }

  /** Why Publish is not available now, or undefined. */
  blocked(r: Review): string | undefined {
    const why = refusal(r);
    if (why) return why;
    if (r.owner === 'foreign' && this.confirmKey.trim() !== r.key)
      return t('publish.blockedForeign', { key: r.key });
    if (r.owner === 'legacy' && !this.confirmLegacy) return t('publish.blockedLegacy');
    return undefined;
  }

  async write(): Promise<void> {
    const s = this.stage;
    if (s.kind !== 'ready' || this.blocked(s.review)) return;
    const review = s.review;
    this.stage = { kind: 'writing', review };
    try {
      const written = await writePublish(this.app, review);
      const text = writtenText(review.key, written);
      // The dialog says what came of it (and stays open to say it).
      this.stage = { kind: 'done', review, written, text };
    } catch (e) {
      this.stage = {
        kind: 'failed',
        message: t('publish.failed', { error: errorText(e) }),
        review,
      };
    }
  }

  /** Take the song's old-key package off the wheel (it goes to .ez2bms-backup). */
  async retire(): Promise<void> {
    const s = this.stage;
    if (s.kind !== 'done' || !s.written.retire) return;
    const { key, songIni } = s.written.retire;
    try {
      await this.app.backend.port.retire(s.review.root, key, songIni);
      toast(t('publish.retired', { key }), 'ok');
      this.stage = { ...s, written: { ...s.written, retire: undefined } };
    } catch (e) {
      toast(errorText(e), 'error');
    }
  }

  close(): void {
    this.seq++;
    this.stage = { kind: 'closed' };
  }
}
