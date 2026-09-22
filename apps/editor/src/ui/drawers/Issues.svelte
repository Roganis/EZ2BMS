<script lang="ts">
  // Everything that would stop Publish, or play differently in EZ2PORT than it
  // looks here. Click one to go to it.
  import type { Finding } from '@ez2bms/chart-core';
  import { songFindings } from '../../port/lint';
  import { app } from '../../state/app.svelte';

  const findings = $derived(songFindings(app));
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = $derived([...findings].sort((a, b) => order[a.severity] - order[b.severity]));

  function go(f: Finding) {
    const p = app.project;
    if (!p) return;
    if (f.chart) {
      const i = p.charts.findIndex((c) => c.file === f.chart);
      if (i >= 0 && i !== p.activeIndex) app.selectChart(i);
    }
    const doc = app.doc;
    if (f.notes?.length && doc) {
      doc.setSelection(f.notes);
      const first = doc.index.get(f.notes[0]!);
      if (first) app.view.cursor = first.y;
    } else if (f.at !== undefined) app.view.cursor = f.at;
    if (f.rule === 'song-key' || f.rule === 'level' || f.rule === 'title') app.view.right = 'chart';
  }
</script>

<div class="ez-form">
  {#if !sorted.length}
    <p class="hint ok">Nothing to fix: this song is ready for EZ2PORT.</p>
  {/if}
  <ul>
    {#each sorted as f, i (i)}
      <li>
        <button class={f.severity} onclick={() => go(f)}>
          <span class="dot"></span>
          <span class="msg">
            {f.message}
            {#if f.chart && (app.project?.charts.length ?? 0) > 1}<small>{f.chart}</small>{/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  button {
    all: unset;
    cursor: pointer;
    display: grid;
    grid-template-columns: 10px 1fr;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 7px;
    font-size: 12.5px;
    line-height: 1.4;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .dot {
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border-radius: 50%;
  }
  .error .dot {
    background: var(--err);
    box-shadow: 0 0 6px var(--err);
  }
  .warning .dot {
    background: var(--warn);
  }
  .info .dot {
    background: var(--ink-faint);
  }
  small {
    display: block;
    color: var(--ink-faint);
    font-family: var(--font-num);
  }
  .ok {
    color: var(--ok);
  }
</style>
