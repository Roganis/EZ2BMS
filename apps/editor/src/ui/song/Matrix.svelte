<script lang="ts">
  // Every chart of the song at a glance: one row per EZ2PORT mode, one column
  // per tier. A chart shows its level, size and problems; an empty cell makes
  // a chart there; Copy and Move put a chart into another cell (Move keeps it
  // in its mode: it becomes another tier).
  import { LANES, MODES, modeDef, type ModeId, type Tier } from '@ez2bms/chart-core';
  import { KIND_CSS } from '../lanecolors';
  import { t } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot, Project } from '../../state/project.svelte';
  import { songFindings } from '../../port/lint';

  let { project }: { project: Project } = $props();
  const TIERS: Tier[] = ['NM', 'HD', 'SHD', 'EX'];
  const modes = MODES.filter((m) => m.portPlayable);
  const kindOf = (x: number) => LANES.find((l) => l.x === x)?.kind ?? 'white';

  let picking = $state<{ slot: ChartSlot; kind: 'copy' | 'move' } | null>(null);

  const findings = $derived(songFindings(app));
  const problems = (s: ChartSlot) => {
    const f = findings.filter((x) => x.chart === s.file);
    return {
      errors: f.filter((x) => x.severity === 'error').length,
      warnings: f.filter((x) => x.severity === 'warning').length,
    };
  };
  const at = (m: ModeId, t: Tier) => {
    void project.charts.length;
    return project.charts.find((c) => c.mode === m && c.tier === t);
  };
  // A mode's charts are listed only when it has an NM chart of level 1+ (see lint mode-invisible).
  const listed = (m: ModeId) => {
    const nm = at(m, 'NM');
    return !!nm && nm.level >= 1;
  };
  const notes = (s: ChartSlot) => {
    void s.rev;
    return s.doc.data.notes.filter((n) => n.x !== 0).length;
  };

  function target(m: ModeId, t: Tier): boolean {
    if (!picking || at(m, t)) return false;
    return picking.kind === 'copy' || picking.slot.mode === m;
  }

  function onEmpty(m: ModeId, t: Tier) {
    if (picking) {
      if (!target(m, t)) return;
      const { slot, kind } = picking;
      picking = null;
      if (kind === 'move') app.song.setTier(slot, t);
      else app.song.createChart(m, t, { from: slot });
      return;
    }
    if (app.song.createChart(m, t, { copySounds: true })) app.view.songManager = false;
  }

  function open(s: ChartSlot) {
    if (picking) return;
    app.selectChart(project.charts.indexOf(s));
    app.view.songManager = false;
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && picking) {
      e.stopImmediatePropagation();
      picking = null;
    }
  }
</script>

<svelte:window onkeydowncapture={onkey} />

