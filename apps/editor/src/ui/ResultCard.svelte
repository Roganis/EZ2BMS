<script lang="ts">
  // The end of a run, laid out like the cabinet's result screen: grade, score,
  // the five judgements, max combo, gauge. Enter retries, Esc closes.
  import { t } from '../i18n/i18n.svelte';
  import type { Result } from '../play/controller.svelte';

  let { result, onretry, onclose }: { result: Result; onretry: () => void; onclose: () => void } =
    $props();
  const ROWS = [
    ['KOOL', 1, '#ffffff'],
    ['COOL', 2, '#7fd0ff'],
    ['GOOD', 3, '#56f39a'],
    ['FAIL', 4, '#ffc247'],
    ['MISS', 5, '#ff5470'],
  ] as const;

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onretry();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim" role="presentation" onpointerdown={onclose}></div>
<div
  class="card"
  role="dialog"
  aria-modal="true"
  aria-label={t('result.label')}
  tabindex="-1"
  data-testid="result"
>
  <header>
    <span class="kind">{t(result.kind === 'auto' ? 'play.kindAuto' : 'play.kindTest')}</span>
    <h2>{result.title || t('result.untitled')}</h2>
    <p>{result.label}</p>
  </header>
  <div class="main">
    <div class="grade" class:failed={result.failed} data-testid="result-grade">{result.grade}</div>
    <div class="nums">
      <div class="score">{String(result.score).padStart(7, '0')}</div>
      <div class="rate">
        {t('result.rate', {
          rate: result.rate.toFixed(2),
          state: result.failed ? 'failed' : result.partial ? 'stopped' : 'clear',
        })}
      </div>
      {#if result.partial}<div class="partial">
          {t('result.partial', { n: result.total })}
        </div>{/if}
      <table>
        <tbody>
          {#each ROWS as [name, j, color] (name)}
            <tr><th style:color>{name}</th><td>{result.counts[j]}</td></tr>
          {/each}
          <tr class="sep"><th>{t('result.maxCombo')}</th><td>{result.maxCombo}</td></tr>
          <tr><th>{t('result.notes')}</th><td>{result.total}</td></tr>
          <tr><th>{t('result.gauge')}</th><td>{result.gauge.toFixed(1)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <footer>
    <button class="ez-btn" onclick={onretry}>{t('result.retry')} <kbd>Enter</kbd></button>
    <button class="ez-btn" onclick={onclose}>{t('result.close')} <kbd>Esc</kbd></button>
  </footer>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(2, 3, 8, 0.6);
  }
  .card {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, 92%);
    padding: 22px 26px;
    border-radius: 16px;
    background: linear-gradient(160deg, #111831, #070a14);
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow:
      0 30px 80px rgba(0, 0, 0, 0.7),
      0 0 40px rgba(88, 225, 255, 0.15);
    animation: rise 0.35s var(--ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, -44%);
    }
  }
  header {
    text-align: center;
  }
  .kind {
    font-family: var(--font-num);
    font-size: 11px;
    letter-spacing: 0.3em;
    color: var(--neon-2);
  }
  h2 {
    margin: 6px 0 2px;
    font-size: 22px;
  }
  header p {
    margin: 0;
    color: var(--ink-dim);
    font-size: 13px;
  }
  .main {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 24px;
    align-items: center;
    margin: 18px 0;
  }
  .grade {
    font-size: 96px;
    font-weight: 900;
    font-style: italic;
    line-height: 1;
    background: linear-gradient(180deg, #fff, #58e1ff 55%, #ff4fd8);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 18px rgba(88, 225, 255, 0.55));
    min-width: 150px;
    text-align: center;
  }
  .grade.failed {
    background: linear-gradient(180deg, #fff, #ff5470);
    -webkit-background-clip: text;
    background-clip: text;
  }
  .score {
    font-family: var(--font-num);
    font-size: 30px;
    letter-spacing: 0.08em;
    color: #fff;
    text-shadow: var(--glow);
  }
  .rate {
    color: var(--ink-dim);
    font-family: var(--font-num);
    margin-bottom: 8px;
  }
  .partial {
    color: var(--ink-faint);
    font-size: 11px;
    margin: -6px 0 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-num);
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: 700;
    color: var(--ink-dim);
    padding: 2px 0;
  }
  td {
    text-align: right;
  }
  .sep th,
  .sep td {
    padding-top: 8px;
  }
  footer {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
</style>
