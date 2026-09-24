<script lang="ts">
  // Record mode's panel over the field: the count-in, the take as it goes,
  // and the review - what the take would place, where it clashes or finds
  // nothing to key, how it sat against the grid - with Keep, Retake, Discard.
  import { onMount } from 'svelte';
  import { t, tParts } from '../i18n/i18n.svelte';
  import { normRecord } from '../play/recorder.svelte';
  import { app } from '../state/app.svelte';
  import type { RecordOptions } from '../state/settings.svelte';

  let { box }: { box: { left: number; right: number; judgeY: number } } = $props();
  const r = app.recorder;
  const o = $derived(normRecord(app.settings.data.record));
  const counts = $derived.by(() => {
    const c = { ok: 0, clash: 0, silent: 0 };
    for (const s of r.review?.states ?? []) c[s]++;
    return c;
  });
  const ms = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

  function set<K extends keyof RecordOptions>(k: K, v: RecordOptions[K]) {
    app.settings.set('record', { ...o, [k]: v });
    // Holds and the grid change where the take lands: snap it again.
    if (k === 'holdMinMs' || k === 'quantize') r.resnap();
  }

  onMount(() => {
    // Ahead of the editor's own keys: Enter keeps, Esc discards (or stops).
    const onKey = (e: KeyboardEvent) => {
      if (r.state === 'review' && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === 'Enter') r.keep();
        else r.discard();
      } else if ((r.state === 'countin' || r.state === 'recording') && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void r.stop();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<div
  class="rec"
  style:left="{box.left}px"
  style:width="{Math.max(260, box.right - box.left)}px"
  data-testid="record-panel"
>
  {#if r.state === 'countin'}
    <div class="count" data-testid="record-countin">{r.countLeft}</div>
    <div class="line"><span class="dot"></span> {t('record.starting')}</div>
  {:else if r.state === 'recording'}
    <div class="line" data-testid="record-live">
      <span class="dot on"></span>
      {t('record.live', { n: r.presses })}
      <span class="dim">{t('record.stopHint')}</span>
    </div>
  {:else if r.state === 'review' && r.review}
    {@const s = r.review.stats}
    <div class="card" data-testid="record-review">
      <div class="head">
        <b>{t('record.take')}</b>
        <span data-testid="record-count">{t('record.notes', { n: r.review.notes.length })}</span>
        {#if r.review.classic}<span class="tag">{t('record.classic')}</span>{/if}
      </div>
      <div class="states">
        <span class="ok" data-testid="record-ok">{t('record.ok', { n: counts.ok })}</span>
        {#if counts.clash}<span class="clash" data-testid="record-clash"
            >{t('record.clash', { n: counts.clash })}</span
          >{/if}
        {#if counts.silent}<span class="silent" data-testid="record-silent"
            >{t('record.silent', { n: counts.silent })}</span
          >{/if}
      </div>
      <div class="stats" title={t('record.statsTitle')}>
        {t('record.stats', {
          mean: ms(s.meanMs),
          median: ms(s.medianMs),
          early: s.early,
          late: s.late,
        })}
      </div>
      <div class="opts">
        <label
          >{#each tParts('record.holdsFrom', {}, ['field']) as p, i (i)}{#if 'slot' in p}<input
                type="number"
                min="0"
                step="10"
                value={o.holdMinMs}
                onchange={(e) => set('holdMinMs', Number(e.currentTarget.value))}
              />{:else}{p.text}{/if}{/each}</label
        >
        <span class="ez-seg">
          <button class:on={o.quantize === 'grid'} onclick={() => set('quantize', 'grid')}
            >{t('record.grid')}</button
          ><button
            class:on={o.quantize === 'exact'}
            onclick={() => set('quantize', 'exact')}
            title={t('record.exactTitle')}>{t('record.exact')}</button
          >
        </span>
        <label
          >{#each tParts('record.countIn', {}, ['field']) as p, i (i)}{#if 'slot' in p}<input
                type="number"
                min="0"
                max="16"
                value={o.countIn}
                onchange={(e) => set('countIn', Number(e.currentTarget.value))}
              />{:else}{p.text}{/if}{/each}</label
        >
        <label class="check"
          ><input
            type="checkbox"
            checked={o.metronome}
            onchange={(e) => set('metronome', e.currentTarget.checked)}
          />
          {t('record.metronome')}</label
        >
        {#if !r.review.classic}
          <label class="check"
            ><input
              type="checkbox"
              checked={o.muteLanes}
              onchange={(e) => set('muteLanes', e.currentTarget.checked)}
            />
            {t('record.muteLanes')}</label
          >
        {/if}
      </div>
      <div class="buttons">
        <button class="ez-btn go" onclick={() => r.keep()} data-testid="record-keep"
          >{t('record.keep')} <kbd>Enter</kbd></button
        >
        <button class="ez-btn" onclick={() => void r.retake()} data-testid="record-retake"
          >{t('record.retake')} <kbd>R</kbd></button
        >
        <button class="ez-btn" onclick={() => r.discard()} data-testid="record-discard"
          >{t('record.discard')} <kbd>Esc</kbd></button
        >
      </div>
    </div>
  {/if}
</div>

<style>
  .rec {
    position: absolute;
    top: 10px;
    display: grid;
    justify-items: center;
    gap: 6px;
    pointer-events: none;
    z-index: 5;
  }
  .count {
    font-family: var(--font-num);
    font-size: 64px;
    font-weight: 900;
    color: var(--neon);
    text-shadow: 0 0 18px rgba(88, 225, 255, 0.7);
  }
  .line {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-family: var(--font-num);
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(7, 10, 20, 0.8);
    border: 1px solid rgba(255, 92, 122, 0.5);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ff5c7a;
    opacity: 0.5;
  }
  .dot.on {
    opacity: 1;
    box-shadow: 0 0 10px #ff5c7a;
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.35;
    }
  }
  .dim {
    color: var(--ink-faint);
  }
  .card {
    pointer-events: auto;
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 12px;
    background: linear-gradient(160deg, rgba(17, 24, 49, 0.96), rgba(7, 10, 20, 0.96));
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    font-size: 12px;
    max-width: 520px;
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .tag {
    font-size: 10px;
    color: var(--ink-faint);
  }
  .states {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .ok {
    color: #7dffb2;
  }
  .clash {
    color: #ff5c7a;
  }
  .silent {
    color: #8a8fa8;
  }
  .stats {
    font-family: var(--font-num);
    color: var(--ink-dim);
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    color: var(--ink-dim);
  }
  .opts input[type='number'] {
    width: 54px;
  }
  .check {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .go {
    border-color: var(--neon);
  }
</style>
