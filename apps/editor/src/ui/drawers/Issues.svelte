<script lang="ts">
  // Everything that would stop Publish, or play differently in EZ2PORT than it
  // looks here, grouped by rule. Click one to go to it; a finding with a
  // quick fix has a button for it (one undo step in its chart), and a rule
  // found in several places can be fixed everywhere at once.
  import type { Finding, Severity } from '@ez2bms/chart-core';
  import { applyFix, fixAll } from '../../port/fixes';
  import { songFindings } from '../../port/lint';
  import { app } from '../../state/app.svelte';
  import { toast } from '../../state/toasts.svelte';

  const findings = $derived(songFindings(app));
  const order = { error: 0, warning: 1, info: 2 } as const;
  let show = $state<'all' | Severity>('all');
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;

  /** Findings by rule, worst rules first, in the order lint found them within. */
  const groups = $derived.by(() => {
    // Built afresh on every change: nothing reacts to the map itself.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const by = new Map<string, Finding[]>();
    for (const f of findings) {
      if (show !== 'all' && f.severity !== show) continue;
      const list = by.get(f.rule) ?? [];
      list.push(f);
      by.set(f.rule, list);
    }
    return [...by]
      .map(([rule, list]) => ({
        rule,
        list,
        severity: list.reduce<Severity>(
          (w, f) => (order[f.severity] < order[w] ? f.severity : w),
          'info',
        ),
        fixable: list.filter((f) => f.fix).length,
      }))
      .sort((a, b) => order[a.severity] - order[b.severity]);
  });

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
    if (f.rule === 'song-key' || f.rule === 'level' || f.rule.startsWith('title'))
      app.view.right = 'chart';
  }

  async function fix(f: Finding) {
    try {
      if ((await applyFix(app, f)) && f.chart)
        toast(`${f.fix!.label}: done (Ctrl+Z undoes it)`, 'ok');
    } catch (e) {
      toast(`The fix failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }
  const name = (rule: string) => rule.replace(/-/g, ' ');
</script>

<div class="ez-form" data-testid="issues">
  {#if findings.length}
    <div class="ez-seg filter" role="group" aria-label="Show">
      <button class:on={show === 'all'} onclick={() => (show = 'all')}>All {findings.length}</button
      >
      <button
        class:on={show === 'error'}
        data-testid="issues-errors"
        disabled={!count('error')}
        onclick={() => (show = 'error')}>Errors {count('error')}</button
      >
      <button
        class:on={show === 'warning'}
        disabled={!count('warning')}
        onclick={() => (show = 'warning')}>Warnings {count('warning')}</button
      >
      <button class:on={show === 'info'} disabled={!count('info')} onclick={() => (show = 'info')}
        >Notes {count('info')}</button
      >
    </div>
  {:else}
    <p class="hint ok">Nothing to fix: this song is ready for EZ2PORT.</p>
  {/if}
  {#each groups as g (g.rule)}
    <section class="group {g.severity}" data-rule={g.rule}>
      {#if g.list.length > 1}
        <header>
          <span class="dot"></span>
          <span class="rule">{name(g.rule)} <small>{g.list.length}</small></span>
          {#if g.fixable > 1}
            <button
              class="ez-btn fix"
              data-testid="fix-all-{g.rule}"
              title="One undo step in each chart"
              onclick={() => void fixAll(app, g.rule)}>Fix all</button
            >
          {/if}
        </header>
      {/if}
      <ul>
        {#each g.list as f, i (i)}
          <li class={f.severity}>
            <button class="msg" onclick={() => go(f)}>
              <span class="dot"></span>
              <span>
                {f.message}
                {#if f.chart && (app.project?.charts.length ?? 0) > 1}<small>{f.chart}</small>{/if}
              </span>
            </button>
            {#if f.fix}
              <button
                class="ez-btn fix"
                data-testid="fix-{f.rule}"
                title={f.fix.label}
                onclick={() => void fix(f)}>{f.fix.label}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .filter {
    margin-bottom: 8px;
  }
  .filter button {
    font-size: 11px;
    padding: 4px 0;
  }
  .filter button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .group {
    margin-bottom: 6px;
  }
  header {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  header small {
    color: var(--ink-faint);
    letter-spacing: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  li {
    display: grid;
    gap: 4px;
    padding: 2px 0;
  }
  .msg {
    all: unset;
    cursor: pointer;
    display: grid;
    grid-template-columns: 10px 1fr;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 7px;
    font-size: 12.5px;
    line-height: 1.4;
  }
  .msg:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .fix {
    justify-self: start;
    margin-left: 26px;
    padding: 3px 9px;
    font-size: 11.5px;
  }
  header .fix {
    margin-left: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border-radius: 50%;
  }
  header .dot {
    margin-top: 0;
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
  header small {
    display: inline;
  }
  .ok {
    color: var(--ok);
  }
</style>
