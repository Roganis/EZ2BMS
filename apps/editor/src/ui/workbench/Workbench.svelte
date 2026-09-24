<script lang="ts">
  // The keysound workbench: every sound of the song as a card, over the
  // playfield. Grouped by name the way the rack groups them, filtered to what
  // is used, unused or missing. Only the rows on screen exist in the DOM, and
  // only their cards ask for waveforms - a song can have 1500 sounds.
  import { AUDIO_EXT, type SoundInfo } from '@ez2bms/chart-core';
  import { t, tParts } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';
  import Card from './Card.svelte';
  import {
    FILTERS,
    filterCounts,
    rowOffsets,
    visibleRows,
    workbenchRows,
    type SoundFilter,
    type SoundSort,
  } from './workbench';

  let { project }: { project: Project } = $props();

  const CARD_W = 196;
  const CARD_H = 132;
  const GAP = 10;
  const HEAD_H = 22;

  let filter = $state<SoundFilter>('all');
  let sort = $state<SoundSort>('group');
  let query = $state('');
  let gridW = $state(800);
  let gridH = $state(600);
  let top = $state(0);
  let renaming = $state<string | null>(null);
  let replacing = $state<SoundInfo | null>(null);
  let pick = $state('');
  let grid = $state<HTMLDivElement>();

  const song = $derived.by(() => {
    for (const c of project.charts) void c.rev;
    return app.sounds.usage(project);
  });
  const counts = $derived(filterCounts(song));
  const cols = $derived(Math.max(1, Math.floor((gridW - 2 * GAP + GAP) / (CARD_W + GAP))));
  const rows = $derived(
    workbenchRows(song, {
      filter,
      sort,
      query,
      cols,
      lengthOf: (s) => app.audio.loadedInfo(s.name)?.seconds,
    }),
  );
  const offsets = $derived(rowOffsets(rows, HEAD_H, CARD_H + GAP));
  const SHORT: Record<string, string> = { '5k-only': '5KO', scratch: 'SCR', ruby: 'RUBY' };
  const shown = $derived(visibleRows(offsets, top, gridH));
  /** Chart file -> "7K HD", short enough for a chip (the card's tooltip has the full name). */
  const labels = $derived(
    new Map(
      project.charts.map((c) => [c.file, `${SHORT[c.mode] ?? c.mode.toUpperCase()} ${c.tier}`]),
    ),
  );
  const shownCount = $derived(
    rows.reduce((n, r) => n + r.segments.reduce((m, g) => m + g.items.length, 0), 0),
  );
  const choices = $derived.by(() => {
    const q = pick.trim().toLowerCase();
    return project.samples
      .filter((s) => AUDIO_EXT.test(s) && s !== replacing?.name && s.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  });

  // Every file in the folder, used or not, gets a length and a waveform.
  $effect(() => {
    void project.samples;
    void app.sounds.loadFolder(project);
  });
  // A new filter or sort starts at the top.
  $effect(() => {
    void filter;
    void sort;
    void query;
    if (grid) grid.scrollTop = 0;
    top = 0;
  });

  function close() {
    app.view.workbench = false;
  }

  async function rename(info: SoundInfo, name: string | null | undefined) {
    if (name === undefined) {
      renaming = info.name;
      return;
    }
    renaming = null;
    if (name !== null && name.trim() && name.trim() !== info.name.split('/').pop())
      await app.sounds.rename(info.name, name);
  }

  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || app.view.paletteOpen) return;
    e.preventDefault();
    if (replacing) replacing = null;
    else close();
  }
</script>

<svelte:window onkeydown={onkey} />

