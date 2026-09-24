<script lang="ts">
  // A newer EZ2BMS: what changed, and install (the app starts again on it),
  // skip this version, or later.
  import { app } from '../state/app.svelte';

  const u = app.updates;
  const i = $derived(u.info);
  const close = () => (u.dialogOpen = false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && u.stage !== 'installing') {
      e.stopPropagation();
      close();
    }
  };
  const pct = $derived(
    u.progress?.total ? Math.round((100 * u.progress.done) / u.progress.total) : null,
  );
  const mb = (b: number) => (b / 1048576).toFixed(1);
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" role="presentation"></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="Update" data-testid="update">
  {#if i}
    <h2>EZ2BMS {i.version}</h2>
    <p class="lead">
      You have {i.current}.{#if i.date}
        Published {new Date(i.date).toLocaleDateString()}.{/if}
    </p>
    {#if i.notes}<pre class="notes" data-testid="update-notes">{i.notes}</pre>{/if}
  {/if}

  {#if u.unsupported === 'package'}
    <p class="hint">
      This EZ2BMS came as a Linux package, which your package manager updates: download the new
      version from its release page.
    </p>
    <div class="actions">
      <button class="ez-btn" onclick={() => void app.backend.updates.openReleases()}
        >Open the release page</button
      >
      <span class="grow"></span>
      <button class="ez-btn" onclick={close}>Close</button>
    </div>
  {:else if u.stage === 'installing' || u.stage === 'installed'}
    <div class="bar" data-testid="update-progress">
      <i style:width="{pct ?? 5}%"></i>
    </div>
    <p class="hint">
      {#if u.stage === 'installed'}Installed: starting again…{:else if u.progress?.total}Downloading
        {mb(u.progress.done)} of {mb(u.progress.total)} MB…{:else}Downloading…{/if}
    </p>
  {:else}
    {#if u.stage === 'failed'}<p class="warn" data-testid="update-error">{u.error}</p>{/if}
    {#if app.project?.dirty}<p class="warn">
        Save your charts first: installing restarts EZ2BMS.
      </p>{/if}
    <div class="actions">
      <button class="ez-btn go" onclick={() => void u.install()} data-testid="update-install"
        >Install and restart</button
      >
      <button class="ez-btn" onclick={() => u.skip()} data-testid="update-skip"
        >Skip this version</button
      >
      <span class="grow"></span>
      <button class="ez-btn" onclick={close}>Later</button>
    </div>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(2, 3, 8, 0.6);
    z-index: 30;
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, 94vw);
    z-index: 31;
    padding: 20px 22px;
    border-radius: 16px;
    background: linear-gradient(160deg, #111831, #070a14);
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
    letter-spacing: 0.1em;
  }
  .lead,
  .hint {
    color: var(--ink-dim);
    font-size: 13px;
  }
  .notes {
    max-height: 40vh;
    overflow: auto;
    white-space: pre-wrap;
    font-family: var(--font-ui);
    font-size: 13px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(88, 225, 255, 0.05);
    border: 1px solid rgba(88, 225, 255, 0.15);
  }
  .warn {
    color: var(--warn);
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: rgba(88, 225, 255, 0.12);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--neon);
    transition: width 0.2s;
  }
</style>
