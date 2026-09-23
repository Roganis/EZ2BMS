<script lang="ts">
  // A stem strip's panel, opened from its header: the stem's tempo, chopping
  // it to the grid, and cutting it at its onsets. Nothing here edits until a
  // button is pressed; every count is what that button would do.
  import { gridsFor, stepPulses, TICKS_PER_BEAT, type SnapGrid } from '@ez2bms/chart-core';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';

  let { slot, src, box }: { slot: ChartSlot; src: string; box: { left: number; top: number } } =
    $props();

  const s = app.strips;
  const doc = $derived(slot.doc);
  const grids = $derived(gridsFor(doc.resolution));
  let grid = $state<number>(app.view.snap);
  const step = (g: number) =>
    stepPulses(grids.find((x: SnapGrid) => x.perMeasure === g) ?? grids.at(-1)!, doc.resolution) ??
    doc.resolution / TICKS_PER_BEAT;

  const loaded = $derived(app.audio.loadedInfo(src));
  const analysis = $derived.by(() => {
    void s.rev;
    return loaded && loaded.id !== null ? s.analyses.get(loaded) : undefined;
  });
  const listening = $derived(!!loaded && loaded.id !== null && !analysis);
  // One tempo in the chart: "Use this BPM" sets it.
  const oneTempo = $derived.by(() => {
    void slot.rev;
    return !doc.data.bpmEvents.some((e) => e.y > 0);
  });

  const range = $derived.by(() => {
    void slot.rev;
    void doc.selection;
    return s.chopRange(doc, src);
  });
  const cuts = $derived.by(() => {
    void slot.rev;
    void s.rev;
    void s.silenceDb;
    void doc.selection;
    return s.chopPlan(doc, src, step(grid)).length;
  });
  const onsetCuts = $derived.by(() => {
    void slot.rev;
    void s.rev;
    void s.sensitivity;
    void s.exact;
    return s.suggestions(doc, src, step(app.view.snap)).length;
  });
  const keysounds = $derived.by(() => {
    void slot.rev;
    return s.keysounds(doc, slot.mode);
  });
  /** EZ2AC's own executable loads at most this many keysounds a chart. */
  const SLOTS = 2047;

  function close() {
    s.panel = null;
    s.suggest = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="panel ez-form"
  style:left="{box.left}px"
  style:top="{box.top}px"
  data-testid="strip-panel"
  role="dialog"
  aria-label="{src}: slicing"
>
  <header>
    <strong>{src}</strong>
    <span class="dim">{loaded && loaded.id !== null ? `${loaded.seconds.toFixed(1)} s` : ''}</span>
    <button class="x" onclick={close} aria-label="Close">×</button>
  </header>

  <section data-testid="strip-tempo">
    <h3>Tempo</h3>
    {#if analysis?.tempo.length}
      <p>
        Sounds like
        {#each analysis.tempo as t, i (i)}
          <span class="bpm" class:best={i === 0}>{t.bpm.toFixed(2)}</span>
        {/each}
        BPM
      </p>
      <p class="hint">
        First beat {Math.round(analysis.tempo[0]!.first_beat * 1000)} ms into the file ·
        {Math.round(analysis.tempo[0]!.confidence * 100)}% sure
      </p>
      <button
        class="ez-btn"
        data-testid="strip-use-bpm"
        disabled={!oneTempo}
        title={oneTempo ? '' : 'The chart changes tempo: set it on the Timing tab'}
        onclick={() => app.setStartBpm(analysis.tempo[0]!.bpm)}
        >Use {analysis.tempo[0]!.bpm.toFixed(2)} BPM</button
      >
    {:else if listening}
      <p class="hint">Listening for the beat…</p>
    {:else}
      <p class="hint">No steady beat found.</p>
    {/if}
  </section>

  <section>
    <h3>Chop to the grid</h3>
    <div class="row">
      <span class="lbl">Every</span>
      <select bind:value={grid} data-testid="chop-grid">
        {#each grids as g (g.perMeasure)}<option value={g.perMeasure}>{g.label}</option>{/each}
      </select>
      <span class="dim">{range.selection ? 'over the selected slices' : 'over the whole stem'}</span
      >
    </div>
    <label class="check"
      ><input
        type="checkbox"
        data-testid="chop-silence"
        checked={s.silenceDb !== null}
        onchange={(e) => (s.silenceDb = e.currentTarget.checked ? -48 : null)}
      /> Leave silence uncut (under -48 dB)</label
    >
    <p class="hint" data-testid="chop-count">
      {`${cuts} ${cuts === 1 ? 'cut' : 'cuts'}`} · {keysounds + cuts} keysounds in this chart
      {#if keysounds + cuts > SLOTS}
        <span class="warn">- more than the {SLOTS} EZ2AC's own executable loads</span>
      {/if}
    </p>
    <button
      class="ez-btn"
      data-testid="chop-go"
      disabled={!cuts}
      onclick={() => s.chop(doc, src, step(grid))}>Chop</button
    >
  </section>

  <section>
    <h3>Cut at onsets</h3>
    <label
      >Sensitivity
      <input
        type="range"
        min="0.02"
        max="1"
        step="0.01"
        value={1.02 - s.sensitivity}
        data-testid="onset-sensitivity"
        oninput={(e) => (s.sensitivity = 1.02 - Number(e.currentTarget.value))}
      /></label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={s.exact} data-testid="onset-exact" /> Exactly (to 1/48 beat),
      not to the snap grid</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={s.suggest} data-testid="onset-show" /> Show them on the strip</label
    >
    <p class="hint" data-testid="onset-count">
      {#if listening}Listening…{:else}{onsetCuts} {onsetCuts === 1 ? 'cut' : 'cuts'}{/if}
    </p>
    <button
      class="ez-btn"
      data-testid="onsets-go"
      disabled={!onsetCuts}
      onclick={() => s.cutAtOnsets(doc, src, step(app.view.snap))}>Cut at onsets</button
    >
  </section>

  <footer>
    <button
      class="ez-btn"
      onclick={() => {
        s.unpin(doc, src);
        close();
      }}>Remove the strip</button
    >
  </footer>
</div>

<style>
  .panel {
    position: absolute;
    z-index: 20;
    width: 270px;
    max-height: calc(100% - 40px);
    overflow: auto;
    padding: 10px 12px;
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    border-radius: var(--radius);
    box-shadow: var(--glow);
    user-select: none;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  header strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    margin-left: auto;
    background: none;
    border: 0;
    color: var(--ink-dim);
    font-size: 18px;
    cursor: pointer;
  }
  section {
    margin-top: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dim {
    color: var(--ink-dim);
    font-size: 12px;
  }
  .bpm {
    font-family: var(--font-num);
    color: var(--ink-dim);
    margin-right: 4px;
  }
  .bpm.best {
    color: var(--neon);
    font-weight: bold;
  }
  footer {
    margin-top: 10px;
  }
</style>
