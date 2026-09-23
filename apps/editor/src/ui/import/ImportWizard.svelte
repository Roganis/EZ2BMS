<script lang="ts">
  // Import: a song from your EZ2AC folder, a folder of BMS files, or a bmson.
  // Every guess the reading makes (encoding, random values, lane map, mode,
  // tier) is shown and can be changed before anything is written; what could
  // not come across is listed, and goes to Issues with the song.
  import {
    categoryLabel,
    modeNames,
    MODES,
    TIERS,
    type ModeId,
    type Tier,
  } from '@ez2bms/chart-core';
  import { app } from '../../state/app.svelte';

  const im = app.importer;
  const TABS = [
    { id: 'game', label: 'EZ2AC songs' },
    { id: 'bms', label: 'BMS' },
    { id: 'bmson', label: 'bmson' },
  ] as const;
  const MODE_IDS = MODES.filter((m) => m.portPlayable).map((m) => m.id);
  const ENCODINGS = [
    { id: 'utf-8', label: 'UTF-8' },
    { id: 'shift_jis', label: 'Shift-JIS' },
    { id: 'euc-kr', label: 'EUC-KR / CP949' },
  ] as const;

  let bmsDir = $state(im.bmsDir);
  const summary = (charts: { mode: ModeId; tier: Tier; level: number }[]) =>
    charts.map((c) => `${modeNames(c.mode).label} ${c.tier} ${c.level}`).join(' · ');

  async function pickDest() {
    const d = await app.backend.pickFolder('Where the new song folder goes');
    if (d) im.dest = d;
  }
  async function pickBms() {
    const d = await app.backend.pickFolder('A folder of BMS files');
    if (d) {
      bmsDir = d;
      await im.loadBms(d);
    }
  }
  function tab(id: (typeof TABS)[number]['id']) {
    im.source = id;
    if (id === 'game' && !im.game && !im.loadingGame) void im.loadGame();
  }
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || app.view.paletteOpen) return;
    e.stopImmediatePropagation();
    im.close();
  }
  const sev = { error: '⛔', warning: '⚠', info: 'ℹ' } as const;
</script>

<svelte:window onkeydown={onkey} />

