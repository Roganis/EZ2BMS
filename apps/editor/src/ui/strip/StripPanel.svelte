<script lang="ts">
  // A stem strip's panel, opened from its header: the stem's tempo, chopping
  // it to the grid, and cutting it at its onsets. Nothing here edits until a
  // button is pressed; every count is what that button would do.
  import {
    applyMidiCuts,
    gridsFor,
    parseSmf,
    planCuts,
    planMidiCuts,
    stepPulses,
    TICKS_PER_BEAT,
    type Smf,
    type SnapGrid,
  } from '@ez2bms/chart-core';
  import { baseName } from '../../bridge';
  import { errorText, t, tParts } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import { toast } from '../../state/toasts.svelte';
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
  /**
   * EZ2AC's own executable loads at most this many keysounds a chart. Shown
   * as it is written (2047, not 2,047), and the chart's count beside it too.
   */
  const SLOTS = 2047;

  // A MIDI file of the same song: cut where its notes start.
  let midi = $state.raw<{ name: string; smf: Smf } | null>(null);
  let midiTracks = $state<number[]>([]);
  let midiTempo = $state<'midi' | 'chart'>('chart');
  let midiOnGrid = $state(false);
  const midiPlan = $derived.by(() => {
    void slot.rev;
    if (!midi) return null;
    return planMidiCuts(doc, src, midi.smf, {
      tracks: midiTracks,
      tempo: midiTempo,
      ...(midiOnGrid ? { step: step(app.view.snap) } : {}),
    });
  });
  // With the chart's tempo, the cuts are checked now; with the MIDI's they
  // can only be once the tempo is set (Apply does both).
  const midiCuts = $derived.by(() => {
    const p = midiPlan;
    if (!p || 'error' in p) return 0;
    return p.tempo ? p.ys.length : planCuts(doc, src, p.ys, s.env()).length;
  });

  async function pickMidi() {
    const [path] = await app.backend.pickFiles(t('strip.midiPickTitle'), ['mid', 'midi', 'rmi']);
    if (!path) return;
    try {
      const smf = parseSmf(await app.backend.readFile(path));
      midi = { name: baseName(path), smf };
      midiTracks = smf.tracks.flatMap((track, i) => (track.notes ? [i] : []));
    } catch (e) {
      toast(t('strip.notMidi', { error: errorText(e) }), 'error');
    }
  }

  function cutAtMidi() {
    const p = midiPlan;
    if (!p || 'error' in p) return;
    const r = applyMidiCuts(doc, src, p, s.env());
    if (r.ok) toast(t('strip.midiDone', { n: r.ids?.length ?? 0, file: midi!.name }), 'ok');
    else toast(t('strip.notCut', { reason: r.reason }), 'warn');
  }

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
  aria-label={t('strip.label', { sound: src })}
