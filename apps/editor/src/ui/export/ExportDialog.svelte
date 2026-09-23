<script lang="ts">
  // Export: the song back into the original game (a song it already has - its
  // charts, keysounds and song.bin record), or out as BMS. Everything the
  // export would write is worked out first and shown: which file each chart
  // becomes, the levels and BPM the game's table will say, which keysounds
  // are new, what the cabinet plays differently. Export into a game folder
  // keeps a backup, and Past exports puts it back.
  import { modeNames, MODES, type ModeId } from '@ez2bms/chart-core';
  import { formatWhen } from '../../state/autosave';
  import { app } from '../../state/app.svelte';

  const ex = app.exporter;
  const TABS = [
    { id: 'cabinet', label: 'EZ2AC cabinet' },
    { id: 'bms', label: 'BMS' },
    { id: 'history', label: 'Past exports' },
  ] as const;
  const TIERS = ['NM', 'HD', 'SHD', 'EX'] as const;
  const MAX = 131068;
  const sev = { error: '⛔', warning: '⚠', info: 'ℹ' } as const;
  const kb = (n: number) => `${Math.round(n / 102.4) / 10} KB`;
  const bpm = (n: number) => Math.round(n * 100) / 100;
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const label = (m: ModeId) => modeNames(m).label;
  const project = $derived(app.project!);

  /** A target's tiers per mode, as the game lists them. */
  function levels(entries: Partial<Record<ModeId, { steps: { level: number }[] }>>): string {
    return MODES.filter((m) => entries[m.id])
      .map(
        (m) =>
          `${m.label} ${
            entries[m.id]!.steps.map((s, t) => (s.level ? `${TIERS[t]} ${s.level}` : ''))
              .filter(Boolean)
              .join(' ') || '-'
          }`,
      )
      .join(' · ');
  }

  async function pickFolder(set: (d: string) => void, why: string) {
    const d = await app.backend.pickFolder(why);
    if (d) set(d);
  }
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || app.view.paletteOpen) return;
    e.stopImmediatePropagation();
    ex.close();
  }
</script>

<svelte:window onkeydown={onkey} />

