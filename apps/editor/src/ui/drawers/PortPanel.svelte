<script lang="ts">
  // Where EZ2PORT is, what this build of ez2play can do, and the buttons that
  // use it.
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

  const caps = $derived(
    port.probe
      ? [
          ['Private songs folder', port.probe.songs_root, true],
          ['Log file', port.probe.log_file, true],
          ['Test from the cursor (--start)', port.probe.start_at, false],
          ['Skip READY (--no-ready)', port.probe.skip_ready, false],
          ['One window, reused (--viewer)', port.probe.viewer, false],
          ['Result back to EZ2BMS (--result)', port.probe.result_file, false],
        ]
      : [],
  );
</script>

<div class="ez-form">
  {#if web}
    <p class="warn">
      The browser preview cannot run EZ2PORT or write to your songs folder. Use the desktop app.
    </p>
  {/if}
  <div class="row">
    <span class="lbl">Game folder (with sound and system)</span>
    <div class="path">
      <code>{s.data.gameRoot ?? 'not set'}</code>
      <button
        class="ez-btn"
        onclick={() => pick('gameRoot', 'Your EZ2AC data folder')}
        disabled={web}>Choose…</button
      >
    </div>
  </div>
  <div class="row">
    <span class="lbl">ez2play</span>
    <div class="path">
      <code>{s.data.ez2play ?? 'not found'}</code>
      <button class="ez-btn" onclick={() => pickFile('ez2play', "EZ2PORT's ez2play")} disabled={web}
        >Choose…</button
      >
    </div>
    {#if port.probeError}<span class="warn">{port.probeError}</span>{/if}
  </div>
  <div class="row">
    <span class="lbl">Unpacked executable (optional)</span>
    <div class="path">
      <code>{s.data.exe ?? 'let EZ2PORT find it'}</code>
      <button
        class="ez-btn"
        onclick={() => pickFile('exe', 'Your unpacked EZ2AC executable')}
        disabled={web}>Choose…</button
      >
    </div>
  </div>
  <div class="row">
    <span class="lbl">Publish into</span>
    <div class="path">
      <code>{s.data.songsRoot ?? 'not set'}</code>
      <button
        class="ez-btn"
        onclick={() => pick('songsRoot', 'EZ2PORT songs folder')}
        disabled={web}>Choose…</button
      >
    </div>
  </div>

  <h3>Play field</h3>
  <label class="check"
    ><input
      type="checkbox"
      checked={s.data.gameSkin}
      disabled={!s.data.gameRoot}
      onchange={(e) => s.set('gameSkin', e.currentTarget.checked)}
    /> Draw with the game's own panel</label
  >
  <p class="hint" data-testid="skin-status">
    {#if skin.status.kind === 'ready'}
      <span class="okay">✓</span>
      {skin.status.text}{#if skin.status.missing.length}
        · <span class="warn">{skin.status.missing.length} textures not found</span>{/if}
    {:else if skin.status.kind === 'none' || skin.status.kind === 'error'}
      <span class="warn">{skin.status.text}</span> - drawing the neon skin
    {:else}
      {skin.status.text}
    {/if}
  </p>
  {#if skin.status.kind === 'ready' && skin.status.missing.length}
    <details>
      <summary>Not found</summary>
      <ul class="missing-list">
        {#each skin.status.missing as m (m)}<li><code>{m}</code></li>{/each}
      </ul>
    </details>
  {/if}
  {#if s.data.gameRoot}
    <button class="ez-btn" onclick={() => skin.reload()}>Reload the panel</button>
  {/if}

  {#if port.probe}
    <h3>This ez2play</h3>
    <p class="hint">
      {port.probe.options.length} options{port.probe.commit ? ` · source ${port.probe.commit}` : ''}
    </p>
    <ul class="caps">
      {#each caps as [label, ok, needed] (label)}
        <li class:ok class:missing={!ok && needed}>
          <span>{ok ? '✓' : '·'}</span>{label}{#if !ok && !needed}<small>
              requested from EZ2PORT</small
            >{/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h3>Go</h3>
  <div class="cols">
    <button class="ez-btn" onclick={() => app.commands.run('port.test')} disabled={web}
      >Test <kbd>F5</kbd></button
    >
    <button class="ez-btn" onclick={() => app.commands.run('port.testAuto')} disabled={web}
      >Auto <kbd>⇧F5</kbd></button
    >
  </div>
  <button class="ez-btn" onclick={() => app.commands.run('port.publish')}
    >Publish song <kbd>Ctrl ⇧ P</kbd></button
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
</style>
