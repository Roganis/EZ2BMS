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
</script>

<div class="ez-form">
  <div class="cols">
    <div class="row">
      <label for="tp-init">Start BPM</label>
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
      <span class="lbl">Resolution</span>
      <div class="ro">{d.resolution} / beat</div>
    </div>
  </div>

  <h3>BPM changes</h3>
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
      <button class="ez-btn danger" onclick={() => setBpmAt(d, e.y, null)} aria-label="Remove"
        >×</button
      >
    </div>
  {:else}
    <p class="hint">None. <kbd>B</kbd> adds one at the cursor.</p>
  {/each}

  <h3>STOPs</h3>
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
      <button class="ez-btn danger" onclick={() => setStopAt(d, e.y, null)} aria-label="Remove"
        >×</button
      >
    </div>
  {:else}
    <p class="hint">None. <kbd>S</kbd> adds one at the cursor (length in pulses).</p>
  {/each}
  {#if data.stops.length}
    <p class="warn">
      EZ2 has no STOP: EZ2PORT gets a gap in time instead, so the scroll does not freeze.
    </p>
  {/if}

  <h3>Scroll speed</h3>
  {#each data.scrolls as e (e.y)}
    <div class="ev" data-testid="scroll-event">
      <button class="at" onclick={() => (app.view.cursor = e.y)}>{pos(e.y)}</button>
      <input
        type="number"
        min="0.01"
        step="0.05"
        value={e.rate}
        aria-label="Scroll multiplier"
        onchange={(ev) => {
          const r = Number(ev.currentTarget.value);
          if (r > 0) setScrollAt(d, e.y, r);
          else ev.currentTarget.value = String(e.rate);
        }}
      />
      <button class="ez-btn danger" onclick={() => setScrollAt(d, e.y, null)} aria-label="Remove"
        >×</button
      >
    </div>
  {:else}
    <p class="hint">
      None. <kbd>Ctrl K</kbd> <code>scroll 1.5</code> makes the field scroll 1.5 times as fast from the
      cursor on.
    </p>
  {/each}
  {#if data.legacy}
    <p class="hint">
      {data.legacy} more from the game chart, kept by an older import: they play and publish; Issues turns
      them into changes you can edit here.
    </p>
  {/if}
  {#if data.scrolls.length}
    <p class="hint">
      A multiplier on the player's speed: EZ2PORT eases to it over a few frames, and every note on
      the field moves with it. Timing does not change.
    </p>
  {/if}
  {#if data.kept.length}
    <details class="kept" data-testid="kept-records">
      <summary>From the game chart ({data.kept.length})</summary>
      <p class="hint">
        Records bmson has no place for, kept for a cabinet export, which writes them back on their
        tracks. Read-only; they move with a change of resolution. EZ2PORT does not use them.
      </p>
      {#each data.kept.slice(0, 200) as k (k.index)}
        <div class="krow" title={k.long}>
          <button class="at" onclick={() => (app.view.cursor = k.y)}>{pos(k.y)}</button>
          <span>{k.short}</span>
          <span class="trk">track {k.track}</span>
        </div>
      {/each}
      {#if data.kept.length > 200}<p class="hint">and {data.kept.length - 200} more</p>{/if}
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
