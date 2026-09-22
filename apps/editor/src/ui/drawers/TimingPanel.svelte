<script lang="ts">
  // Tempo changes and STOPs, in chart order; click a position to go there.
  import { formatPosition, positionOf, setBpmAt, setStopAt } from '@ez2bms/chart-core';
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
</div>

<style>
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
  .at:hover {
    text-decoration: underline;
  }
</style>
