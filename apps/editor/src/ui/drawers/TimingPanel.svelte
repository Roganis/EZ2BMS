<script lang="ts">
  // Tempo changes, STOPs and scroll changes, in chart order; click a
  // position to go there.
  import {
    formatPosition,
    keptRecordsOf,
    legacyScrollIndices,
    positionOf,
    setBpmAt,
    setScrollAt,
    setStopAt,
  } from '@ez2bms/chart-core';
  import { t, tParts } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const d = $derived(slot.doc);
  const data = $derived.by(() => {
    void slot.rev;
    const x = slot.doc.data;
    return {
      init: x.info.initBpm ?? 120,
      bpms: [...x.bpmEvents].filter((e) => e.y > 0).sort((a, b) => a.y - b.y),
      stops: [...x.stopEvents].sort((a, b) => a.y - b.y),
      scrolls: x.scrollEvents,
      legacy: legacyScrollIndices(x).length,
      kept: keptRecordsOf(x).filter((k) => k.scroll === undefined),
    };
  });
  const pos = (y: number) => formatPosition(positionOf(y, d.resolution));
  const noBpm = $derived(tParts('timing.noBpm', {}, ['key']));
  const noStops = $derived(tParts('timing.noStops', {}, ['key']));
  const noScroll = $derived(tParts('timing.noScroll', {}, ['palette', 'command']));
</script>

<div class="ez-form">
  <div class="cols">
    <div class="row">
      <label for="tp-init">{t('timing.startBpm')}</label>
      <input
        id="tp-init"
        type="number"
        min="1"
        max="999"
        step="any"
        value={data.init}
        onchange={(e) => setBpmAt(d, 0, Number(e.currentTarget.value))}
      />
    </div>
    <div class="row">
      <span class="lbl">{t('timing.resolution')}</span>
      <div class="ro">{t('timing.perBeat', { n: d.resolution })}</div>
    </div>
  </div>

  <h3>{t('timing.bpmChanges')}</h3>
  {#each data.bpms as e (e.y)}
    <div class="ev">
      <button class="at" onclick={() => (app.view.cursor = e.y)}>{pos(e.y)}</button>
      <input
        type="number"
        min="1"
        max="999"
        step="any"
        value={e.bpm}
        onchange={(ev) => setBpmAt(d, e.y, Number(ev.currentTarget.value))}
      />
      <button
        class="ez-btn danger"
        onclick={() => setBpmAt(d, e.y, null)}
        aria-label={t('timing.remove')}>×</button
      >
    </div>
  {:else}
    <p class="hint">
      {#each noBpm as p, i (i)}{#if 'slot' in p}<kbd>B</kbd>{:else}{p.text}{/if}{/each}
    </p>
  {/each}

  <h3>{t('timing.stops')}</h3>
  {#each data.stops as e (e.y)}
    <div class="ev">
      <button class="at" onclick={() => (app.view.cursor = e.y)}>{pos(e.y)}</button>
      <input
        type="number"
        min="1"
        step="1"
        value={e.duration}
        onchange={(ev) => setStopAt(d, e.y, Number(ev.currentTarget.value))}
      />
      <button
        class="ez-btn danger"
        onclick={() => setStopAt(d, e.y, null)}
        aria-label={t('timing.remove')}>×</button
      >
    </div>
  {:else}
    <p class="hint">
      {#each noStops as p, i (i)}{#if 'slot' in p}<kbd>S</kbd>{:else}{p.text}{/if}{/each}
    </p>
  {/each}
  {#if data.stops.length}
    <p class="warn">{t('timing.stopWarn')}</p>
  {/if}

  <h3>{t('timing.scroll')}</h3>
  {#each data.scrolls as e (e.y)}
    <div class="ev" data-testid="scroll-event">
      <button class="at" onclick={() => (app.view.cursor = e.y)}>{pos(e.y)}</button>
      <input
        type="number"
        min="0.01"
        step="0.05"
        value={e.rate}
        aria-label={t('timing.scrollMultiplier')}
        onchange={(ev) => {
          const r = Number(ev.currentTarget.value);
          if (r > 0) setScrollAt(d, e.y, r);
          else ev.currentTarget.value = String(e.rate);
        }}
      />
      <button
        class="ez-btn danger"
        onclick={() => setScrollAt(d, e.y, null)}
        aria-label={t('timing.remove')}>×</button
      >
    </div>
  {:else}
    <p class="hint">
      {#each noScroll as p, i (i)}{#if 'text' in p}{p.text}{:else if p.slot === 'palette'}<kbd
            >Ctrl K</kbd
          >{:else}<code>scroll 1.5</code>{/if}{/each}
    </p>
  {/each}
  {#if data.legacy}
    <p class="hint">{t('timing.legacy', { n: data.legacy })}</p>
  {/if}
  {#if data.scrolls.length}
    <p class="hint">{t('timing.scrollHint')}</p>
  {/if}
  {#if data.kept.length}
    <details class="kept" data-testid="kept-records">
      <summary>{t('timing.kept', { n: data.kept.length })}</summary>
      <p class="hint">{t('timing.keptHint')}</p>
      {#each data.kept.slice(0, 200) as k (k.index)}
        <div class="krow" title={k.long}>
          <button class="at" onclick={() => (app.view.cursor = k.y)}>{pos(k.y)}</button>
          <span>{k.short}</span>
          <span class="trk">{t('timing.track', { n: k.track })}</span>
        </div>
      {/each}
      {#if data.kept.length > 200}<p class="hint">
          {t('timing.andMore', { n: data.kept.length - 200 })}
        </p>{/if}
    </details>
  {/if}
</div>

<style>
  .kept summary {
    cursor: pointer;
    color: var(--ink-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 10px;
  }
  .krow {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .trk {
    font-family: var(--font-num);
    color: var(--ink-faint);
  }
  .ro {
    padding: 6px 0;
    font-family: var(--font-num);
    color: var(--ink-dim);
  }
  .ev {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: center;
  }
  .at {
    all: unset;
    cursor: pointer;
    font-family: var(--font-num);
    color: var(--neon);
    font-size: 12px;
  }
  code {
    font-family: var(--font-num);
    color: var(--neon);
  }
  .at:hover {
    text-decoration: underline;
  }
</style>
