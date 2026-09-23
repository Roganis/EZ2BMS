<script lang="ts">
  // The neon strip: which chart, where the cursor is (BPM, position, time),
  // snap and speed, and the Edit/Play switch.
  import { formatPosition, formatSeconds, positionOf } from '@ez2bms/chart-core';
  import { app } from '../state/app.svelte';
  import type { Project } from '../state/project.svelte';
  import { chartTiming } from '../state/timing';

  let { project }: { project: Project } = $props();
  const v = app.view;
  const slot = $derived(project.active);
  const timing = $derived.by(() => {
    if (!slot) return undefined;
    void slot.rev;
    return chartTiming(slot.doc);
  });
  const bpm = $derived(timing ? timing.bpmAt(v.cursor) : 0);
  const pos = $derived.by(() => {
    if (!slot) return '---:-:--';
    const p = positionOf(v.cursor, slot.doc.resolution);
    // Moving: whole ticks, so the readout does not flicker.
    return formatPosition(v.playing ? { ...p, tick: Math.floor(p.tick) } : p);
  });
  const time = $derived(timing ? formatSeconds(timing.secondsAt(v.cursor)) : '-:--.---');
  const canUndo = $derived(slot ? (void slot.rev, slot.doc.canUndo) : false);
  const canRedo = $derived(slot ? (void slot.rev, slot.doc.canRedo) : false);
</script>

<header class="bar">
  <div class="brand"><span class="ez">EZ2</span>BMS</div>
  <nav class="charts" aria-label="Charts">
    {#each project.charts as c, i (c.file)}
      <button
        class="chart tier-{c.tier}"
        class:on={i === project.activeIndex}
        onclick={() => app.selectChart(i)}
        title={c.file}
      >
        <span class="mode">{c.label}</span>
        <span class="lv">{c.level}</span>
        {#if c.dirty}<span class="dot" title="unsaved"></span>{/if}
      </button>
    {/each}
  </nav>

  <div class="readouts">
    <div class="ro"><span>BPM</span><b data-testid="ro-bpm">{bpm.toFixed(bpm % 1 ? 2 : 0)}</b></div>
    <div class="ro wide"><span>POS</span><b data-testid="ro-pos">{pos}</b></div>
    <div class="ro wide"><span>TIME</span><b>{time}</b></div>
    <div class="ro"><span>SNAP</span><b data-testid="ro-snap">1/{v.snap}</b></div>
    <div class="ro">
      {#if v.mode === 'play'}<span>SPEED</span><b>{v.speed}%</b>{:else}<span>ZOOM</span><b
          >{Math.round((v.zoom / 76.8) * 100)}%</b
        >{/if}
    </div>
  </div>

  <div class="actions">
    <button
      class="classic"
      class:on={app.classic.on}
      onclick={() => app.commands.run('view.classic')}
      title="Classic mode: placing a note keys the sound playing there (Ctrl+Shift+K)"
      data-testid="classic-toggle">CLASSIC</button
    >
    <button
      class="icon"
      disabled={!canUndo}
      onclick={() => app.commands.run('edit.undo')}
      title="Undo (Ctrl+Z)">↶</button
    >
    <button
      class="icon"
      disabled={!canRedo}
      onclick={() => app.commands.run('edit.redo')}
      title="Redo (Ctrl+Shift+Z)">↷</button
    >
    <div class="seg" role="radiogroup" aria-label="View">
      <button
        role="radio"
        aria-checked={v.mode === 'edit'}
        class:on={v.mode === 'edit'}
        onclick={() => (v.mode = 'edit')}>EDIT</button
      >
      <button
        role="radio"
        aria-checked={v.mode === 'play'}
        class:on={v.mode === 'play'}
        onclick={() => (v.mode = 'play')}
        data-testid="mode-play">PLAY</button
      >
    </div>
    <button class="icon" onclick={() => app.commands.run('view.palette')} title="Commands (Ctrl+K)"
      >⌘</button
    >
  </div>
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 52px;
    padding: 0 12px;
    background: linear-gradient(to bottom, #0d1120, #080a12);
    border-bottom: 1px solid rgba(88, 225, 255, 0.18);
    box-shadow: 0 1px 18px rgba(88, 225, 255, 0.08);
    white-space: nowrap;
  }
  .brand {
    font-weight: 800;
    letter-spacing: 0.08em;
    font-size: 15px;
  }
  .ez {
    color: var(--neon);
  }
  .charts {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    min-width: 0;
    flex: 0 1 auto;
  }
  .chart {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--tier, var(--ink-faint));
    color: var(--ink-dim);
    font-size: 12px;
    position: relative;
  }
  .chart.on {
    color: var(--ink);
    background: color-mix(in srgb, var(--tier) 18%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--tier) 45%, transparent);
  }
  .tier-NM {
    --tier: #56f39a;
  }
  .tier-HD {
    --tier: #ffc247;
  }
  .tier-SHD {
    --tier: #ff5470;
  }
  .tier-EX {
    --tier: #b56dff;
  }
  .lv {
    font-family: var(--font-num);
    color: var(--tier);
    font-weight: 700;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warn);
  }
  .readouts {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .ro {
    display: grid;
    padding: 2px 10px;
    min-width: 54px;
    border-radius: 6px;
    background: #05070d;
    border: 1px solid rgba(88, 225, 255, 0.14);
    text-align: right;
  }
  .ro.wide {
    min-width: 92px;
  }
  .ro span {
    font-size: 9px;
    letter-spacing: 0.14em;
    color: var(--ink-faint);
    text-align: left;
  }
  .ro b {
    font-family: var(--font-num);
    font-size: 15px;
    color: var(--neon);
    text-shadow: 0 0 8px rgba(88, 225, 255, 0.55);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .icon {
    all: unset;
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-dim);
    font-size: 16px;
  }
  .icon:hover:not(:disabled) {
    background: rgba(88, 225, 255, 0.1);
    color: var(--ink);
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .classic {
    all: unset;
    cursor: pointer;
    padding: 4px 9px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--ink-faint);
    border: 1px solid rgba(255, 79, 216, 0.25);
  }
  .classic.on {
    color: #1a0614;
    background: #ff4fd8;
    box-shadow: 0 0 14px rgba(255, 79, 216, 0.55);
  }
  .seg {
    display: flex;
    border: 1px solid rgba(88, 225, 255, 0.3);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    all: unset;
    cursor: pointer;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--ink-dim);
  }
  .seg button.on {
    background: var(--neon);
    color: #031018;
    box-shadow: 0 0 14px rgba(88, 225, 255, 0.6);
  }
</style>