<section class="wizard ez-form" data-testid="import-wizard" aria-label="Import a song">
  <header>
    <h2>Import</h2>
    <nav class="tabs">
      {#each TABS as t (t.id)}
        <button
          class:on={im.source === t.id}
          onclick={() => tab(t.id)}
          data-testid="import-tab-{t.id}">{t.label}</button
        >
      {/each}
    </nav>
    <button class="x" onclick={() => im.close()} aria-label="Close">×</button>
  </header>

  {#if im.source === 'game'}
    <div class="body">
      <aside class="list">
        <input
          type="search"
          placeholder="Search titles"
          bind:value={im.query}
          data-testid="import-search"
        />
        {#if im.loadingGame}
          <p class="hint">Reading the song tables…</p>
        {:else if im.gameError}
          <p class="warn">{im.gameError}</p>
          <button class="ez-btn" onclick={() => void im.loadGame()}>Read again</button>
        {/if}
        <ul>
          {#each im.songs as s (s.dir)}
            <li>
              <button
                class="song"
                class:on={im.selected === s}
                onclick={() => void im.select(s)}
                data-testid="import-song"
              >
                <b>{s.title?.title ?? s.dir}</b>
                <span class="dim">{s.dir} · {Math.round(s.bpm * 100) / 100} BPM</span>
                <span class="charts">{summary(s.charts)}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if im.game?.problems.length}
          <p class="hint">{im.game.problems.join(' · ')}</p>
        {/if}
      </aside>
      <div class="detail">
        {#if im.gameImport}
          {@const g = im.gameImport}
          <h3>{im.selected?.title?.title ?? im.selected?.dir}</h3>
          {#if im.selected?.title?.subtitle}<p class="dim">{im.selected.title.subtitle}</p>{/if}
          <p>
            Song key <b data-testid="import-key">{g.key}</b> · category {categoryLabel(
              g.song.category,
            )} ·
            {g.copies.length} keysounds
          </p>
          <ul class="charts-list">
            {#each g.charts as c (c.file)}
              <li>
                <b>{modeNames(c.mode).label} {c.tier}</b> level {c.data.info.level} ·
                {c.data.notes.filter((n) => n.x).length} notes
                <span class="dim">{c.from} → {c.file}</span>
              </li>
            {/each}
          </ul>
          {@render notesList([
            { label: '', notes: g.notes },
            ...g.charts.map((c) => ({
              label: `${modeNames(c.mode).label} ${c.tier}`,
              notes: c.notes,
            })),
          ])}
          {@render dest()}
        {:else if !im.gameError}
          <p class="hint">
            Pick a song. Its charts become bmson files in a new song folder, its keysounds WAVs (the
            same samples), under a new key - publishing under the game's own would replace that song
            on the wheel.
          </p>
        {/if}
      </div>
    </div>
  {:else if im.source === 'bms'}
    <div class="body one">
      <div class="line">
        <span class="lbl">Folder</span>
        <input
          class="path"
          bind:value={bmsDir}
          data-testid="bms-dir"
          onkeydown={(e) => e.key === 'Enter' && void im.loadBms(bmsDir)}
        />
        <button class="ez-btn" onclick={() => void im.loadBms(bmsDir)} data-testid="bms-load"
          >Read</button
        >
        <button class="ez-btn" onclick={pickBms}>Choose…</button>
      </div>
      {#if im.bmsError}<p class="warn">{im.bmsError}</p>{/if}
      {#if im.bmsImport}
        {@const b = im.bmsImport}
        <table class="files">
          <thead>
            <tr
              ><th>File</th><th>Title</th><th>Text</th><th>Random</th><th>Lanes</th><th>Mode</th><th
                >Tier</th
              ><th></th></tr
            >
          </thead>
          <tbody>
            {#each b.files as f (f.file)}
              {@const c = im.choices[f.file] ?? {}}
              <tr data-file={f.file} class:skipped={f.skipped}>
                <td>{f.file}</td>
                <td>{f.title} <span class="dim">· {f.noteCount} notes</span></td>
                <td>
                  <select
                    value={c.encoding ?? f.encoding}
                    onchange={(e) =>
                      im.choose(f.file, { encoding: e.currentTarget.value as never })}
                    data-testid="bms-encoding"
                  >
                    {#each ENCODINGS as enc (enc.id)}<option value={enc.id}>{enc.label}</option
                      >{/each}
                  </select>
                  {#if !f.sure && !c.encoding}<span class="warn" title="A guess from the bytes"
                      >?</span
                    >{/if}
                </td>
                <td>
                  {#each f.randoms.filter((r) => !r.fixed && r.value) as r, i (r.line)}
                    <select
                      value={r.value}
                      title="#RANDOM on line {r.line}"
                      onchange={(e) => {
                        const picks = [...(c.picks ?? f.randoms.map((x) => x.value || 1))];
                        picks[f.randoms.indexOf(r)] = Number(e.currentTarget.value);
                        im.choose(f.file, { picks });
                      }}
                      data-testid="bms-random-{i}"
                    >
                      {#each Array.from({ length: r.max }, (_, k) => k + 1) as v (v)}<option
                          value={v}>{v}</option
                        >{/each}
                    </select>
                  {:else}<span class="dim">-</span>{/each}
                </td>
                <td>
                  <select
                    value={f.map}
                    onchange={(e) =>
                      im.choose(f.file, { map: e.currentTarget.value as 'ez2' | 'keys' })}
                  >
                    <option value="ez2">EZ2 BME</option>
                    <option value="keys">Keys in order</option>
                  </select>
                </td>
                <td>
                  <select
                    value={f.mode}
                    onchange={(e) => im.choose(f.file, { mode: e.currentTarget.value as ModeId })}
                  >
                    {#each MODE_IDS as m (m)}<option value={m}>{modeNames(m).label}</option>{/each}
                  </select>
                </td>
                <td>
                  <select
                    value={f.tier}
                    onchange={(e) => im.choose(f.file, { tier: e.currentTarget.value as Tier })}
                    data-testid="bms-tier"
                  >
                    {#each TIERS as t (t)}<option value={t}>{t}</option>{/each}
                  </select>
                </td>
                <td>
                  <label class="check" title="Leave this file out"
                    ><input
                      type="checkbox"
                      checked={!c.skip}
                      onchange={(e) => im.choose(f.file, { skip: !e.currentTarget.checked })}
                    /></label
                  >
                  {#if f.clash}<span class="warn" title="{f.clash} is already that chart"
                      >taken</span
                    >{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p>
          Song key <b data-testid="import-key">{b.key}</b> · {b.charts.length} chart{b.charts
            .length === 1
            ? ''
            : 's'} ·
          {b.uses.length} file{b.uses.length === 1 ? '' : 's'} used
        </p>
        {@render notesList([
          { label: '', notes: b.notes },
          ...b.charts.map((c) => ({ label: c.from, notes: c.notes })),
        ])}
        <label class="check"
          ><input type="checkbox" bind:checked={im.inPlace} data-testid="bms-inplace" /> Write the song
          beside the BMS files (nothing copied)</label
        >
        {#if !im.inPlace}{@render dest()}{:else}{@render go()}{/if}
      {/if}
    </div>
  {:else}
    <div class="body one">
      <p>
        A bmson opens as it is: open its folder. Older bmson (0.21, from BmsONE) is read as 1.0, and
        lanes numbered the BMS way (<code>beat-7k</code>, <code>beat-10k</code>, both numberings)
        are moved onto EZ2's; Issues says what changed. circus2bmson's output opens the same way.
      </p>
      <button class="ez-btn" onclick={() => (im.close(), app.commands.run('file.open'))}
        >Open a folder…</button
      >
    </div>
  {/if}
</section>

{#snippet notesList(
  groups: {
    label: string;
    notes: { rule: string; severity: 'error' | 'warning' | 'info'; message: string }[];
  }[],
)}
  {@const all = groups.flatMap((g) => g.notes.map((n) => ({ ...n, label: g.label })))}
  {#if all.length}
    <details class="notes" open={all.some((n) => n.severity !== 'info')}>
      <summary>{all.length} thing{all.length === 1 ? '' : 's'} to know (they go to Issues)</summary>
      <ul>
        {#each all as n, i (i)}
          <li class={n.severity}>
            {sev[n.severity]}
            {#if n.label}<b>{n.label}:</b>{/if}
            {n.message}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/snippet}

{#snippet dest()}
  <div class="line">
    <span class="lbl">New folder</span>
    <input class="path" bind:value={im.dest} data-testid="import-dest" />
    <button class="ez-btn" onclick={pickDest}>Choose…</button>
  </div>
  {@render go()}
{/snippet}

{#snippet go()}
  <div class="line">
    <button
      class="ez-btn primary"
      disabled={im.busy}
      onclick={() => void im.run()}
      data-testid="import-go"
    >
      {im.busy ? 'Importing…' : 'Import'}
    </button>
    {#if im.progress}<span class="dim">{im.progress[0]} / {im.progress[1]} files</span>{/if}
  </div>
{/snippet}

<style>
  .wizard {
    position: fixed;
    inset: 0;
    z-index: 25;
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
    align-items: baseline;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(88, 225, 255, 0.12);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--neon);
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin-left: 12px;
  }
  .tabs button {
    all: unset;
    cursor: pointer;
    padding: 4px 10px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border-bottom: 2px solid transparent;
  }
  .tabs button.on {
    color: var(--ink);
    border-color: var(--neon);
  }
  .x {
    all: unset;
    cursor: pointer;
    margin-left: auto;
    font-size: 20px;
    padding: 0 6px;
    color: var(--ink-dim);
  }
  .body {
    display: grid;
    grid-template-columns: minmax(240px, 360px) minmax(0, 1fr);
    gap: 24px;
    padding: 16px;
    overflow: auto;
    min-height: 0;
  }
  .body.one {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }
  .list {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 8px;
    min-height: 0;
  }
  .list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
  }
  .song {
    all: unset;
    cursor: pointer;
    display: grid;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
  }
  .song:hover {
    background: rgba(88, 225, 255, 0.06);
  }
  .song.on {
    border-color: var(--neon);
    background: rgba(88, 225, 255, 0.1);
  }
  .charts {
    font-size: 11px;
    color: var(--ink-dim);
  }
  .dim {
    color: var(--ink-dim);
    font-size: 12px;
  }
  .detail {
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .detail h3 {
    margin: 0;
    font-size: 18px;
    color: var(--ink);
    text-transform: none;
    letter-spacing: 0;
  }
  .charts-list {
    margin: 0;
    padding-left: 18px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .line .lbl {
    min-width: 7em;
  }
  .line .ez-btn {
    width: auto;
    white-space: nowrap;
  }
  .path {
    flex: 1;
    min-width: 12em;
  }
  .detail > p {
    margin: 0;
  }
  .files {
    border-collapse: collapse;
    font-size: 12px;
    width: 100%;
  }
  .files th {
    text-align: left;
    font-weight: 500;
    color: var(--ink-dim);
    padding: 4px 6px;
    border-bottom: 1px solid rgba(88, 225, 255, 0.12);
  }
  .files td {
    padding: 4px 6px;
    vertical-align: middle;
  }
  .files tr.skipped td {
    opacity: 0.5;
  }
  .notes ul {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 12px;
  }
  .notes li.warning {
    color: var(--warn, #ffcf5a);
  }
  .notes li.error {
    color: var(--error, #ff6b6b);
  }
  .primary {
    border-color: var(--neon);
  }
</style>
