<script lang="ts">
  // The app-wide choices that are not about a song: the language, and
  // whether to look for updates. (EZ2PORT's folders, controls and timing
  // keep their own panels, where they are used.)
  import { LOCALES, LOCALE_NAMES } from '@ez2bms/chart-core';
  import { i18n, t, type LanguageChoice } from '../i18n/i18n.svelte';
  import { app } from '../state/app.svelte';

  const close = () => (app.prefsOpen = false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const system = $derived(LOCALE_NAMES[i18n.resolve('auto')]);
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" role="presentation" onpointerdown={close}></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={t('prefs.label')}
  data-testid="prefs"
>
  <h2>{t('prefs.label')}</h2>
  <label class="row">
    <span>{t('prefs.language')}</span>
    <select
      value={app.settings.data.language}
      onchange={(e) => app.setLanguage(e.currentTarget.value as LanguageChoice)}
      data-testid="prefs-language"
    >
      <option value="auto">{t('prefs.languageAuto', { name: system })}</option>
      {#each LOCALES as l (l)}
        <!-- Each language in its own words, whatever the UI's language. -->
        <option value={l} lang={l}>{LOCALE_NAMES[l]}</option>
      {/each}
    </select>
  </label>
  {#if i18n.locale !== 'en'}<p class="hint">{t('prefs.languageHint')}</p>{/if}

  {#if app.updates.unsupported === 'no-key'}
    <p class="hint">{t('about.noKey')}</p>
  {:else}
    <label class="check">
      <input
        type="checkbox"
        checked={app.settings.data.updates.check}
        onchange={(e) => app.updates.setAutoCheck(e.currentTarget.checked)}
        data-testid="prefs-updates"
      />
      {t('prefs.updates')}
    </label>
  {/if}

  <div class="actions">
    <span class="grow"></span>
    <button class="ez-btn" onclick={close}>{t('prefs.close')}</button>
  </div>
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
    width: min(480px, 94vw);
    z-index: 31;
    padding: 20px 22px;
    border-radius: 16px;
    background: linear-gradient(160deg, #111831, #070a14);
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0.1em;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  .hint {
    margin: 0;
    color: var(--ink-dim);
    font-size: 12px;
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
