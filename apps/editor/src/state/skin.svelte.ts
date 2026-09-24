// Which skin the playfield draws with: the game's own panel for the chart's
// mode and side when a game folder is set (skin/game.ts), else the neon one.
// Loaded once per folder, mode and side; Reload drops what was read.

import type { ModeId, Side } from '@ez2bms/chart-core';
import type { Backend } from '../bridge';
import { t, type MessageKey } from '../i18n/i18n.svelte';
import { loadGameSkin, SkinNotFound, type GameSkin } from '../skin/game';

export type SkinStatus =
  | { kind: 'off' | 'loading'; text: string }
  | { kind: 'none' | 'error'; text: string }
  | { kind: 'ready'; text: string; missing: string[] };

type Loaded = { skin: GameSkin } | { error: unknown };

/**
 * A status that says a message: its words are looked up each time they are
 * shown, so the first one (made before the language is applied) and those
 * on screen follow a change of language.
 */
const saying = (kind: 'off' | 'loading', key: MessageKey): SkinStatus => ({
  kind,
  get text() {
    return t(key);
  },
});

export class SkinState {
  /** What the playfield draws with; null is the neon skin. */
  current = $state.raw<GameSkin | null>(null);
  status = $state.raw<SkinStatus>(saying('off', 'skin.noRoot'));
  /** Bumped by reload(), so whoever shows the skin asks again. */
  rev = $state(0);
  // A plain cache: nothing renders from it, `current` and `status` are what change.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly cache = new Map<string, Promise<Loaded>>();
  private want = '';

  constructor(private readonly backend: Backend) {}

  /** Show the game's panel for this mode and side, when enabled and a game folder is set. */
  async show(root: string | null, mode: ModeId, side: Side, enabled: boolean): Promise<void> {
    if (!root || !enabled) {
      this.want = '';
      this.current = null;
      this.status = saying('off', root ? 'skin.off' : 'skin.noRoot');
      return;
    }
    const key = `${root}\n${mode}\n${side}`;
    this.want = key;
    let p = this.cache.get(key);
    if (!p) {
      this.status = saying('loading', 'skin.loading');
      p = loadGameSkin(this.backend, root, mode, side).then(
        (skin) => ({ skin }),
        (error: unknown) => ({ error }),
      );
      this.cache.set(key, p);
    }
    const r = await p;
    if (this.want !== key) return;
    if ('skin' in r) {
      this.current = r.skin;
      const file = r.skin.path.slice(r.skin.path.lastIndexOf('/') + 1);
      this.status = { kind: 'ready', text: file, missing: r.skin.missing };
    } else {
      this.current = null;
      const msg = r.error instanceof Error ? r.error.message : String(r.error);
      this.status = { kind: r.error instanceof SkinNotFound ? 'none' : 'error', text: msg };
    }
  }

  /** Forget everything read, e.g. after the game folder's files changed. */
  reload(): void {
    this.cache.clear();
    this.rev++;
  }
}