<div class="matrix" class:picking={!!picking} data-testid="chart-matrix">
  <div class="corner">
    {#if picking}
      <span class="pickmsg"
        >{t(picking.kind === 'copy' ? 'matrix.copyTo' : 'matrix.moveTo', {
          chart: picking.slot.label,
        })} <kbd>Esc</kbd></span
      >
    {/if}
  </div>
  {#each TIERS as tier (tier)}<div class="th tier-{tier}">{tier}</div>{/each}
  {#each modes as m (m.id)}
    {@const shown = listed(m.id)}
    <div class="mode" title={m.portName}>
      <span class="lanes">
        {#each modeDef(m.id).columns as c (c.x)}<i
            style:background={KIND_CSS[kindOf(c.x)]}
            class:wide={c.kind === 'scratch' || c.kind === 'pedal'}
          ></i>{/each}
      </span>
      <span class="ml">{m.label}</span>
    </div>
    {#each TIERS as tier (tier)}
      {@const s = at(m.id, tier)}
      {#if s}
        {@const pr = problems(s)}
        <div
          class="cell full tier-{tier}"
          class:active={project.active === s}
          class:hidden={!shown}
          class:source={picking?.slot === s}
          data-cell="{m.id}.{tier}"
        >
          <button class="open" onclick={() => open(s)} title={t('matrix.open', { file: s.file })}>
            <b class="lv">{s.level}</b>
            <span class="meta">{t('matrix.notes', { n: notes(s) })}</span>
            <span class="badges">
              {#if project.unsaved(s)}<i class="dot" title={t('matrix.unsaved')}></i>{/if}
              {#if pr.errors}<i class="err">{pr.errors}</i>{/if}
              {#if pr.warnings}<i class="warn">{pr.warnings}</i>{/if}
              {#if !shown && tier !== 'NM'}<i
                  class="flag"
                  title={t('matrix.unlistedWhy', { mode: m.label })}>{t('matrix.unlisted')}</i
                >{/if}
            </span>
          </button>
          <div class="acts">
            <button
              title={t('matrix.copyTitle')}
              onclick={() => (picking = { slot: s, kind: 'copy' })}>{t('matrix.copy')}</button
            >
            <button
              title={t('matrix.moveTitle')}
              onclick={() => (picking = { slot: s, kind: 'move' })}>{t('matrix.move')}</button
            >
            <button class="rm" title={t('matrix.remove')} onclick={() => app.song.removeChart(s)}
              >×</button
            >
          </div>
        </div>
      {:else}
        <button
          class="cell empty"
          class:target={target(m.id, tier)}
          disabled={!!picking && !target(m.id, tier)}
          data-cell="{m.id}.{tier}"
          title={picking ? '' : t('matrix.new', { mode: m.label, tier })}
          onclick={() => onEmpty(m.id, tier)}>{target(m.id, tier) ? t('matrix.here') : '+'}</button
        >
      {/if}
    {/each}
  {/each}
</div>

<style>
  .matrix {
    display: grid;
    grid-template-columns: minmax(140px, auto) repeat(4, minmax(92px, 1fr));
    gap: 6px;
    align-content: start;
  }
  .corner {
    min-height: 20px;
  }
  .pickmsg {
    font-size: 11px;
    color: var(--neon);
  }
  .th {
    font: 700 12px var(--font-num);
    letter-spacing: 0.1em;
    text-align: center;
    color: var(--tier);
    align-self: end;
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
  .mode {
    display: grid;
    gap: 3px;
    align-content: center;
    font-size: 12px;
    color: var(--ink);
  }
  .lanes {
    display: flex;
    gap: 1px;
    height: 10px;
  }
  .lanes i {
    width: 5px;
    border-radius: 1px;
  }
  .lanes i.wide {
    width: 9px;
  }
  .cell {
    position: relative;
    min-height: 64px;
    border-radius: 9px;
    box-sizing: border-box;
  }
  .full {
    border: 1px solid color-mix(in srgb, var(--tier) 45%, transparent);
    background: color-mix(in srgb, var(--tier) 9%, #0a0e1a);
    display: grid;
    grid-template-rows: 1fr auto;
    overflow: hidden;
  }
  .full.active {
    box-shadow:
      0 0 0 1px var(--tier),
      0 0 14px color-mix(in srgb, var(--tier) 40%, transparent);
  }
  .full.hidden {
    opacity: 0.55;
  }
  .full.source {
    outline: 2px dashed var(--neon);
  }
  .open {
    all: unset;
    cursor: pointer;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 8px;
    padding: 6px 8px 2px;
  }
  .lv {
    grid-row: span 2;
    font: 800 24px/1 var(--font-num);
    color: var(--tier);
  }
  .meta {
    font: 11px var(--font-num);
    color: var(--ink-dim);
  }
  .badges {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .badges i {
    font: 700 10px var(--font-num);
    font-style: normal;
    padding: 0 4px;
    border-radius: 4px;
  }
  .badges .dot {
    width: 6px;
    height: 6px;
    padding: 0;
    border-radius: 50%;
    background: var(--warn);
  }
  .badges .err {
    background: rgba(255, 84, 112, 0.2);
    color: var(--err);
  }
  .badges .warn {
    background: rgba(255, 194, 71, 0.16);
    color: var(--warn);
  }
  .acts {
    display: flex;
    gap: 2px;
    padding: 0 4px 4px;
    opacity: 0;
    transition: opacity 120ms;
  }
  .full:hover .acts,
  .full:focus-within .acts {
    opacity: 1;
  }
  .acts button {
    all: unset;
    cursor: pointer;
    flex: 1;
    text-align: center;
    font-size: 10px;
    padding: 2px 0;
    border-radius: 4px;
    color: var(--ink-dim);
    background: rgba(255, 255, 255, 0.04);
  }
  .acts button:hover {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.09);
  }
  .acts .rm {
    flex: 0 0 18px;
  }
  .acts .rm:hover {
    color: var(--err);
  }
  .badges .flag {
    font: 600 9px var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--warn);
    padding: 0;
  }
  .empty {
    all: unset;
    box-sizing: border-box;
    min-height: 64px;
    cursor: pointer;
    display: grid;
    place-items: center;
    border-radius: 9px;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    color: var(--ink-faint);
    font-size: 18px;
  }
  .empty:hover:not(:disabled) {
    border-color: var(--neon);
    color: var(--neon);
  }
  .empty.target {
    border: 1px solid var(--neon);
    color: var(--neon);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: rgba(88, 225, 255, 0.08);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .empty:disabled {
    opacity: 0.3;
    cursor: default;
  }
  @keyframes pulse {
    50% {
      background: rgba(88, 225, 255, 0.16);
    }
  }
</style>
