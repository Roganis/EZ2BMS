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
  import { t, tCore, tParts } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';

  const im = app.importer;
  const TABS = $derived([
    { id: 'game', label: t('import.tab.game') },
    { id: 'bms', label: 'BMS' },
    { id: 'bmson', label: 'bmson' },
  ] as const);
  const MODE_IDS = MODES.filter((m) => m.portPlayable).map((m) => m.id);
  const ENCODINGS = [
    { id: 'utf-8', label: 'UTF-8' },
    { id: 'shift_jis', label: 'Shift-JIS' },
    { id: 'euc-kr', label: 'EUC-KR / CP949' },
  ] as const;
  const MAPS = $derived([
    { id: 'ez2', label: 'EZ2 BME' },
    { id: 'keys', label: t('import.bms.keysInOrder') },
  ] as const);

  let bmsDir = $state(im.bmsDir);
  const summary = (charts: { mode: ModeId; tier: Tier; level: number }[]) =>
    charts.map((c) => `${modeNames(c.mode).label} ${c.tier} ${c.level}`).join(' · ');

  async function pickDest() {
    const d = await app.backend.pickFolder(t('import.dest.pick'));
    if (d) im.dest = d;
  }
  async function pickBms() {
    const d = await app.backend.pickFolder(t('import.bms.pick'));
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

<section class="wizard ez-form" data-testid="import-wizard" aria-label={t('import.label')}>
  <header>
    <h2>{t('import.title')}</h2>
    <nav class="tabs">
      {#each TABS as src (src.id)}
        <button
          class:on={im.source === src.id}
          onclick={() => tab(src.id)}
          data-testid="import-tab-{src.id}">{src.label}</button
        >
      {/each}
    </nav>
    <button class="x" onclick={() => im.close()} aria-label={t('import.close')}>×</button>
  </header>

  {#if im.source === 'game'}
    <div class="body">
      <aside class="list">
        <input
          type="search"
          placeholder={t('import.search')}
          bind:value={im.query}
          data-testid="import-search"
        />
        {#if im.loadingGame}
          <p class="hint">{t('import.reading')}</p>
        {:else if im.gameError}
          <p class="warn">{im.gameError}</p>
          <button class="ez-btn" onclick={() => void im.loadGame()}>{t('import.readAgain')}</button>
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
                <span class="dim"
                  >{s.dir} · {t('import.game.bpm', { bpm: Math.round(s.bpm * 100) / 100 })}</span
                >
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
          {@const song = { category: categoryLabel(g.song.category), n: g.copies.length }}
          <h3>{im.selected?.title?.title ?? im.selected?.dir}</h3>
          {#if im.selected?.title?.subtitle}<p class="dim">{im.selected.title.subtitle}</p>{/if}
          <p>
            {#each tParts('import.game.summary', song, ['key']) as p, i (i)}
              {#if 'slot' in p}<b data-testid="import-key">{g.key}</b>{:else}{p.text}{/if}
            {/each}
          </p>
          <ul class="charts-list">
            {#each g.charts as c (c.file)}
              <li>
                <b>{modeNames(c.mode).label} {c.tier}</b>
                {t('import.game.chart', {
                  level: c.data.info.level,
                  notes: c.data.notes.filter((n) => n.x).length,
                })}
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
          <p class="hint">{t('import.game.hint')}</p>
        {/if}
      </div>
    </div>
  {:else if im.source === 'bms'}
    <div class="body one">
      <div class="line">
        <span class="lbl">{t('import.bms.folder')}</span>
        <input
          class="path"
          bind:value={bmsDir}
          data-testid="bms-dir"
          onkeydown={(e) => e.key === 'Enter' && void im.loadBms(bmsDir)}
        />
        <button class="ez-btn" onclick={() => void im.loadBms(bmsDir)} data-testid="bms-load"
          >{t('import.bms.read')}</button
        >
        <button class="ez-btn" onclick={pickBms}>{t('import.choose')}</button>
      </div>
      {#if im.bmsError}<p class="warn">{im.bmsError}</p>{/if}
      {#if im.bmsImport}
        {@const b = im.bmsImport}
        {@const counts = { charts: b.charts.length, files: b.uses.length }}
        <table class="files">
          <thead>
            <tr
              ><th>{t('import.bms.file')}</th><th>{t('import.bms.songTitle')}</th><th
                >{t('import.bms.text')}</th
              ><th>{t('import.bms.random')}</th><th>{t('import.bms.lanes')}</th><th
                >{t('import.bms.mode')}</th
              ><th>{t('import.bms.tier')}</th><th></th></tr
            >
          </thead>
          <tbody>
            {#each b.files as f (f.file)}
              {@const c = im.choices[f.file] ?? {}}
              <tr data-file={f.file} class:skipped={f.skipped}>
                <td>{f.file}</td>
                <td>
                  {f.title} <span class="dim">· {t('import.bms.notes', { n: f.noteCount })}</span>
                </td>
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
                  {#if !f.sure && !c.encoding}<span class="warn" title={t('import.bms.guess')}
                      >?</span
                    >{/if}
                </td>
                <td>
                  {#each f.randoms.filter((r) => !r.fixed && r.value) as r, i (r.line)}
                    <select
                      value={r.value}
                      title={t('import.bms.randomLine', { line: r.line })}
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
                    {#each MAPS as map (map.id)}<option value={map.id}>{map.label}</option>{/each}
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
                    {#each TIERS as tier (tier)}<option value={tier}>{tier}</option>{/each}
                  </select>
                </td>
                <td>
                  <label class="check" title={t('import.bms.skip')}
                    ><input
                      type="checkbox"
                      checked={!c.skip}
                      onchange={(e) => im.choose(f.file, { skip: !e.currentTarget.checked })}
                    /></label
                  >
                  {#if f.clash}<span class="warn" title={t('import.bms.clash', { file: f.clash })}
                      >{t('import.bms.taken')}</span
                    >{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p>
          {#each tParts('import.bms.summary', counts, ['key']) as p, i (i)}
            {#if 'slot' in p}<b data-testid="import-key">{b.key}</b>{:else}{p.text}{/if}
          {/each}
        </p>
        {@render notesList([
          { label: '', notes: b.notes },
          ...b.charts.map((c) => ({ label: c.from, notes: c.notes })),
        ])}
        <label class="check"
          ><input type="checkbox" bind:checked={im.inPlace} data-testid="bms-inplace" />
          {t('import.bms.inPlace')}</label
        >
        {#if !im.inPlace}{@render dest()}{:else}{@render go()}{/if}
      {/if}
    </div>
  {:else}
    <div class="body one">
      <p>
        {#each tParts('import.bmson.hint', {}, ['beat7k', 'beat10k']) as p, i (i)}
          {#if 'slot' in p}<code>{p.slot === 'beat7k' ? 'beat-7k' : 'beat-10k'}</code
            >{:else}{p.text}{/if}
        {/each}
      </p>
      <button class="ez-btn" onclick={() => (im.close(), app.commands.run('file.open'))}
        >{t('import.bmson.open')}</button
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
      <summary>{t('import.findings', { n: all.length })}</summary>
      <ul>
        {#each all as n, i (i)}
          <li class={n.severity}>
            {sev[n.severity]}
            {#if n.label}<b>{n.label}:</b>{/if}
            {tCore(n)}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/snippet}

{#snippet dest()}
  <div class="line">
    <span class="lbl">{t('import.dest')}</span>
    <input class="path" bind:value={im.dest} data-testid="import-dest" />
    <button class="ez-btn" onclick={pickDest}>{t('import.choose')}</button>
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
      {im.busy ? t('import.going') : t('import.go')}
    </button>
    {#if im.progress}<span class="dim"
        >{t('import.progress', { done: im.progress[0], total: im.progress[1] })}</span
      >{/if}
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
