<script lang="ts">
  // The song's preview: the loop EZ2PORT's song wheel plays while the song is
  // highlighted (preview.ssf). Cut from a chart's mix or an audio file; pick
  // the window on the whole song's loudness - drag it, pull its right edge
  // for the length, the arrow keys to nudge - and hear it as the wheel will:
  // faded in and out, restarted hard at its end.
  import { PREVIEW_MAX_MS, PREVIEW_MIN_MS, defaultPreviewStart } from '@ez2bms/chart-core';
  import { onDestroy } from 'svelte';
  import { PlanTimeline } from '../../audio/timeline';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';

  let { project }: { project: Project } = $props();

  const settings = $derived(project.sidecar.preview ?? {});
  const fromFile = $derived(settings.file !== undefined);
  const slot = $derived(app.preview.chart(project));
  const rev = $derived(slot?.rev ?? 0);
  const win = $derived.by(() => {
    void rev;
    return app.preview.window(project);
  });
  const audioFiles = $derived(project.samples.filter((s) => /\.(wav|ogg|flac|mp3|oga)$/i.test(s)));

  // ---- the overview: fetched when what it shows changes
  const H = 150;
  let width = $state(800);
  let peaks = $state.raw<Int16Array | null>(null);
  let endMs = $state(0);
  let loading = $state(false);
  const sourceKey = $derived(`${settings.file ?? ''}|${slot?.file ?? ''}|${rev}|${width}`);
  let seq = 0;
  $effect(() => {
    void sourceKey;
    const n = ++seq;
    loading = true;
    const t = setTimeout(() => {
      app.preview
        .overview(project, Math.max(64, Math.round(width)))
        .then((o) => {
          if (n !== seq) return;
          peaks = o.peaks;
          endMs = o.endMs;
        })
        .finally(() => n === seq && (loading = false));
    }, 120);
    return () => clearTimeout(t);
  });

  // Measure lines, for a chart: every 4/4 measure as EZ2PORT plays it.
  const measures = $derived.by((): number[] => {
    if (fromFile || !slot || !endMs) return [];
    void rev;
    const { plan } = app.preview.plan(slot);
    const res = slot.doc.resolution;
    const tl = new PlanTimeline(plan.tempo, res, slot.doc.data.stopEvents);
    const out: number[] = [];
    for (let m = 0; m < 2000; m++) {
      const ms = tl.msAt(m * 4 * res);
      if (ms > endMs) break;
      out.push(ms);
    }
    return out;
  });
  const notes = $derived.by(() => {
    void rev;
    return fromFile ? [] : app.preview.noteMs(project);
  });

  // ---- geometry
  const span = $derived(Math.max(endMs, win.startMs + win.lengthMs, 1));
  const xOf = (ms: number) => (ms / span) * width;
  const msOf = (x: number) => (x / width) * span;

  // ---- the window being dragged (committed on release)
  let live = $state<{ startMs: number; lengthMs: number } | null>(null);
  const shown = $derived(live ?? { startMs: win.startMs, lengthMs: win.lengthMs });

  /** The note nearest `ms`, within a few pixels: a preview is best started on a hit. */
  function snap(ms: number, alt: boolean): number {
    if (alt || !notes.length) return Math.round(ms);
    const reach = msOf(6);
    let best = ms;
    let d = reach;
    for (const t of notes)
      if (Math.abs(t - ms) < d) {
        d = Math.abs(t - ms);
        best = t;
      }
    return Math.round(best);
  }

  let drag:
    { mode: 'move' | 'size'; x: number; start: number; length: number; id: number } | undefined;
  function down(e: PointerEvent, mode: 'move' | 'size') {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { mode, x: e.clientX, start: shown.startMs, length: shown.lengthMs, id: e.pointerId };
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = msOf(e.clientX - drag.x);
    if (drag.mode === 'move')
      live = { startMs: Math.max(0, snap(drag.start + d, e.altKey)), lengthMs: drag.length };
    else
      live = {
        startMs: drag.start,
        lengthMs: Math.round(Math.min(PREVIEW_MAX_MS, Math.max(PREVIEW_MIN_MS, drag.length + d))),
      };
  }
  function up(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = undefined;
    if (live) void commit(live);
  }
  async function commit(w: { startMs: number; lengthMs: number }) {
    await app.preview.set({ startMs: w.startMs, lengthMs: w.lengthMs });
    live = null;
    if (app.preview.playing) void app.preview.play(project);
  }
  /** A click on the song puts the window there. */
  function place(e: PointerEvent) {
    if (e.button !== 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    void commit({
      startMs: snap(Math.max(0, msOf(e.clientX - r.left)), e.altKey),
      lengthMs: shown.lengthMs,
    });
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 1000 : 100;
    const d = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    void commit({ startMs: Math.max(0, shown.startMs + d), lengthMs: shown.lengthMs });
  }

  // ---- drawing
  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    const c = canvas;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, H);
    g.fillStyle = 'rgba(88, 225, 255, 0.07)';
    for (const m of measures) g.fillRect(Math.round(xOf(m)), 0, 1, H);
    const p = peaks;
    if (!p) return;
    const n = p.length / 2;
    const mid = H / 2;
    g.fillStyle = '#3a6f9a';
    for (let i = 0; i < n; i++) {
      const x = (i / n) * width;
      const lo = (p[i * 2]! / 32768) * mid;
      const hi = (p[i * 2 + 1]! / 32768) * mid;
      g.fillRect(x, mid - Math.max(hi, 0.5), Math.max(1, width / n), Math.max(1, hi - lo));
    }
  });

  // ---- auditioning, with a playhead
  let playhead = $state<number | null>(null);
  let started = 0;
  let raf = 0;
  function tick() {
    if (!app.preview.playing) {
      playhead = null;
      return;
    }
    playhead = ((performance.now() - started) % shown.lengthMs) / shown.lengthMs;
    raf = requestAnimationFrame(tick);
  }
  async function toggle() {
    if (app.preview.playing) {
      app.preview.stop();
      return;
    }
    await app.preview.play(project);
    started = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  onDestroy(() => {
    cancelAnimationFrame(raf);
    app.preview.stop();
  });

  const fmt = (ms: number) => {
    const s = ms / 1000;
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  };
  const picked = $derived(
    settings.startMs === undefined && !fromFile ? "EZ2PORT's importer's pick" : '',
  );
  function reset() {
    void app.preview.set({ startMs: undefined, lengthMs: undefined, fadeMs: undefined });
  }
</script>

<section class="picker" data-testid="preview-picker" aria-label="Preview">
  <div class="source ez-form">
    <div class="ez-seg" role="group" aria-label="What the preview is cut from">
      <button
        class:on={!fromFile}
        data-testid="preview-from-chart"
        onclick={() => void app.preview.set({ file: undefined, startMs: undefined })}
        >A chart's mix</button
      >
      <button
        class:on={fromFile}
        data-testid="preview-from-file"
        disabled={!audioFiles.length}
        onclick={() =>
          void app.preview.set({ file: settings.file ?? audioFiles[0], startMs: undefined })}
        >An audio file</button
      >
    </div>
    {#if !fromFile}
      <select
        data-testid="preview-chart"
        aria-label="Chart"
        value={slot?.file ?? ''}
        onchange={(e) => void app.preview.set({ chart: e.currentTarget.value, startMs: undefined })}
      >
        {#each project.charts as c (c.file)}<option value={c.file}>{c.label}</option>{/each}
      </select>
    {:else}
      <select
        data-testid="preview-file"
        aria-label="Audio file"
        value={settings.file}
        onchange={(e) => void app.preview.set({ file: e.currentTarget.value, startMs: undefined })}
      >
        {#each audioFiles as f (f)}<option value={f}>{f}</option>{/each}
      </select>
    {/if}
  </div>

  <div
    class="song"
    data-testid="preview-song"
    bind:clientWidth={width}
    style:height="{H}px"
    role="presentation"
    onpointerdown={place}
  >
    <canvas bind:this={canvas} style:width="{width}px" style:height="{H}px"></canvas>
    {#if loading && !peaks}<span class="loading">Mixing the song…</span>{/if}
    <div
      class="window"
      data-testid="preview-window"
      tabindex="0"
      role="slider"
      aria-label="Preview window: drag to move, arrow keys to nudge"
      aria-valuenow={shown.startMs}
      style:left="{xOf(shown.startMs)}px"
      style:width="{xOf(shown.lengthMs)}px"
      onpointerdown={(e) => down(e, 'move')}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key}
    >
      <!-- The fades, baked into the file. -->
      <span class="fade in" style:width="{(win.fadeMs / shown.lengthMs) * 100}%"></span>
      <span class="fade out" style:width="{(win.fadeMs / shown.lengthMs) * 100}%"></span>
      {#if playhead !== null}<span class="head" style:left="{playhead * 100}%"></span>{/if}
      <span
        class="edge"
        data-testid="preview-length"
        role="presentation"
        onpointerdown={(e) => down(e, 'size')}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
      ></span>
    </div>
  </div>

  <div class="bar">
    <button class="play ez-btn" data-testid="preview-play" onclick={() => void toggle()}>
      {app.preview.playing ? '■ Stop' : '▶ Play the loop'}
    </button>
    <span class="at" data-testid="preview-at">
      from <b>{fmt(shown.startMs)}</b>, <b>{(shown.lengthMs / 1000).toFixed(1)} s</b>, fades
      {(win.fadeMs / 1000).toFixed(1)} s
      {#if picked}<span class="dim">- {picked}</span>{/if}
    </span>
    <label class="fadeset"
      >Fades <input
        type="range"
        min="0"
        max="3000"
        step="100"
        data-testid="preview-fade"
        value={win.fadeMs}
        onchange={(e) => void app.preview.set({ fadeMs: Number(e.currentTarget.value) })}
      /></label
    >
    {#if settings.startMs !== undefined || settings.lengthMs !== undefined || settings.fadeMs !== undefined}
      <button class="ez-btn" data-testid="preview-reset" onclick={reset}>Reset</button>
    {/if}
  </div>
  <p class="hint">
    The wheel loops this while the song is chosen, restarting it hard at its end, so its fades are
    part of the file. {#if !fromFile}It is mixed as EZ2PORT plays the chart - every keysound at its
      velocity and pan - then brought down to a peak of 32000 if it is louder, as the port's own
      importer does. A click on the song moves the window there; its start keeps to a note unless
      Alt is held.{/if}
    {#if !fromFile && notes.length}
      EZ2PORT's importer would start at {fmt(defaultPreviewStart(notes))}.
    {/if}
  </p>
</section>

<style>
  .picker {
    display: grid;
    gap: 12px;
    align-content: start;
    max-width: 1100px;
  }
  .source {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 0;
  }
  .source .ez-seg {
    width: 280px;
    flex: none;
  }
  .source select {
    width: auto;
    min-width: 220px;
  }
  .song {
    position: relative;
    border-radius: 8px;
    background: #070a13;
    border: 1px solid rgba(88, 225, 255, 0.12);
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  .song canvas {
    display: block;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .window {
    position: absolute;
    top: 0;
    bottom: 0;
    box-sizing: border-box;
    border: 1.5px solid var(--neon);
    background: rgba(88, 225, 255, 0.1);
    box-shadow: 0 0 12px rgba(88, 225, 255, 0.35);
    cursor: grab;
    outline: none;
  }
  .window:focus-visible {
    box-shadow: 0 0 0 2px rgba(255, 79, 216, 0.6);
  }
  .fade {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
  }
  .fade.in {
    left: 0;
    background: linear-gradient(to right, rgba(5, 6, 10, 0.75), transparent);
  }
  .fade.out {
    right: 0;
    background: linear-gradient(to left, rgba(5, 6, 10, 0.75), transparent);
  }
  .head {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--neon-2);
    box-shadow: 0 0 8px var(--neon-2);
    pointer-events: none;
  }
  .edge {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -5px;
    width: 10px;
    cursor: ew-resize;
  }
  .edge::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 3px;
    width: 4px;
    height: 28px;
    margin-top: -14px;
    border-radius: 2px;
    background: var(--neon);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    font-size: 12.5px;
    color: var(--ink-dim);
  }
  .play {
    min-width: 128px;
  }
  .at b {
    color: var(--ink);
    font-family: var(--font-num);
    font-weight: 600;
  }
  .dim {
    color: var(--ink-faint);
  }
  .fadeset {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
  }
  .fadeset input {
    accent-color: var(--neon);
  }
  .hint {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-faint);
  }
</style>
