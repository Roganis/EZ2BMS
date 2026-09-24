<script lang="ts">
  // Where EZ2PORT is, what this build of ez2play can do, and the buttons that
  // use it.
  import type { AudioCacheInfo } from '../../bridge/types';
  import { t, tParts } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';

  const s = app.settings;
  const port = app.port;
  const skin = app.skin;
  const web = app.backend.kind === 'web';

  async function pick(key: 'gameRoot' | 'songsRoot', title: string) {
    const dir = await app.backend.pickFolder(title);
    if (!dir) return;
    s.set(key, dir);
    if (key === 'gameRoot') {
      s.set('ez2play', null);
      s.set('songsRoot', null);
    }
    await port.detect();
  }

  async function pickFile(key: 'ez2play' | 'exe', title: string) {
    const [f] = await app.backend.pickFiles(title, ['exe', '*']);
    if (!f) return;
    s.set(key, f);
    await port.detect();
  }

  // The disk cache for long files: how full it is, its limit, and Clear.
  let cache = $state<AudioCacheInfo | null>(null);
  const refreshCache = async () => {
    cache = await app.backend.audio.cacheInfo().catch(() => null);
  };
  $effect(() => void refreshCache());
  const mb = (bytes: number) => Math.round(bytes / 2 ** 20);
  async function setCap(v: number) {
    const cap = Math.max(0, Math.min(1 << 20, Math.round(v)));
    s.set('audioCacheMB', cap);
    await app.backend.audio.cacheSetCap(cap);
    await refreshCache();
  }
  async function clearCache() {
    await app.backend.audio.cacheClear();
    await refreshCache();
  }

  const caps = $derived(
    port.probe
      ? [
          [t('port.cap.songsRoot'), port.probe.songs_root, true],
          [t('port.cap.logFile'), port.probe.log_file, true],
          [t('port.cap.start'), port.probe.start_at, false],
          [t('port.cap.skipReady'), port.probe.skip_ready, false],
          [t('port.cap.viewer'), port.probe.viewer, false],
          [t('port.cap.result'), port.probe.result_file, false],
        ]
      : [],
  );
</script>

