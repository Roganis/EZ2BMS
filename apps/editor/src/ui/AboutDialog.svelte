<script lang="ts">
  // Which EZ2BMS this is, where it keeps things, and what to send when
  // something went wrong: the log stays on this machine until you copy it.
  import { app } from '../state/app.svelte';
  import { formatWhen } from '../state/autosave';
  import { toast } from '../state/toasts.svelte';

  const d = app.diag;
  const i = $derived(d.info);
  const prev = $derived(i?.previous_session ?? null);
  const close = () => (d.aboutOpen = false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const reveal = () =>
    app.backend.diag
      .revealLogs()
      .catch((e) => toast(`Could not open the log folder: ${e}`, 'error'));
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" role="presentation" onpointerdown={close}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="About EZ2BMS" data-testid="about">
  <h2>EZ2BMS</h2>
  <p class="lead">An arcade-native chart editor for EZ2PORT and EZ2AC cabinets.</p>
  <dl>
    <dt>Version</dt>
    <dd data-testid="about-version">
      {i?.version ?? '…'} <span class="dim">({i?.commit ?? '…'})</span>
    </dd>
    <dt>System</dt>
    <dd>{i ? `${i.os} ${i.arch}` : '…'}</dd>
    {#if i?.config_dir}<dt>Settings</dt>
      <dd class="path">{i.config_dir}</dd>{/if}
    {#if i?.cache_dir}<dt>Cache</dt>
      <dd class="path">{i.cache_dir}</dd>{/if}
    {#if i?.log_dir}<dt>Log</dt>
      <dd class="path">{i.log_dir}</dd>{/if}
  </dl>

  {#if prev}
    <p class="warn" data-testid="about-crashed">
      The last run ({prev.version}, started {formatWhen(prev.started_ms)}) closed without shutting
      down. Its last lines are in the log; the autosave kept unsaved charts.
    </p>
  {/if}
  {#if d.errors.length}
    <p class="warn" data-testid="about-errors">
      {d.errors.length} error{d.errors.length === 1 ? '' : 's'} this run, the last: {d.errors.at(
        -1,
      )}
    </p>
  {/if}

  <p class="hint">
    The log stays on this computer. To report a problem, copy a report (the version, this run's
    errors and the end of the log) and paste it into your message.
  </p>
  <div class="actions">
    <button class="ez-btn" onclick={reveal} data-testid="about-logs">Open the log folder</button>
    <button class="ez-btn" onclick={() => void d.copyReport()} data-testid="about-report"
      >Copy a report</button
    >
    <span class="grow"></span>
    <button class="ez-btn" onclick={close}>Close</button>
  </div>
  <p class="legal">
    GPL-3.0. Uses SDL 3 (zlib licence) to read game controllers, as EZ2PORT does. Nothing of the
    game ships with EZ2BMS: it reads your own files.
  </p>
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
    letter-spacing: 0.14em;
  }
  .lead {
    margin: 0 0 14px;
    color: var(--ink-dim);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    margin: 0 0 12px;
    font-size: 13px;
  }
  dt {
    color: var(--ink-dim);
  }
  dd {
    margin: 0;
  }
  .path,
  .dim {
    font-family: var(--font-num);
    color: var(--ink-dim);
    word-break: break-all;
  }
  .warn {
    color: var(--warn);
    font-size: 13px;
  }
  .hint,
  .legal {
    color: var(--ink-dim);
    font-size: 12px;
  }
  .legal {
    margin-bottom: 0;
    color: var(--ink-faint);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
</style>