>
  <header>
    <strong>{src}</strong>
    <span class="dim">{loaded && loaded.id !== null ? `${loaded.seconds.toFixed(1)} s` : ''}</span>
    <button class="x" onclick={close} aria-label={t('strip.close')}>×</button>
  </header>

  <section data-testid="strip-tempo">
    <h3>{t('strip.tempo')}</h3>
    {#if analysis?.tempo.length}
      <p>
        {#each tParts('strip.soundsLike', {}, ['bpms']) as part, k (k)}
          {#if 'slot' in part}
            {#each analysis.tempo as tempo, i (i)}
              <span class="bpm" class:best={i === 0}>{tempo.bpm.toFixed(2)}</span>
            {/each}
          {:else}{part.text}{/if}
        {/each}
      </p>
      <p class="hint">
        {t('strip.firstBeat', {
          ms: String(Math.round(analysis.tempo[0]!.first_beat * 1000)),
          pct: String(Math.round(analysis.tempo[0]!.confidence * 100)),
        })}
      </p>
      <button
        class="ez-btn"
        data-testid="strip-use-bpm"
        disabled={!oneTempo}
        title={oneTempo ? '' : t('strip.tempoChanges')}
        onclick={() => app.setStartBpm(analysis.tempo[0]!.bpm)}
        >{t('strip.useBpm', { bpm: analysis.tempo[0]!.bpm.toFixed(2) })}</button
      >
    {:else if listening}
      <p class="hint">{t('strip.listeningBeat')}</p>
    {:else}
      <p class="hint">{t('strip.noBeat')}</p>
    {/if}
  </section>

  <section>
    <h3>{t('chop.title')}</h3>
    <div class="row">
      <span class="lbl">{t('chop.every')}</span>
      <select bind:value={grid} data-testid="chop-grid">
        {#each grids as g (g.perMeasure)}<option value={g.perMeasure}>{g.label}</option>{/each}
      </select>
      <span class="dim">{t(range.selection ? 'chop.overSelection' : 'chop.overStem')}</span>
    </div>
    <label class="check"
      ><input
        type="checkbox"
        data-testid="chop-silence"
        checked={s.silenceDb !== null}
        onchange={(e) => (s.silenceDb = e.currentTarget.checked ? -48 : null)}
      />
      {t('chop.leaveSilence')}</label
    >
    <p class="hint" data-testid="chop-count">
      {t('chop.count', { n: cuts, total: String(keysounds + cuts) })}
      {#if keysounds + cuts > SLOTS}
        <span class="warn">{t('chop.overLimit', { max: String(SLOTS) })}</span>
      {/if}
    </p>
    <button
      class="ez-btn"
      data-testid="chop-go"
      disabled={!cuts}
      onclick={() => s.chop(doc, src, step(grid))}>{t('chop.go')}</button
    >
  </section>

  <section>
    <h3>{t('strip.onsets')}</h3>
    <label
      >{t('strip.sensitivity')}
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
      ><input type="checkbox" bind:checked={s.exact} data-testid="onset-exact" />
      {t('strip.exact')}</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={s.suggest} data-testid="onset-show" />
      {t('strip.showOnsets')}</label
    >
    <p class="hint" data-testid="onset-count">
      {listening ? t('strip.listening') : t('strip.cuts', { n: onsetCuts })}
    </p>
    <button
      class="ez-btn"
      data-testid="onsets-go"
      disabled={!onsetCuts}
      onclick={() => s.cutAtOnsets(doc, src, step(app.view.snap))}>{t('strip.cutAtOnsets')}</button
    >
  </section>

  <section data-testid="strip-midi">
    <h3>{t('strip.midi')}</h3>
    <button class="ez-btn" onclick={pickMidi} data-testid="midi-pick"
      >{midi ? midi.name : t('strip.midiPick')}</button
    >
    {#if midi}
      {#each midi.smf.tracks as track, i (i)}
        {#if track.notes}
          <label class="check"
            ><input
              type="checkbox"
              checked={midiTracks.includes(i)}
              onchange={(e) =>
                (midiTracks = e.currentTarget.checked
                  ? [...midiTracks, i]
                  : midiTracks.filter((x) => x !== i))}
            />
            {track.name || t('strip.midiTrack', { n: i + 1 })}
            <span class="dim">{t('strip.midiNotes', { n: track.notes })}</span></label
          >
        {/if}
      {/each}
      <label class="check"
        ><input
          type="radio"
          name="midi-tempo"
          checked={midiTempo === 'chart'}
          onchange={() => (midiTempo = 'chart')}
        />
        {t('strip.midiKeepTempo')}</label
      >
      <label class="check"
        ><input
          type="radio"
          name="midi-tempo"
          checked={midiTempo === 'midi'}
          onchange={() => (midiTempo = 'midi')}
          data-testid="midi-tempo-midi"
        />
        {t('strip.midiTakeTempo')}</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={midiOnGrid} />
        {t('strip.midiOnGrid')}</label
      >
      <p class="hint" data-testid="midi-count">
        {#if midiPlan && 'error' in midiPlan}
          <span class="warn">{midiPlan.error}</span>
        {:else if midiPlan}
          {t('strip.midiCount', { n: midiCuts, ms: midiPlan.worstMs.toFixed(1) })}
          {#if midiPlan.moves}
            <span class="warn">{t('strip.midiMoves', { n: midiPlan.moves })}</span>
          {/if}
        {/if}
      </p>
      <button class="ez-btn" data-testid="midi-go" disabled={!midiCuts} onclick={cutAtMidi}
        >{t('strip.midiCut')}</button
      >
    {/if}
  </section>

  <footer>
    <button
      class="ez-btn"
      onclick={() => {
        s.unpin(doc, src);
        close();
      }}>{t('strip.remove')}</button
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
