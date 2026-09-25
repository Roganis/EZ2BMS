<script lang="ts">
  import { t } from '../i18n/i18n.svelte';
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

  /**
   * Scrolls the pill row to show the open chart's pill: with many charts the
   * row is narrower than its pills, and a chart opened some other way (the
   * palette, the song manager, Ctrl+1-9) stayed out of sight. Only the row
   * scrolls - scrollIntoView would move the page too.
   */
  function shownWhen(node: HTMLElement, on: boolean) {
    const show = (on: boolean) => {
      const row = node.parentElement;
      if (!on || !row) return;
      const n = node.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (n.left < r.left) row.scrollLeft -= r.left - n.left;
      else if (n.right > r.right) row.scrollLeft += n.right - r.right;
    };
    show(on);
    return { update: show };
  }
</script>

<header class="bar">
  <div class="brand"><span class="ez">EZ2</span>BMS</div>
  <button
    class="song"
    class:on={app.view.songManager}
    title={t('top.songTitle')}
    data-testid="open-song"
    onclick={() => app.commands.run('view.songManager')}
    >{t('top.song')} <span>{project.sidecar.key || project.name}</span></button
  >
  <nav class="charts" aria-label={t('top.charts')}>
    {#each project.charts as c, i (c.file)}
      <button
        class="chart tier-{c.tier}"
        class:on={i === project.activeIndex}
        use:shownWhen={i === project.activeIndex}
        onclick={() => app.selectChart(i)}
        title={c.file}
      >
        <span class="mode">{c.label}</span>
        <span class="lv">{c.level}</span>
        {#if project.unsaved(c)}<span
            class="dot"
            title={c.dirty
              ? t('top.unsaved')
              : t('top.willSaveAs', { file: project.targetFile(c) })}
          ></span>{/if}
      </button>
    {/each}
  </nav>

  <div class="readouts">
    <div class="ro">
      <span>{t('top.bpm')}</span><b data-testid="ro-bpm">{bpm.toFixed(bpm % 1 ? 2 : 0)}</b>
    </div>
    <div class="ro wide"><span>{t('top.pos')}</span><b data-testid="ro-pos">{pos}</b></div>
    <div class="ro wide time"><span>{t('top.time')}</span><b>{time}</b></div>
    <div class="ro snap"><span>{t('top.snap')}</span><b data-testid="ro-snap">1/{v.snap}</b></div>
    <div class="ro zoom">
      {#if v.mode === 'play'}<span>{t('top.speed')}</span><b>{v.speed}%</b>{:else}<span
          >{t('top.zoom')}</span
        ><b>{Math.round((v.zoom / 76.8) * 100)}%</b>{/if}
    </div>
  </div>

  <div class="actions">
    <button
      class="classic"
      class:on={app.classic.on}
      onclick={() => app.commands.run('view.classic')}
      title={t('top.classicTitle')}
      data-testid="classic-toggle">{t('top.classic')}</button
    >
    <button
      class="icon history"
      disabled={!canUndo}
      onclick={() => app.commands.run('edit.undo')}
      title={t('top.undo')}>↶</button
    >
    <button
      class="icon history"
      disabled={!canRedo}
      onclick={() => app.commands.run('edit.redo')}
      title={t('top.redo')}>↷</button
    >
    <div class="seg" role="radiogroup" aria-label={t('top.view')}>
      <button
        role="radio"
        aria-checked={v.mode === 'edit'}
        class:on={v.mode === 'edit'}
        onclick={() => (v.mode = 'edit')}>{t('top.edit')}</button
      >
      <button
        role="radio"
        aria-checked={v.mode === 'play'}
        class:on={v.mode === 'play'}
        onclick={() => (v.mode = 'play')}
        data-testid="mode-play">{t('top.play')}</button
      >
    </div>
    <button class="icon" onclick={() => app.commands.run('view.palette')} title={t('top.commands')}
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
    /* Never wider than the window: the chart pills scroll instead. A bar that
       overflowed made the page's width follow the readouts' digits, and the
       playfield resized - re-baking every note texture - on each frame. */
    min-width: 0;
    overflow: hidden;
  }
  .brand {
    font-weight: 800;
    letter-spacing: 0.08em;
    font-size: 15px;
  }
  .ez {
    color: var(--neon);
  }
  .song {
    all: unset;
    cursor: pointer;
    flex: none;
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 4px 10px;
    border-radius: 7px;
    border: 1px solid rgba(88, 225, 255, 0.28);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--neon);
  }
  .song span {
    font: 12px var(--font-ui);
    letter-spacing: 0;
    color: var(--ink);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .song:hover,
  .song.on {
    background: rgba(88, 225, 255, 0.1);
    border-color: var(--neon);
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
  /* A fixed width for the readouts that change while playing. */
  .ro.wide b {
    width: 9ch;
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
  /* Narrower windows (the desktop allows 960 px; the browser preview goes
     down to a phone held sideways): the bar is about 1100 px of fixed parts,
     and past that the chart pills shrank to nothing and the Edit/Play switch
     was cut off. The parts that repeat elsewhere give way first - the name,
     the time (the Timing drawer), zoom (Ctrl+wheel), then snap ([ ]) and
     undo/redo (Ctrl+Z). */
  @media (max-width: 1180px) {
    .brand,
    .ro.time {
      display: none;
    }
  }
  @media (max-width: 1040px) {
    .ro.zoom {
      display: none;
    }
  }
  @media (max-width: 900px) {
    .ro.snap,
    .icon.history {
      display: none;
    }
  }
</style>