<section class="dialog ez-form" data-testid="export-dialog" aria-label="Export the song">
  <header>
    <h2>Export</h2>
    <nav class="tabs">
      {#each TABS as t (t.id)}
        <button
          class:on={ex.tab === t.id}
          onclick={() => void ex.enter(t.id)}
          data-testid="export-tab-{t.id}">{t.label}</button
        >
      {/each}
    </nav>
    <button class="x" onclick={() => ex.close()} aria-label="Close">×</button>
  </header>

  {#if ex.tab === 'cabinet'}
    <div class="body">
      <aside class="list">
        <input
          type="search"
          placeholder="Search the game's songs"
          bind:value={ex.query}
          data-testid="export-search"
        />
        {#if ex.loadingGame}
          <p class="hint">Reading the song tables…</p>
        {:else if ex.gameError}
          <p class="warn">{ex.gameError}</p>
          <button class="ez-btn" onclick={() => void ex.reloadGame()}>Read again</button>
        {/if}
        <ul>
          {#each ex.found as t (t.dir)}
            <li>
              <button
                class="song"
                class:on={ex.target?.dir === t.dir}
                onclick={() => ex.choose(t)}
                data-testid="export-target"
              >
                <b>{t.title?.title ?? t.dir}</b>
                <span class="dim">{t.dir}</span>
                <span class="charts">{levels(t.entries)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </aside>
      <div class="detail">
        {#if !ex.target}
          <p class="hint">
            Pick the game's song to replace. A cabinet export remixes a song the game already has:
            your charts take its charts' places (a tier it lacks is added), its song.bin record gets
            their levels and BPM, and new keysounds go beside its own - nothing of the game's is
            written over but the charts, and a backup keeps those.
          </p>
        {:else}
          {@const t = ex.target}
          <h3>{t.title?.title ?? t.dir}</h3>
          <p class="dim">sound/{t.dir}</p>
          {#if ex.otherSong}
            <p class="warn" data-testid="export-other-song">
              This song came from {ex.otherSong}: exporting into {t.dir} puts your charts in place of
              {t.dir}'s.
            </p>
          {/if}
          {@render charts()}
          {@render destination()}
          {@render review()}
        {/if}
      </div>
    </div>
  {:else if ex.tab === 'bms'}
    <div class="body one">{@render bmsTab()}</div>
  {:else}
    <div class="body one">{@render history()}</div>
  {/if}
</section>

{#snippet charts()}
  {@const s = ex.cabinet}
  {@const r = s.kind === 'ready' || s.kind === 'writing' || s.kind === 'done' ? s.review : null}
  <table class="files">
    <thead>
      <tr
        ><th></th><th>Chart</th><th>Becomes</th><th>Level</th><th>BPM</th><th>Size</th><th>.ini</th
        ></tr
      >
    </thead>
    <tbody>
      {#each project.charts as c (c.file)}
        {@const i = r?.plan.charts.findIndex((x) => x.chart.file === c.file) ?? -1}
        {@const cp = i >= 0 ? r!.plan.charts[i] : undefined}
        {@const refused = r?.plan.refused.find((x) => x.chart.file === c.file)}
        {@const ez = cp && r!.out.files.find((f) => f.path === cp.paths.ez)}
        <tr data-file={c.file} data-testid="export-chart" class:skipped={ex.skip[c.file]}>
          <td
            ><input
              type="checkbox"
              checked={!ex.skip[c.file]}
              onchange={(e) => ex.toggle(c.file, e.currentTarget.checked)}
            /></td
          >
          <td><b>{label(c.mode)} {c.tier}</b> <span class="dim">{c.file}</span></td>
          {#if cp}
            <td
              >{base(cp.paths.ez)}
              <span class="dim">{cp.exists.ez ? 'replaces' : 'new'}</span></td
            >
            <td data-testid="export-level"
              >{cp.before.level === cp.level
                ? cp.level
                : `${cp.before.level || '-'} → ${cp.level}`}</td
            >
            <td
              >{bpm(cp.before.b) === bpm(cp.bpm) || !cp.before.level
                ? bpm(cp.bpm)
                : `${bpm(cp.before.b)} → ${bpm(cp.bpm)}`}</td
            >
            <td class:bad={!!ez && ez.bytes.length > MAX}
              >{ez ? `${kb(ez.bytes.length)} of 128 KB` : ''}</td
            >
            <td class="dim">{r!.out.ini[i]}</td>
          {:else if refused}
            <td colspan="5" class="warn">{refused.reason}</td>
          {:else}
            <td colspan="5" class="dim">{ex.skip[c.file] ? 'left out' : ''}</td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

{#snippet destination()}
  <fieldset class="dest">
    <label class="check"
      ><input
        type="radio"
        name="dest"
        checked={ex.destKind === 'game'}
        onchange={() => ex.setDest('game')}
        data-testid="export-dest-game"
      />
      Into the game folder <span class="dim">{app.settings.data.gameRoot}</span> - a backup keeps every
      file it replaces</label
    >
    <label class="check"
      ><input
        type="radio"
        name="dest"
        checked={ex.destKind === 'folder'}
        onchange={() => ex.setDest('folder')}
        data-testid="export-dest-folder"
      /> Into a new folder shaped like the game, to copy onto the cabinet</label
    >
    {#if ex.destKind === 'folder'}
      <div class="line">
        <span class="lbl">New folder</span>
        <input class="path" bind:value={ex.folder} data-testid="export-folder" />
        <button
          class="ez-btn"
          onclick={() => pickFolder((d) => (ex.folder = d), 'An empty folder for the export')}
          >Choose…</button
        >
      </div>
      <label class="check"
        ><input
          type="checkbox"
          checked={ex.includeUnchanged}
          onchange={(e) => ex.setIncludeUnchanged(e.currentTarget.checked)}
        /> Also copy the keysounds the game already has</label
      >
      <p class="warn">
        song.bin is this game's whole table for the mode: copy it only onto a cabinet with the same
        game version, or its other songs' levels change with it. EZ2BMS-EXPORT.txt in the folder
        says what each file replaces.
      </p>
    {/if}
  </fieldset>
{/snippet}

{#snippet review()}
  {@const s = ex.cabinet}
  {#if s.kind === 'preparing'}
    <p class="hint">Working out the export…</p>
  {:else if s.kind === 'failed'}
    <p class="warn" data-testid="export-failed">{s.message}</p>
  {:else if s.kind !== 'idle'}
    {@const r = s.review}
    <div class="summary">
      <p data-testid="export-sounds">
        Keysounds: <b>{r.sounds.write}</b> new, {r.sounds.reused} already in the folder{r.sounds
          .missing
          ? `, ${r.sounds.missing} missing`
          : ''}{r.sounds.converted ? ` (${r.sounds.converted} converted)` : ''}
      </p>
      {#each r.plan.songdb as db (db.mode)}
        {@const changed = r.out.songdbChanged[db.mode]?.length ?? 0}
        <p data-testid="export-songdb">
          {modeNames(db.mode).portName} song.bin:
          {#if changed}
            {db.edits
              .map((e) => {
                const before = r.target.entries[db.mode]!.steps[e.tier];
                return `${TIERS[e.tier]} ${before.level === e.level ? e.level : `${before.level || '-'} → ${e.level}`}`;
              })
              .join(', ')}
            <span class="dim">({changed} bytes change)</span>
          {:else}
            <span class="dim">unchanged</span>
          {/if}
        </p>
      {/each}
    </div>
    {#if r.findings.length}
      <details class="notes" open={r.findings.some((f) => f.severity !== 'info')}>
        <summary>{r.findings.length} thing{r.findings.length === 1 ? '' : 's'} to know</summary>
        <ul data-testid="export-findings">
          {#each r.findings as f, i (i)}
            <li class={f.severity} data-rule={f.rule}>
              {sev[f.severity]}
              {#if f.chart}<b>{f.chart}:</b>{/if}
              {f.message}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
    {#if s.kind === 'done'}
      <div class="result" data-testid="export-result">
        {#if s.report}
          <p>
            Exported into the game: {s.report.replaced.length} replaced, {s.report.created.length} added.
            The backup is <code>{s.report.stamp}</code>.
          </p>
          <button
            class="ez-btn"
            onclick={() => void ex.restore(s.report!.stamp)}
            data-testid="export-undo">Undo this export</button
          >
        {:else if s.folder}
          <p>Wrote {s.folder.files} files into {s.folder.dir}.</p>
        {/if}
      </div>
    {:else}
      {@const why = ex.blocked(r)}
      <div class="line">
        <button
          class="ez-btn primary"
          disabled={!!why || s.kind === 'writing'}
          onclick={() => void ex.writeCabinet()}
          data-testid="export-go">{s.kind === 'writing' ? 'Exporting…' : 'Export'}</button
        >
        {#if why}<span class="warn">{why}</span>{/if}
        {#if ex.progress}<span class="dim">{ex.progress[0]} / {ex.progress[1]}</span>{/if}
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet bmsTab()}
  {@const b = ex.bms}
  <p class="hint">
    One BMS (or BME, when it uses keys 6-7) per chart, and every sound beside them: WAV and OGG
    files copied as they are, anything else - EZ2's .ssf, FLAC, MP3, a stem's slices - as WAV.
  </p>
  <table class="files">
    <thead><tr><th></th><th>Chart</th><th>Writes</th><th>Notes</th></tr></thead>
    <tbody>
      {#each project.charts as c (c.file)}
        {@const w = b.review?.exp.charts.find((x) => x.file === c.file)}
        <tr data-file={c.file} class:skipped={ex.bmsSkip[c.file]}>
          <td
            ><input
              type="checkbox"
              checked={!ex.bmsSkip[c.file]}
              onchange={(e) => (ex.bmsSkip = { ...ex.bmsSkip, [c.file]: !e.currentTarget.checked })}
            /></td
          >
          <td><b>{label(c.mode)} {c.tier}</b> <span class="dim">{c.file}</span></td>
          <td>{w?.path ?? ''}</td>
          <td class="dim">{w ? w.written.notes.length || '' : ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="line">
    <span class="lbl">Lanes</span>
    <select bind:value={ex.bmsChoices.map} data-testid="bms-export-map">
      <option value="ez2">EZ2 BME (scratch 16, pedal 17, effectors 18/19)</option>
      <option value="keys">Keys in order (for IIDX/beat players)</option>
    </select>
  </div>
  <div class="line">
    <span class="lbl">Text</span>
    <select bind:value={ex.bmsChoices.encoding} data-testid="bms-export-encoding">
      <option value="auto">Auto (Shift-JIS, else Korean, else UTF-8)</option>
      <option value="shift_jis">Shift-JIS</option>
      <option value="euc-kr">Korean (CP949)</option>
      <option value="utf-8">UTF-8 (beatoraja)</option>
    </select>
    {#if b.review}<span class="dim" data-testid="bms-export-chosen">{b.review.exp.encoding}</span
      >{/if}
  </div>
  <div class="line">
    <span class="lbl">Sound ids</span>
    <select
      value={String(ex.bmsChoices.base)}
      onchange={(e) => {
        const v = e.currentTarget.value;
        ex.bmsChoices.base = v === 'auto' ? 'auto' : (Number(v) as 36 | 62);
      }}
    >
      <option value="auto">Auto (base 36, 62 past 1295 sounds)</option>
      <option value="36">Base 36</option>
      <option value="62">Base 62</option>
    </select>
  </div>
  {#if b.error}<p class="warn">{b.error}</p>{/if}
  {#if b.review}
    {@const e = b.review.exp}
    <p>
      {e.files.length} chart{e.files.length === 1 ? '' : 's'} · {e.soundFiles.length} sounds ({e
        .copies.length} copied, {e.sounds.length} made)
    </p>
    {#if e.notes.length}
      <details class="notes" open={e.notes.some((n) => n.severity !== 'info')}>
        <summary>{e.notes.length} thing{e.notes.length === 1 ? '' : 's'} to know</summary>
        <ul>
          {#each e.notes as n, i (i)}
            <li class={n.severity}>{sev[n.severity]} {n.message}</li>
          {/each}
        </ul>
      </details>
    {/if}
    <div class="line">
      <span class="lbl">New folder</span>
      <input class="path" bind:value={ex.bmsDest} data-testid="bms-export-dest" />
      <button
        class="ez-btn"
        onclick={() => pickFolder((d) => (ex.bmsDest = d), 'An empty folder for the BMS files')}
        >Choose…</button
      >
    </div>
    {@const s = ex.bmsStage}
    <div class="line">
      <button
        class="ez-btn primary"
        disabled={s.kind === 'writing' || !ex.bmsDest.trim()}
        onclick={() => void ex.writeBms()}
        data-testid="bms-export-go">{s.kind === 'writing' ? 'Exporting…' : 'Export'}</button
      >
      {#if ex.progress}<span class="dim">{ex.progress[0]} / {ex.progress[1]}</span>{/if}
    </div>
    {#if s.kind === 'done'}
      <p class="result" data-testid="bms-export-result">Wrote {s.files} files into {s.dir}.</p>
    {:else if s.kind === 'failed'}
      <p class="warn">{s.message}</p>
    {/if}
  {/if}
{/snippet}

{#snippet history()}
  <p class="hint">
    Every export into {app.settings.data.gameRoot ?? 'the game folder'} kept the files it replaced. Restore
    puts them back and takes away what it added - where a file is still what the export wrote.
  </p>
  {#if ex.backupsError}<p class="warn">{ex.backupsError}</p>{/if}
  {#if !ex.backups.length && !ex.backupsError}<p class="dim">No exports yet.</p>{/if}
  <ul class="backups">
    {#each ex.backups as b (b.stamp)}
      <li data-testid="backup-row" data-stamp={b.stamp}>
        <div>
          <b>{b.label || b.stamp}</b>
          <span class="dim">{formatWhen(b.created_ms)} · {b.files} files · {b.state}</span>
        </div>
        <button
          class="ez-btn"
          disabled={b.state === 'restored'}
          onclick={() => void ex.restore(b.stamp)}
          data-testid="backup-restore">{b.state === 'restored' ? 'Restored' : 'Restore'}</button
        >
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .dialog {
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
    gap: 10px;
  }
  .list {
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 8px;
    min-height: 0;
  }
  .list ul,
  .backups {
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
  .detail > p,
  .summary p {
    margin: 0;
  }
  .summary {
    display: grid;
    gap: 4px;
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
  .bad {
    color: var(--error, #ff6b6b);
  }
  .dest {
    border: 1px solid rgba(88, 225, 255, 0.12);
    border-radius: 6px;
    padding: 8px 10px;
    display: grid;
    gap: 6px;
    margin: 0;
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
  .backups li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(88, 225, 255, 0.08);
  }
  .backups li div {
    display: grid;
  }
  .backups .ez-btn {
    width: auto;
  }
  .result {
    display: grid;
    gap: 6px;
    justify-items: start;
  }
  .result .ez-btn {
    width: auto;
  }
  .primary {
    border-color: var(--neon);
  }
</style>
