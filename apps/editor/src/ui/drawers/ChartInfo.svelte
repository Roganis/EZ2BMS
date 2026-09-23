<script lang="ts">
  // What EZ2PORT shows and plays by: title, level, tier, the judgement windows
  // and gauge rates that go into the chart's .ini, and the song's key.
  import {
    CATEGORIES,
    isValidSongKey,
    JUDGEMENT_PRESETS,
    LIFE_PRESETS,
    modeNames,
    type ChartInfo,
    type JudgementDeltas,
    type LifeDeltas,
    type Tier,
  } from '@ez2bms/chart-core';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const d = $derived(slot.doc);
  const info = $derived.by(() => {
    void slot.rev;
    return slot.doc.data.info;
  });
  const TIERS: Tier[] = ['NM', 'HD', 'SHD', 'EX'];
  const names = $derived(modeNames(slot.mode));
  const j = $derived(info.judgementDeltas ?? JUDGEMENT_PRESETS[0]!.deltas);
  const life = $derived(info.lifeDeltas ?? LIFE_PRESETS[0]!.deltas);
  const jPreset = $derived(
    JUDGEMENT_PRESETS.find((p) =>
      (Object.keys(p.deltas) as (keyof JudgementDeltas)[]).every((k) => p.deltas[k] === j[k]),
    )?.id ?? 'custom',
  );
  const lPreset = $derived(
    LIFE_PRESETS.find((p) =>
      (Object.keys(p.deltas) as (keyof LifeDeltas)[]).every((k) => p.deltas[k] === life[k]),
    )?.id ?? 'custom',
  );
  const key = $derived(app.project?.sidecar.key ?? '');
  const song = $derived(app.project ? app.song.meta(app.project) : undefined);
  const category = $derived(app.project ? app.song.category(app.project) : 48);

  function set(patch: Partial<Omit<ChartInfo, 'extra'>>, merge?: string) {
    d.transact('Chart info', (tx) => tx.setInfo(patch), merge ? { merge } : {});
  }
</script>

<div class="ez-form">
  <div class="row">
    <span class="lbl">Mode</span>
    <div class="mode"><b>{names.label}</b> · {names.portName} · <code>{slot.file}</code></div>
  </div>
  <div class="row">
    <label for="ci-title">Title <span class="scope">every chart</span></label>
    <input
      id="ci-title"
      value={song?.values.title ?? ''}
      oninput={(e) => app.song.setMeta({ title: e.currentTarget.value }, 'title')}
    />
    {#if new TextEncoder().encode(song?.values.title ?? '').length > 32}<span class="warn"
        >EZ2PORT's song list keeps the first 32 bytes</span
      >{/if}
  </div>
  <div class="cols">
    <div class="row">
      <label for="ci-artist">Artist</label>
      <input
        id="ci-artist"
        value={song?.values.artist ?? ''}
        oninput={(e) => app.song.setMeta({ artist: e.currentTarget.value }, 'artist')}
      />
    </div>
    <div class="row">
      <label for="ci-genre">Genre</label>
      <input
        id="ci-genre"
        value={song?.values.genre ?? ''}
        oninput={(e) => app.song.setMeta({ genre: e.currentTarget.value }, 'genre')}
      />
    </div>
  </div>
  {#if song?.differs.length}<span class="warn"
      >The charts differ in {song.differs.join(', ')}: this shows the NM chart's</span
    >{/if}
  <div class="row">
    <span class="lbl">Tier</span>
    <div class="ez-seg">
      {#each TIERS as t (t)}
        <button
          class:on={slot.tier === t}
          title={t === slot.tier ? '' : `Make this chart ${t} (its file follows when saved)`}
          onclick={() => app.song.setTier(slot, t)}>{t}</button
        >
      {/each}
    </div>
  </div>
  <div class="row">
    <label for="ci-level">Level <span class="num">{info.level ?? 0}</span></label>
    <input
      id="ci-level"
      type="range"
      min="1"
      max="20"
      value={info.level ?? 1}
      oninput={(e) => set({ level: Number(e.currentTarget.value) }, 'level')}
    />
  </div>

  <h3>Judgement</h3>
  <div class="row">
    <select
      value={jPreset}
      onchange={(e) => {
        const p = JUDGEMENT_PRESETS.find((x) => x.id === e.currentTarget.value);
        if (p) set({ judgementDeltas: { ...p.deltas } });
      }}
    >
      {#each JUDGEMENT_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      {#if jPreset === 'custom'}<option value="custom">Custom</option>{/if}
    </select>
  </div>
  <div class="cols">
    {#each ['KOOL', 'COOL', 'GOOD', 'MISS'] as const as k (k)}
      <div class="row">
        <label for="ci-j-{k}">{k}</label>
        <input
          id="ci-j-{k}"
          type="number"
          min="0"
          max="200"
          value={j[k]}
          onchange={(e) => set({ judgementDeltas: { ...j, [k]: Number(e.currentTarget.value) } })}
        />
      </div>
    {/each}
  </div>
  <p class="hint">Windows in 1/192-beat ticks at each note's BPM; EZ2PORT adds 3 when it loads.</p>

  <h3>Gauge</h3>
  <div class="row">
    <select
      value={lPreset}
      onchange={(e) => {
        const p = LIFE_PRESETS.find((x) => x.id === e.currentTarget.value);
        if (p) set({ lifeDeltas: { ...p.deltas } });
      }}
    >
      {#each LIFE_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      {#if lPreset === 'custom'}<option value="custom">Custom</option>{/if}
    </select>
  </div>
  <div class="cols">
    {#each ['COOL', 'GOOD', 'MISS', 'FAIL'] as const as k (k)}
      <div class="row">
        <label for="ci-l-{k}">{k}</label>
        <input
          id="ci-l-{k}"
          type="number"
          step="0.1"
          value={life[k]}
          onchange={(e) => set({ lifeDeltas: { ...life, [k]: Number(e.currentTarget.value) } })}
        />
      </div>
    {/each}
  </div>

  <h3>Song</h3>
  <div class="row">
    <label for="ci-key">Key (folder name in EZ2PORT)</label>
    <input
      id="ci-key"
      value={key}
      spellcheck="false"
      oninput={(e) => {
        if (app.project) app.project.sidecar.key = e.currentTarget.value;
      }}
    />
    {#if key && !isValidSongKey(key)}<span class="warn">1-15 lowercase letters or digits</span>{/if}
  </div>
  <div class="row">
    <label for="ci-category">Category on the song wheel</label>
    <select
      id="ci-category"
      value={category}
      onchange={(e) => void app.song.setCategory(Number(e.currentTarget.value))}
    >
      {#each CATEGORIES as c (c.id)}
        <option value={c.id}>{c.id} · {c.label}</option>
      {/each}
    </select>
    <span class="hint">EZ2PORT lists the song in this one bank only (not in ALL)</span>
  </div>
</div>

<style>
  .scope {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-left: 4px;
  }
  .hint {
    font-size: 11px;
    color: var(--ink-faint);
  }
  .mode {
    color: var(--ink);
  }
  code,
  .num {
    font-family: var(--font-num);
    color: var(--neon);
    text-transform: none;
    letter-spacing: 0;
  }
</style>
