<script lang="ts">
  // The song's BGA: one movie behind the play field, stretched to 640x480,
  // its first frame at StartMs of chart time and black before and after it
  // (EZ2PORT's scene/bga.c; it never loops, its sound is not played). The
  // movie the charts name is used as EZ2PORT's importer would use it, unless
  // another is chosen here; what EZ2PORT's Windows build can decode is read
  // from the movie's headers. The preview is the webview's own player,
  // following the song's clock - what it can show is not what the port can.
  import {
    chartBga,
    containerName,
    portCannotPlay,
    type ChartBga,
    type MovieInfo,
  } from '@ez2bms/chart-core';
  import { t, tCore, tParts } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';
  import { songFindings } from '../../port/lint';

  let { project }: { project: Project } = $props();

  const settings = $derived(project.sidecar.bga);
  const bga = $derived(project.bga);
  /** What the charts name, as the importer would take it. */
  const fromCharts = $derived.by<{ file: string; bga: ChartBga } | undefined>(() => {
    for (const c of project.charts) {
      void c.rev;
      const b = chartBga(c.doc.data);
      if (b) return { file: c.file, bga: b };
    }
    return undefined;
  });
  const source = $derived(
    settings === null ? 'none' : settings?.file ? 'file' : fromCharts ? 'charts' : 'none',
  );
  const probe = $derived(bga?.path && bga.movie ? app.bga.probe(project, bga.path) : undefined);
  const movie = $derived<MovieInfo | undefined>(probe && !('error' in probe) ? probe : undefined);
  const verdict = $derived(movie ? portCannotPlay(movie) : undefined);
  const findings = $derived(
    songFindings(app).filter((f) => f.rule.startsWith('bga') || /BGA/.test(f.message)),
  );

  const clock = (ms: number) => {
    const neg = ms < 0;
    const s = Math.abs(ms) / 1000;
    return `${neg ? '-' : ''}${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
  };

  // ---- the source
  function pickSource(v: string) {
    if (v === 'none') void app.bga.set(null);
    else if (v === 'charts') void app.bga.set(undefined);
    else if (project.movies[0]) void app.bga.patch({ file: settings?.file ?? project.movies[0] });
  }

  // ---- the start
  const slot = $derived(app.slot);
  function startAt(ms: number | undefined) {
    void app.bga.patch({ startMs: ms === undefined ? undefined : Math.round(ms) });
  }
  const cursorMs = $derived(slot ? app.audio.msAt(slot, app.view.cursor) : 0);

  // ---- the preview, following the song
  const endMs = $derived(app.bga.songEndMs(project) ?? 0);
  let scrub = $state(0);
  let video = $state<HTMLVideoElement>();
  let url = $state('');
  let videoError = $state('');
  $effect(() => {
    const path = bga?.path && bga.movie ? bga.path : '';
    let live = true;
    let made = '';
    url = '';
    videoError = '';
    if (path)
      void app.backend
        .mediaUrl(`${project.dir}/${path}`)
        .then((u) => {
          if (!live) return;
          made = u;
          url = u;
        })
        .catch((e: unknown) => live && (videoError = String(e)));
    return () => {
      live = false;
      if (made.startsWith('blob:')) URL.revokeObjectURL(made);
    };
  });

  /** Where the song is: what is heard while playing, else the scrub position. */
  let shown = $state<'before' | 'movie' | 'after' | 'none'>('none');
  let movieMs = $state(0);
  $effect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const v = video;
      const b = project.bga;
      if (!b) {
        shown = 'none';
        return;
      }
      const songMs = app.view.playing ? (app.audio.heardNow() ?? scrub) : scrub;
      const t = songMs - b.startMs;
      const len =
        movie?.durationMs ?? (v && Number.isFinite(v.duration) ? v.duration * 1000 : null);
      shown = t < 0 ? 'before' : len !== null && t >= len ? 'after' : 'movie';
      movieMs = Math.round(t);
      if (!v || !url || v.readyState < 1) return;
      if (shown !== 'movie') {
        if (!v.paused) v.pause();
        return;
      }
      const want = t / 1000;
      if (app.view.playing) {
        if (v.paused) {
          v.currentTime = want;
          void v.play().catch(() => {});
        } else if (Math.abs(v.currentTime - want) > 0.08) v.currentTime = want;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - want) > 0.02) v.currentTime = want;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
  // While the song plays, the scrub follows it.
  $effect(() => {
    if (!app.view.playing) return;
    const t = setInterval(() => (scrub = app.audio.heardNow() ?? scrub), 100);
    return () => clearInterval(t);
  });
  async function toggle() {
    if (!slot) return;
    if (app.view.playing) await app.audio.stop();
    else {
      await app.audio.sync(slot);
      await app.audio.play(slot, app.audio.pulseAt(slot, scrub));
    }
  }
  $effect(() => () => {
    if (app.view.playing) void app.audio.stop();
  });
</script>

<section class="bga" data-testid="bga-panel" aria-label={t('bga.label')}>
  <div class="side ez-form">
    <div class="ez-seg" role="group" aria-label={t('bga.which')}>
      <button class:on={source === 'none'} data-testid="bga-none" onclick={() => pickSource('none')}
        >{t('bga.none')}</button
      >
      <button
        class:on={source === 'charts'}
        data-testid="bga-charts"
        disabled={!fromCharts}
        title={fromCharts ? '' : t('bga.noChartMovie')}
        onclick={() => pickSource('charts')}>{t('bga.charts')}</button
      >
      <button
        class:on={source === 'file'}
        data-testid="bga-file"
        disabled={!project.movies.length}
        onclick={() => pickSource('file')}>{t('bga.file')}</button
      >
    </div>
    {#if source === 'file'}
      <select
        data-testid="bga-movie"
        aria-label={t('bga.movie')}
        value={settings?.file}
        onchange={(e) => void app.bga.patch({ file: e.currentTarget.value, startMs: undefined })}
      >
        {#each project.movies as m (m)}<option value={m}>{m}</option>{/each}
      </select>
    {:else if source === 'charts' && fromCharts}
      <p class="hint">
        {#each tParts('bga.fromCharts', {}, ['movie', 'chart']) as p, i (i)}{#if 'slot' in p}<code
              >{p.slot === 'movie' ? fromCharts.bga.src : fromCharts.file}</code
            >{:else}{p.text}{/if}{/each}
      </p>
    {/if}
    <button class="ez-btn" data-testid="bga-import" onclick={() => void app.bga.pickAndImport()}
      >{t('bga.import')}</button
    >

    {#if bga}
      <div class="facts" data-testid="bga-facts">
        {#if !bga.movie}
          <p class="warn">
            {#each tParts('bga.notMovie', {}, ['file']) as p, i (i)}{#if 'slot' in p}<code
                  >{bga.src}</code
                >{:else}{p.text}{/if}{/each}
          </p>
        {:else if !bga.path}
          <p class="err">
            {#each tParts('song.notInFolder', {}, ['file']) as p, i (i)}{#if 'slot' in p}<code
                  >{bga.src}</code
                >{:else}{p.text}{/if}{/each}
          </p>
        {:else if !probe}
          <p class="hint">
            {#each tParts('bga.reading', {}, ['file']) as p, i (i)}{#if 'slot' in p}<code
                  >{bga.path}</code
                >{:else}{p.text}{/if}{/each}
          </p>
        {:else if 'error' in probe}
          <p class="err">{probe.error}</p>
        {:else}
          <dl>
            <dt>{t('bga.fileLabel')}</dt>
            <dd><code>{bga.path}</code></dd>
            <dt>{t('bga.container')}</dt>
            <dd>{containerName(probe.container)}</dd>
            <dt>{t('bga.video')}</dt>
            <dd data-testid="bga-codec">{probe.codec ?? t('bga.noCodec')}</dd>
            <dt>{t('bga.size')}</dt>
            <dd data-testid="bga-size">
              {probe.width && probe.height ? `${probe.width}x${probe.height}` : t('bga.unknown')}
            </dd>
            <dt>{t('bga.length')}</dt>
            <dd>{probe.durationMs !== null ? clock(probe.durationMs) : t('bga.unknown')}</dd>
          </dl>
          <p
            class="verdict"
            class:bad={!!verdict}
            data-testid="bga-verdict"
            data-ok={verdict ? 'false' : 'true'}
          >
            {verdict ? t('bga.cannotPlay', { reason: verdict }) : t('bga.plays')}
          </p>
        {/if}
      </div>

      <div class="row">
        <label for="bga-start">{t('bga.start')}</label>
        <div class="start">
          <input
            id="bga-start"
            data-testid="bga-start"
            type="number"
            step="1"
            value={bga.startMs}
            onchange={(e) => startAt(Number(e.currentTarget.value) || 0)}
          />
          <span class="n">{clock(bga.startMs)}</span>
        </div>
        <div class="starts">
          <button
            class="ez-btn"
            data-testid="bga-start-event"
            disabled={settings?.startMs === undefined}
            onclick={() => startAt(undefined)}
            title={t('bga.eventTitle')}>{t('bga.event')}</button
          >
          <button class="ez-btn" onclick={() => startAt(0)}>{t('bga.atZero')}</button>
          <button class="ez-btn" data-testid="bga-start-cursor" onclick={() => startAt(cursorMs)}
            >{t('bga.atCursor')}</button
          >
        </div>
      </div>
    {/if}

    {#each findings as f (f.rule + f.message)}
      <p class={f.severity === 'error' ? 'err' : f.severity === 'warning' ? 'warn' : 'hint'}>
        {tCore(f)}
      </p>
    {/each}
    <p class="hint">
      {#each tParts('bga.hint', {}, ['file']) as p, i (i)}{#if 'slot' in p}<code>bga</code
          >{:else}{p.text}{/if}{/each}
    </p>
  </div>

  <div class="stage">
    <div class="screen" data-testid="bga-screen" data-shown={shown} data-movie-ms={movieMs}>
      {#if url}
        <video
          bind:this={video}
          src={url}
          muted
          preload="auto"
          playsinline
          class:hidden={shown !== 'movie'}
          onerror={() => (videoError = t('bga.cannotShow'))}
          onloadeddata={() => (videoError = '')}
        ></video>
      {/if}
      {#if shown === 'before'}<span class="note"
          >{t('bga.before', { time: clock(bga!.startMs) })}</span
        >{:else if shown === 'after'}<span class="note">{t('bga.after')}</span>{:else if !bga}<span
          class="note">{t('bga.noBga')}</span
        >{/if}
    </div>
    {#if videoError}<p class="hint" data-testid="bga-video-error">{videoError}</p>{/if}
    <div class="transport">
      <button class="ez-btn" data-testid="bga-play" disabled={!slot} onclick={() => void toggle()}
        >{t(app.view.playing ? 'bga.stop' : 'bga.play')}</button
      >
      <input
        type="range"
        aria-label={t('bga.position')}
        data-testid="bga-scrub"
        min="0"
        max={Math.max(1000, Math.ceil(endMs))}
        step="10"
        bind:value={scrub}
      />
      <span class="n">{clock(scrub)}</span>
    </div>
  </div>
</section>

<style>
  .bga {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
    max-width: 1200px;
  }
  .side {
    display: grid;
    gap: 10px;
    padding: 0;
  }
  .side select {
    width: 100%;
  }
  .facts dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 3px 12px;
    margin: 0;
    font-size: 12.5px;
  }
  dt {
    color: var(--ink-dim);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .verdict {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--ok, #6fe3a0);
  }
  .verdict.bad,
  .err {
    color: var(--err);
    font-size: 12.5px;
  }
  .warn,
  .hint,
  .err {
    margin: 0;
  }
  .start {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .start input {
    width: 120px;
  }
  .starts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .n {
    font-family: var(--font-num);
    font-size: 12px;
    color: var(--ink-dim);
  }
  .stage {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .stage .hint {
    font-size: 12px;
    color: var(--ink-dim);
  }
  .screen {
    position: relative;
    aspect-ratio: 4 / 3;
    background: #000;
    border-radius: 8px;
    border: 1px solid rgba(88, 225, 255, 0.16);
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    /* Stretched, as EZ2PORT draws it: a 16:9 movie is squeezed, not letterboxed. */
    object-fit: fill;
  }
  video.hidden {
    visibility: hidden;
  }
  .note {
    position: relative;
    font-size: 12px;
    color: var(--ink-faint);
  }
  .transport {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .transport input {
    flex: 1;
  }
  @media (max-width: 900px) {
    .bga {
      grid-template-columns: 1fr;
    }
  }
</style>
