<script lang="ts">
  // Which EZ2BMS this is, where it keeps things, and what to send when
  // something went wrong: the log stays on this machine until you copy it.
  import { t } from '../i18n/i18n.svelte';
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
      .catch((e) => toast(t('about.logsFailed', { error: String(e) }), 'error'));
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" role="presentation" onpointerdown={close}></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('about.label')}
  data-testid="about"
>
  <h2>EZ2BMS</h2>
  <p class="lead">{t('about.lead')}</p>
  <dl>
    <dt>{t('about.version')}</dt>
    <dd data-testid="about-version">
      {i?.version ?? '…'} <span class="dim">({i?.commit ?? '…'})</span>
    </dd>
    <dt>{t('about.system')}</dt>
    <dd>{i ? `${i.os} ${i.arch}` : '…'}</dd>
    {#if i?.config_dir}<dt>{t('about.settings')}</dt>
      <dd class="path">{i.config_dir}</dd>{/if}
    {#if i?.cache_dir}<dt>{t('about.cache')}</dt>
      <dd class="path">{i.cache_dir}</dd>{/if}
    {#if i?.log_dir}<dt>{t('about.log')}</dt>
      <dd class="path">{i.log_dir}</dd>{/if}
  </dl>

  {#if prev}
    <p class="warn" data-testid="about-crashed">
      {t('about.crashed', { version: prev.version, when: formatWhen(prev.started_ms) })}
    </p>
  {/if}
  {#if d.errors.length}
    <p class="warn" data-testid="about-errors">
      {t('about.errors', { n: d.errors.length, last: d.errors.at(-1) ?? '' })}
    </p>
  {/if}

  <div class="updates" data-testid="about-updates">
    {#if app.updates.unsupported === 'no-key'}
      <p class="hint">{t('about.noKey')}</p>
    {:else}
      <button
        class="ez-btn"
        onclick={() => {
          close();
          app.prefsOpen = true;
        }}>{t('prefs.label')}…</button
      >
      <button
        class="ez-btn"
        disabled={app.updates.stage === 'checking'}
        onclick={() => void app.updates.check(true)}
        data-testid="about-check">{t('about.checkNow')}</button
      >
    {/if}
  </div>

  <p class="hint">{t('about.logHint')}</p>
  <div class="actions">
    <button class="ez-btn" onclick={reveal} data-testid="about-logs">{t('about.openLogs')}</button>
    <button class="ez-btn" onclick={() => void d.copyReport()} data-testid="about-report"
      >{t('about.copyReport')}</button
    >
    <span class="grow"></span>
    <button class="ez-btn" onclick={close}>{t('about.close')}</button>
  </div>
  <p class="legal">{t('about.legal')}</p>
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
  .updates {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
    font-size: 13px;
  }
</style>
