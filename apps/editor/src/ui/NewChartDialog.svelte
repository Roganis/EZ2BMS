<script lang="ts">
  // A new chart: pick the mode from a wheel that shows each one's lanes, the
  // tier and level; the file is named the way EZ2PORT names charts.
  import {
    chartBaseName,
    deriveSongKey,
    isValidSongKey,
    LANES,
    modeDef,
    MODES,
    type ModeId,
    type Tier,
  } from '@ez2bms/chart-core';
  import { app } from '../state/app.svelte';
  import { toast } from '../state/toasts.svelte';
  import { KIND_CSS } from './lanecolors';

  let { onclose }: { onclose: () => void } = $props();
  const p = app.project!;
  const base = p.active?.doc.data;
  let mode = $state<ModeId>(p.active?.mode ?? '5k');
  let tier = $state<Tier>('NM');
  let level = $state(1);
  let bpm = $state(base?.info.initBpm ?? 150);
  let copySounds = $state(!!base?.channels.length);
  if (!p.sidecar.key) p.sidecar.key = deriveSongKey(p.name);
  const key = $derived(p.sidecar.key);
  const file = $derived(`${chartBaseName(mode, key || 'song', tier)}.bmson`);
  const taken = $derived(
    p.charts.some((c) => c.mode === mode && c.tier === tier) ||
      p.charts.some((c) => c.file === file),
  );
  const kindOf = (x: number) => LANES.find((l) => l.x === x)?.kind ?? 'white';

  function create() {
    if (taken) return toast('This song already has that chart', 'warn');
    const slot = app.song.createChart(mode, tier, { level, bpm, copySounds });
    if (!slot) return;
    toast(`New chart: ${slot.file}`, 'ok');
    onclose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      onclose();
    } else if (e.key === 'Enter') create();
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="scrim" role="presentation" onpointerdown={onclose}></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label="New chart"
  tabindex="-1"
  data-testid="new-chart"
>
  <h2>New chart</h2>
  <div class="wheel">
    {#each MODES.filter((m) => m.portPlayable) as m (m.id)}
      <button
        class="mode"
        class:on={mode === m.id}
        onclick={() => (mode = m.id)}
        title={m.portName}
      >
        <span class="lanes">
          {#each modeDef(m.id).columns as c (c.x)}<i
              style:background={KIND_CSS[kindOf(c.x)]}
              class:wide={c.kind === 'scratch' || c.kind === 'pedal'}
            ></i>{/each}
        </span>
        <span class="lbl">{m.label}</span>
        <span class="port">{m.portName}</span>
      </button>
    {/each}
  </div>
  <div class="ez-form">
    <div class="cols">
      <div class="row">
        <span class="lbl2">Tier</span>
        <div class="ez-seg">
          {#each ['NM', 'HD', 'SHD', 'EX'] as const as t (t)}<button
              class:on={tier === t}
              onclick={() => (tier = t)}>{t}</button
            >{/each}
        </div>
      </div>
      <div class="row">
        <label for="nc-level">Level <b>{level}</b></label>
        <input id="nc-level" type="range" min="1" max="20" bind:value={level} />
      </div>
      <div class="row">
        <label for="nc-bpm">BPM</label>
        <input id="nc-bpm" type="number" min="1" max="999" step="any" bind:value={bpm} />
      </div>
    </div>
    <div class="cols">
      <div class="row">
        <label for="nc-key">Song key</label>
        <input id="nc-key" bind:value={p.sidecar.key} spellcheck="false" />
      </div>
      {#if base}
        <label class="check"
          ><input type="checkbox" bind:checked={copySounds} /> Use this song's {base.channels
            .length} sounds</label
        >
      {/if}
    </div>
    <p class="hint">
      File: <code>{file}</code>{#if taken}<span class="warn"> - already in this song</span>{/if}
    </p>
  </div>
  <footer>
    <button class="ez-btn" onclick={onclose}>Cancel</button>
    <button
      class="ez-btn go"
      onclick={create}
      disabled={taken || !isValidSongKey(key)}
      data-testid="create-chart">Create <kbd>Enter</kbd></button
    >
  </footer>
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
    width: min(860px, 94vw);
    z-index: 31;
    padding: 20px 22px;
    border-radius: 16px;
    background: linear-gradient(160deg, #111831, #070a14);
    border: 1px solid rgba(88, 225, 255, 0.35);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
  }
  h2 {
    margin: 0 0 14px;
    font-size: 16px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .wheel {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
  }
  .mode {
    all: unset;
    cursor: pointer;
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 10px 6px;
    border-radius: 10px;
    border: 1px solid rgba(88, 225, 255, 0.14);
    transition:
      transform 0.15s var(--ease-out),
      border-color 0.15s;
  }
  .mode:hover {
    transform: translateY(-2px);
  }
  .mode.on {
    border-color: var(--neon);
    background: rgba(88, 225, 255, 0.08);
    box-shadow: 0 0 16px rgba(88, 225, 255, 0.25);
  }
  .lanes {
    display: flex;
    gap: 2px;
    height: 46px;
  }
  .lanes i {
    width: 6px;
    border-radius: 2px;
    opacity: 0.85;
  }
  .lanes i.wide {
    width: 10px;
  }
  .lbl {
    font-size: 11px;
    text-align: center;
  }
  .port {
    font-size: 10px;
    color: var(--ink-faint);
    font-family: var(--font-num);
  }
  .ez-form {
    padding: 14px 0 0;
  }
  .lbl2 {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
    color: var(--ink-dim) !important;
    align-self: end;
  }
  .check input {
    width: auto;
  }
  code {
    font-family: var(--font-num);
    color: var(--neon);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .go {
    border-color: var(--neon);
  }
</style>