<div class="ez-form">
  {#if web}
    <p class="warn">{t('port.web')}</p>
  {/if}
  <div class="row">
    <span class="lbl">{t('port.gameRoot')}</span>
    <div class="path">
      <code>{s.data.gameRoot ?? t('port.notSet')}</code>
      <button class="ez-btn" onclick={() => pick('gameRoot', t('port.pickGame'))} disabled={web}
        >{t('port.choose')}</button
      >
    </div>
  </div>
  <div class="row">
    <span class="lbl">{t('port.ez2play')}</span>
    <div class="path">
      <code>{s.data.ez2play ?? t('port.notFound')}</code>
      <button
        class="ez-btn"
        onclick={() => pickFile('ez2play', t('port.pickEz2play'))}
        disabled={web}>{t('port.choose')}</button
      >
    </div>
    {#if port.probeError}<span class="warn">{port.probeError}</span>{/if}
  </div>
  <div class="row">
    <span class="lbl">{t('port.exe')}</span>
    <div class="path">
      <code>{s.data.exe ?? t('port.exeAuto')}</code>
      <button class="ez-btn" onclick={() => pickFile('exe', t('port.pickExe'))} disabled={web}
        >{t('port.choose')}</button
      >
    </div>
  </div>
  <div class="row">
    <span class="lbl">{t('port.songsRoot')}</span>
    <div class="path">
      <code>{s.data.songsRoot ?? t('port.notSet')}</code>
      <button class="ez-btn" onclick={() => pick('songsRoot', t('port.pickSongs'))} disabled={web}
        >{t('port.choose')}</button
      >
    </div>
  </div>

  <h3>{t('port.playfield')}</h3>
  <label class="check"
    ><input
      type="checkbox"
      checked={s.data.gameSkin}
      disabled={!s.data.gameRoot}
      onchange={(e) => s.set('gameSkin', e.currentTarget.checked)}
    />
    {t('port.gameSkin')}</label
  >
  <p class="hint" data-testid="skin-status">
    {#if skin.status.kind === 'ready'}
      <span class="okay">✓</span>
      {skin.status.text}{#if skin.status.missing.length}
        · <span class="warn">{t('skin.missing', { n: skin.status.missing.length })}</span>{/if}
    {:else if skin.status.kind === 'none' || skin.status.kind === 'error'}
      {#each tParts('skin.failed', { error: skin.status.text }, ['error']) as p, i (i)}
        {#if 'slot' in p}<span class="warn">{skin.status.text}</span>{:else}{p.text}{/if}
      {/each}
    {:else}
      {skin.status.text}
    {/if}
  </p>
  {#if skin.status.kind === 'ready' && skin.status.missing.length}
    <details>
      <summary>{t('skin.notFound')}</summary>
      <ul class="missing-list">
        {#each skin.status.missing as m (m)}<li><code>{m}</code></li>{/each}
      </ul>
    </details>
  {/if}
  {#if s.data.gameRoot}
    <button class="ez-btn" onclick={() => skin.reload()}>{t('skin.reload')}</button>
  {/if}

  <h3>{t('port.cache.heading')}</h3>
  <p class="hint">{t('port.cache.hint')}</p>
  <div class="row">
    <span class="lbl">{t('port.cache.cap')}</span>
    <div class="path">
      <input
        class="num"
        type="number"
        min="0"
        step="256"
        value={s.data.audioCacheMB}
        data-testid="audio-cache-cap"
        onchange={(e) => setCap(Number(e.currentTarget.value))}
      />
      <button
        class="ez-btn"
        onclick={clearCache}
        disabled={!cache?.dir || !cache.entries}
        data-testid="audio-cache-clear">{t('port.cache.clear')}</button
      >
    </div>
    <span class="hint" data-testid="audio-cache-info">
      {#if !cache?.dir}
        {t('port.cache.web')}
      {:else}
        {t('port.cache.info', { n: cache.entries, used: mb(cache.bytes), cap: mb(cache.cap) })}
      {/if}
    </span>
  </div>

  {#if port.probe}
    <h3>{t('port.probe.heading')}</h3>
    <p class="hint">
      {port.probe.commit
        ? t('port.probe.optionsSource', { n: port.probe.options.length, commit: port.probe.commit })
        : t('port.probe.options', { n: port.probe.options.length })}
    </p>
    <ul class="caps">
      {#each caps as [label, ok, needed] (label)}
        <li class:ok class:missing={!ok && needed}>
          <span>{ok ? '✓' : '·'}</span>{label}{#if !ok && !needed}<small
              >{t('port.cap.requested')}</small
            >{/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h3>{t('port.go')}</h3>
  <div class="cols">
    <button class="ez-btn" onclick={() => app.commands.run('port.test')} disabled={web}
      >{t('port.test')} <kbd>F5</kbd></button
    >
    <button class="ez-btn" onclick={() => app.commands.run('port.testAuto')} disabled={web}
      >{t('port.auto')} <kbd>⇧F5</kbd></button
    >
  </div>
  <button class="ez-btn" onclick={() => app.commands.run('port.publish')}
    >{t('port.publish')} <kbd>Ctrl ⇧ P</kbd></button
  >
</div>

<style>
  .path {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    align-items: center;
  }
  code {
    font-family: var(--font-num);
    font-size: 11.5px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
  .caps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    font-size: 12.5px;
    color: var(--ink-dim);
  }
  .caps span {
    display: inline-block;
    width: 16px;
  }
  .caps .ok {
    color: var(--ink);
  }
  .caps .ok span {
    color: var(--ok);
  }
  .caps .missing {
    color: var(--err);
  }
  small {
    color: var(--ink-faint);
  }
  .okay {
    color: var(--ok);
  }
  .missing-list {
    margin: 4px 0 0;
    padding-left: 16px;
    font-size: 11.5px;
  }
  .missing-list code {
    direction: ltr;
  }
  .num {
    width: 90px;
  }
</style>