<section class="bench" data-testid="workbench" aria-label={t('workbench.label')}>
  <header>
    <h2>{t('workbench.title')}</h2>
    <div class="filters" role="tablist">
      {#each FILTERS as f (f.id)}
        <button
          role="tab"
          aria-selected={filter === f.id}
          class:on={filter === f.id}
          data-filter={f.id}
          onclick={() => (filter = f.id)}>{t(f.label)} <b>{counts[f.id]}</b></button
        >
      {/each}
    </div>
    <input
      class="q"
      bind:value={query}
      placeholder={t('workbench.find')}
      spellcheck="false"
      data-testid="workbench-search"
    />
    <select bind:value={sort} title={t('workbench.order')}>
      <option value="group">{t('workbench.byGroup')}</option>
      <option value="name">{t('workbench.byName')}</option>
      <option value="usage">{t('workbench.mostUsed')}</option>
      <option value="length">{t('workbench.longest')}</option>
    </select>
    <button
      class="ez-btn"
      title={t('workbench.importTitle')}
      onclick={() => app.commands.run('sounds.import')}>{t('workbench.import')}</button
    >
    <button
      class="ez-btn"
      disabled={!song.unusedChannels.length}
      title={t('workbench.removeUnusedTitle')}
      onclick={() => app.sounds.removeUnused()}
      >{t('workbench.removeUnused', { n: song.unusedChannels.length })}</button
    >
    <button class="x" title={t('workbench.close')} onclick={close}>×</button>
  </header>
  <div
    class="grid"
    bind:this={grid}
    bind:clientWidth={gridW}
    bind:clientHeight={gridH}
    onscroll={(e) => (top = e.currentTarget.scrollTop)}
    data-testid="workbench-grid"
  >
    <div class="space" style:height="{offsets.at(-1)! + GAP}px">
      {#each { length: shown[1] - shown[0] } as _, k (shown[0] + k)}
        {@const i = shown[0] + k}
        {@const r = rows[i]!}
        <div
          class="row"
          style:top="{offsets[i]! + GAP / 2}px"
          style:height="{(r.labelled ? HEAD_H : 0) + CARD_H}px"
          style:--head="{r.labelled ? HEAD_H : 0}px"
          style:--card="{CARD_H}px"
        >
          {#each r.segments as g, n (n)}
            <div class="seg">
              {#if r.labelled}
                <div class="label" title={g.key ?? undefined}>
                  {#if g.key}{g.key}<span>{g.count}</span>{/if}
                </div>
              {/if}
              <div class="cards">
                {#each g.items as s (s.name)}
                  <Card
                    info={s}
                    {labels}
                    width={CARD_W}
                    renaming={renaming === s.name}
                    onrename={(v) => void rename(s, v)}
                    onreplace={() => {
                      pick = '';
                      replacing = s;
                    }}
                  />
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
    {#if !shownCount}
      <p class="none">
        {t(
          query
            ? 'workbench.noMatch'
            : filter === 'all'
              ? 'workbench.noSounds'
              : 'workbench.nothing',
        )}
      </p>
    {/if}
  </div>
  {#if replacing}
    {@const from = replacing}
    <div
      class="pick"
      role="dialog"
      aria-label={t('workbench.replaceLabel', { sound: from.name })}
      data-testid="replace-dialog"
    >
      <h3>
        {#each tParts('workbench.playInstead', { sound: from.name }, ['sound']) as p, i (i)}
          {#if 'slot' in p}<b>{from.name}</b>{:else}{p.text}{/if}
        {/each}
      </h3>
      <p>{t('workbench.replaceHint', { n: from.charts.length })}</p>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={pick} placeholder={t('workbench.findFile')} spellcheck="false" autofocus />
      <ul>
        {#each choices.slice(0, 300) as c (c)}
          <li>
            <button
              onclick={() => {
                // Before closing: `from` reads `replacing`.
                app.sounds.replace(from, c);
                replacing = null;
              }}>{c}</button
            >
          </li>
        {:else}
          <li class="none">{t('workbench.noOtherFile')}</li>
        {/each}
      </ul>
      <button class="ez-btn" onclick={() => (replacing = null)}>{t('workbench.cancel')}</button>
    </div>
  {/if}
</section>

<style>
  .bench {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    grid-template-rows: auto 1fr;
    background: rgba(5, 6, 10, 0.97);
    animation: rise 180ms var(--ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(88, 225, 255, 0.12);
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--neon);
  }
  .filters {
    display: flex;
    gap: 2px;
    border: 1px solid rgba(88, 225, 255, 0.2);
    border-radius: 8px;
    padding: 2px;
  }
  .filters button {
    all: unset;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 9px;
    border-radius: 6px;
    color: var(--ink-dim);
  }
  .filters button b {
    font: 11px var(--font-num);
    color: var(--ink-faint);
  }
  .filters button.on {
    background: rgba(88, 225, 255, 0.16);
    color: var(--ink);
  }
  .filters button.on b {
    color: var(--neon);
  }
  .q,
  select,
  .pick input {
    padding: 5px 9px;
    border-radius: 7px;
    border: 1px solid rgba(88, 225, 255, 0.18);
    background: #05070d;
    color: var(--ink);
    font: 12.5px var(--font-ui);
    outline: none;
  }
  .q {
    flex: 1 1 120px;
    min-width: 100px;
  }
  .q:focus,
  .pick input:focus {
    border-color: var(--neon);
  }
  .x {
    all: unset;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 0 6px;
    color: var(--ink-dim);
  }
  .x:hover {
    color: var(--ink);
  }
  .grid {
    position: relative;
    overflow-y: auto;
    min-height: 0;
  }
  .space {
    position: relative;
  }
  .row {
    position: absolute;
    left: 14px;
    right: 14px;
    display: flex;
    gap: 10px;
  }
  .seg {
    display: grid;
    grid-template-rows: var(--head) 1fr;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--ink);
    border-top: 1px solid rgba(88, 225, 255, 0.22);
  }
  .label:empty {
    border-top-style: dashed;
    border-top-color: rgba(88, 225, 255, 0.1);
  }
  .label span {
    font: 11px var(--font-num);
    color: var(--ink-faint);
  }
  .cards {
    display: flex;
    gap: 10px;
    height: var(--card);
  }
  .none {
    position: absolute;
    inset: 40px 0 auto;
    text-align: center;
    color: var(--ink-dim);
    font-size: 13px;
  }
  .pick {
    position: absolute;
    right: 16px;
    top: 56px;
    bottom: 16px;
    width: 320px;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    gap: 8px;
    padding: 14px;
    border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  }
  .pick h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .pick p {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .pick ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }
  .pick li button {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: block;
    width: 100%;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick li button:hover {
    background: rgba(88, 225, 255, 0.1);
  }
</style>
