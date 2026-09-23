<script lang="ts">
  // One piece of song art - the disc or the eyecatch - cut from an image in
  // the song folder. Left, the image under the crop frame: drag it to move,
  // its corner to resize, the wheel to zoom, arrow keys to nudge (Shift for
  // 10 px). Right, the cut itself, made by the host exactly as it goes into
  // the package: the disc spinning at the wheel's 176 px (its black corners
  // are the game's transparent key), the eyecatch with the part the
  // song-select screen shows marked.
  import {
    DISC_SIZE,
    EYECATCH_H,
    EYECATCH_W,
    VISIBLE_H,
    VISIBLE_W,
    centreSquare,
    centredVisible,
    defaultEyecatch,
    eyecatchExtent,
    type ArtCrop,
    type ArtJob,
  } from '@ez2bms/chart-core';
  import { joinPath, type ArtPixels } from '../../bridge';
  import { app } from '../../state/app.svelte';
  import { imageSize, imageUrl, type ArtKind } from '../../state/art.svelte';
  import type { Project } from '../../state/project.svelte';

  let { project, kind }: { project: Project; kind: ArtKind } = $props();

  const disc = $derived(kind === 'disc');
  // Chart info is not reactive itself; each chart's revision says it changed.
  const source = $derived.by(() => {
    for (const c of project.charts) void c.rev;
    return project.art[kind];
  });
  const setting = $derived(project.sidecar[kind]);
  // `source` is a new object whenever the song file changes; effects follow
  // these values instead, so a crop does not reload the image.
  const srcPath = $derived(source?.path);

  // ---- the image
  let img = $state<{ path: string; url: string; w: number; h: number } | null>(null);
  let loadError = $state('');
  $effect(() => {
    const path = srcPath;
    img = null;
    loadError = '';
    if (!path) return;
    let url = '';
    let gone = false;
    void app.backend
      .readFile(joinPath(project.dir, path))
      .then(async (bytes) => {
        const size = await imageSize(bytes);
        if (gone) return;
        url = imageUrl(bytes);
        img = { path, url, ...size };
      })
      .catch((e: unknown) => {
        if (!gone) loadError = e instanceof Error ? e.message : String(e);
      });
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  // ---- the crop: the song file's, or the one being dragged
  let live = $state<ArtCrop | null>(null);
  const stretch = $derived(source?.job.kind === 'eyecatch' && source.job.mode === 'stretch');
  const stored = $derived.by((): ArtCrop | null => {
    const j = source?.job;
    if (!img || !j) return null;
    if (j.kind === 'disc') return j.crop ?? centreSquare(img.w, img.h);
    return j.kind === 'eyecatch' && j.mode === 'visible' ? j.crop : null;
  });
  const crop = $derived(live ?? stored);

  // ---- stage geometry: the image with a margin round it, fitted to the box
  const STAGE_H = 250;
  let stageW = $state(420);
  const view = $derived.by(() => {
    if (!img) return null;
    const pad = Math.round(Math.max(img.w, img.h) * 0.12);
    const s = Math.min(stageW / (img.w + 2 * pad), STAGE_H / (img.h + 2 * pad));
    return {
      s,
      ox: (stageW - img.w * s) / 2,
      oy: (STAGE_H - img.h * s) / 2,
    };
  });
  const box = (c: ArtCrop) =>
    view
      ? { x: c.x * view.s + view.ox, y: c.y * view.s + view.oy, w: c.w * view.s, h: c.h * view.s }
      : { x: 0, y: 0, w: 0, h: 0 };
  const frame = $derived(crop ? box(crop) : null);
  const extent = $derived(crop && !disc ? box(eyecatchExtent(crop)) : null);

  /** The crop's aspect kept, its size bounded, its centre over the image. */
  function fit(c: { cx: number; cy: number; w: number }): ArtCrop {
    const im = img!;
    const w = Math.round(Math.min(Math.max(c.w, 16), Math.max(im.w, im.h) * 1.25));
    const h = disc ? w : Math.max(1, Math.round((w * 3) / 4));
    const cx = Math.min(Math.max(c.cx, 0), im.w);
    const cy = Math.min(Math.max(c.cy, 0), im.h);
    return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
  }
  const centre = (c: ArtCrop) => ({ cx: c.x + c.w / 2, cy: c.y + c.h / 2, w: c.w });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Write the crop to the song file (after `delay` ms of quiet, for the wheel and keys). */
  function commit(c: ArtCrop, delay = 0) {
    clearTimeout(saveTimer);
    live = c;
    saveTimer = setTimeout(() => {
      const src = source?.src;
      if (!src || !img) return;
      const same = (a: ArtCrop, b: ArtCrop) =>
        a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
      const done = disc
        ? app.art.setDisc(same(c, centreSquare(img.w, img.h)) ? { src } : { src, crop: c })
        : app.art.setEyecatch({ src, mode: 'visible', crop: c });
      live = null;
      void done;
    }, delay);
  }

  // ---- pointer, wheel and keys
  let drag: { mode: 'move' | 'size'; x: number; y: number; start: ArtCrop; id: number } | undefined;
  function down(e: PointerEvent, mode: 'move' | 'size') {
    if (!crop || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { mode, x: e.clientX, y: e.clientY, start: crop, id: e.pointerId };
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id || !view) return;
    const dx = (e.clientX - drag.x) / view.s;
    const dy = (e.clientY - drag.y) / view.s;
    const s = drag.start;
    if (drag.mode === 'move') {
      live = fit({ cx: s.x + s.w / 2 + dx, cy: s.y + s.h / 2 + dy, w: s.w });
    } else {
      // The top-left corner stays; the frame follows the pointer, aspect kept.
      const w = Math.max(s.w + dx, disc ? s.h + dy : ((s.h + dy) * 4) / 3);
      const next = fit({ cx: s.x + w / 2, cy: s.y + (disc ? w : (w * 3) / 4) / 2, w });
      live = next;
    }
  }
  function up(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = undefined;
    if (live) commit(live);
  }
  function wheel(e: WheelEvent) {
    if (!crop || stretch) return;
    e.preventDefault();
    const c = centre(crop);
    commit(fit({ ...c, w: c.w * Math.exp(e.deltaY * 0.0015) }), 250);
  }
  function key(e: KeyboardEvent) {
    if (!crop) return;
    const step = e.shiftKey ? 10 : 1;
    const c = centre(crop);
    const k = e.key;
    if (k === 'ArrowLeft') c.cx -= step;
    else if (k === 'ArrowRight') c.cx += step;
    else if (k === 'ArrowUp') c.cy -= step;
    else if (k === 'ArrowDown') c.cy += step;
    else if (k === '+' || k === '=') c.w *= 1.05;
    else if (k === '-' || k === '_') c.w /= 1.05;
    else return;
    e.preventDefault();
    e.stopPropagation();
    commit(fit(c), 250);
  }

  // ---- the cut, from the host: the newest request wins, one at a time
  let canvas = $state<HTMLCanvasElement>();
  let cut = $state.raw<ArtPixels | null>(null);
  let cutError = $state('');
  const job = $derived.by((): ArtJob | null => {
    if (!source?.path) return null;
    if (live)
      return disc
        ? { kind: 'disc', crop: live }
        : { kind: 'eyecatch', mode: 'visible', crop: live };
    return source.job;
  });
  let queued: { path: string; job: ArtJob } | null = null;
  let running = false;
  async function pump() {
    running = true;
    while (queued) {
      const q = queued;
      queued = null;
      try {
        cut = await app.art.pixels(project, q.path, q.job);
        cutError = '';
      } catch (e) {
        cut = null;
        cutError = e instanceof Error ? e.message : String(e);
      }
    }
    running = false;
  }
  const jobKey = $derived(job ? JSON.stringify(job) : '');
  $effect(() => {
    const path = srcPath;
    void project.images; // a re-import under the same name is cut again
    if (!jobKey || !path) {
      cut = null;
      return;
    }
    queued = { path, job: JSON.parse(jobKey) as ArtJob };
    if (!running) void pump();
  });
  $effect(() => {
    const px = cut;
    const g = canvas?.getContext('2d');
    if (!px || !g || !canvas) return;
    canvas.width = px.w;
    canvas.height = px.h;
    const out = g.createImageData(px.w, px.h);
    for (let i = 0, n = px.w * px.h; i < n; i++) {
      out.data[i * 4] = px.rgb[i * 3]!;
      out.data[i * 4 + 1] = px.rgb[i * 3 + 1]!;
      out.data[i * 4 + 2] = px.rgb[i * 3 + 2]!;
      out.data[i * 4 + 3] = 255;
    }
    g.putImageData(out, 0, 0);
  });

  // ---- the source picker ("" is the charts' pick; no file is named NUL)
  const NONE = '\u0000none';
  const choice = $derived(setting === undefined ? '' : setting === null ? NONE : setting.src);
  async function pick(v: string) {
    live = null;
    if (v === '') await (disc ? app.art.setDisc(undefined) : app.art.setEyecatch(undefined));
    else if (v === NONE) await (disc ? app.art.setDisc(null) : app.art.setEyecatch(null));
    else await app.art.choose(kind, v);
  }
  async function importHere() {
    const names = await app.art.pickAndImport();
    if (names.length === 1) await app.art.choose(kind, names[0]!);
  }
  async function setMode(mode: 'visible' | 'stretch') {
    if (!source || !img || stretch === (mode === 'stretch')) return;
    await app.art.setEyecatch(
      mode === 'stretch'
        ? { src: source.src, mode }
        : { src: source.src, mode, crop: centredVisible(img.w, img.h) },
    );
  }
  /** A crop or framing other than the one a newly chosen image gets. */
  const resettable = $derived.by(() => {
    if (!img || !setting) return false;
    if (!('mode' in setting)) return setting.crop !== undefined;
    const d = defaultEyecatch(setting.src, img.w, img.h);
    const [a, b] = [d.crop, setting.crop];
    if (d.mode === 'stretch' && setting.mode === 'stretch') return false;
    return (
      d.mode !== setting.mode ||
      !a ||
      !b ||
      a.x !== b.x ||
      a.y !== b.y ||
      a.w !== b.w ||
      a.h !== b.h
    );
  });
  function reset() {
    if (!source || !img) return;
    live = null;
    void (disc
      ? app.art.setDisc({ src: source.src })
      : app.art.setEyecatch(defaultEyecatch(source.src, img.w, img.h)));
  }

  /** What is shown from the source, for the "upscaled" note. */
  const upscaled = $derived.by(() => {
    if (!img) return '';
    if (disc) return crop && crop.w < DISC_SIZE ? `${crop.w} px across` : '';
    if (stretch) return img.w < EYECATCH_W || img.h < EYECATCH_H ? `${img.w}x${img.h}` : '';
    return crop && crop.w < VISIBLE_W ? `${crop.w} px across` : '';
  });
  const circle = $derived(
    frame && disc
      ? (() => {
          // The port keys everything past radius 125 of 256.
          const r = (frame.w * 125) / DISC_SIZE;
          const cx = frame.x + frame.w / 2;
          const cy = frame.y + frame.h / 2;
          return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
        })()
      : '',
  );
  const hole = $derived(
    disc ? circle : frame ? `M${frame.x} ${frame.y}h${frame.w}v${frame.h}h${-frame.w}Z` : '',
  );
</script>

<section class="art" data-testid="art-{kind}" aria-label={disc ? 'Disc' : 'Eyecatch'}>
  <header>
    <h3>{disc ? 'Disc' : 'Eyecatch'}</h3>
    <span class="what">
      {disc
        ? `${DISC_SIZE}x${DISC_SIZE} - spins on the song wheel`
        : `${EYECATCH_W}x${EYECATCH_H} - fills the screen when the song is chosen`}
    </span>
    <div class="tools ez-form">
      <select
        data-testid="art-source"
        aria-label="{disc ? 'Disc' : 'Eyecatch'} image"
        value={choice}
        onchange={(e) => void pick(e.currentTarget.value)}
      >
        <option value="">Automatic - as EZ2PORT's importer</option>
        <option value={NONE}>None</option>
        {#each project.images as im (im)}
          <option value={im}>{im}</option>
        {/each}
        {#if setting && !project.images.includes(setting.src)}
          <option value={setting.src}>{setting.src} (missing)</option>
        {/if}
      </select>
    </div>
    <button class="ez-btn" data-testid="art-import" onclick={() => void importHere()}
      >Import…</button
    >
  </header>

  <div class="body">
    <div
      class="stage"
      data-testid="art-stage"
      bind:clientWidth={stageW}
      style:height="{STAGE_H}px"
      onwheel={wheel}
      role="presentation"
    >
      {#if img && view}
        <img
          src={img.url}
          alt=""
          draggable="false"
          style:left="{view.ox}px"
          style:top="{view.oy}px"
          style:width="{img.w * view.s}px"
          style:height="{img.h * view.s}px"
        />
        {#if frame}
          <svg class="veil" width={stageW} height={STAGE_H} aria-hidden="true">
            {#if extent}
              <!-- Stored in the file, but past the edge of the screen. -->
              <path
                class="beyond"
                fill-rule="evenodd"
                d="M{extent.x} {extent.y}h{extent.w}v{extent.h}h{-extent.w}Z {hole}"
              />
              <rect class="extent" x={extent.x} y={extent.y} width={extent.w} height={extent.h} />
            {/if}
            <path
              class="dim"
              fill-rule="evenodd"
              d="M0 0H{stageW}V{STAGE_H}H0Z {extent
                ? `M${extent.x} ${extent.y}h${extent.w}v${extent.h}h${-extent.w}Z`
                : hole}"
            />
            {#if disc}<path class="ring" d={circle} />{/if}
          </svg>
          <div
            class="frame"
            class:round={disc}
            data-testid="art-frame"
            tabindex="0"
            role="slider"
            aria-label="{disc
              ? 'Disc'
              : 'Eyecatch'} crop: drag to move, arrow keys to nudge, + and - to zoom"
            aria-valuenow={crop?.w ?? 0}
            style:left="{frame.x}px"
            style:top="{frame.y}px"
            style:width="{frame.w}px"
            style:height="{frame.h}px"
            onpointerdown={(e) => down(e, 'move')}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={up}
            onkeydown={key}
          >
            <span
              class="handle"
              role="presentation"
              onpointerdown={(e) => down(e, 'size')}
              onpointermove={move}
              onpointerup={up}
              onpointercancel={up}
            ></span>
          </div>
        {:else if stretch}
          <div
            class="whole"
            style:left="{view.ox}px"
            style:top="{view.oy}px"
            style:width="{img.w * view.s}px"
            style:height="{img.h * view.s}px"
          ></div>
        {/if}
      {:else if source && !source.path}
        <p class="empty err">{source.src} is not in the song folder.</p>
      {:else if loadError}
        <p class="empty err">{loadError}</p>
      {:else if !source}
        <p class="empty">
          {#if setting === null}
            No {kind}: turned off for this song.
          {:else if disc}
            No disc yet: the wheel shows a blank one. Choose an image above, or drop one here.
          {:else}
            No eyecatch yet. Choose an image above, or drop one here.
          {/if}
        </p>
      {/if}
    </div>

    <div class="result" class:wide={!disc}>
      {#if disc}
        <div class="rail">
          <canvas
            bind:this={canvas}
            class="disc"
            class:off={!cut}
            data-testid="art-preview"
            width={DISC_SIZE}
            height={DISC_SIZE}
          ></canvas>
        </div>
      {:else}
        <div class="screen">
          <canvas
            bind:this={canvas}
            class:off={!cut}
            data-testid="art-preview"
            width={EYECATCH_W}
            height={EYECATCH_H}
          ></canvas>
          <!-- The screen is 640x480 of it; the rest never shows. -->
          <div
            class="offscreen right"
            style:left="{(VISIBLE_W / EYECATCH_W) * 100}%"
            title="Past the right edge of the screen"
          ></div>
          <div
            class="offscreen bottom"
            style:top="{(VISIBLE_H / EYECATCH_H) * 100}%"
            style:width="{(VISIBLE_W / EYECATCH_W) * 100}%"
          ></div>
        </div>
      {/if}
      {#if cutError}<p class="err small">{cutError}</p>{/if}
    </div>
  </div>

  <footer>
    {#if source}
      <span class="from">
        {#if source.from === 'chart'}
          <span>From the charts' <code>{source.field}</code>, as EZ2PORT's importer picks it</span>
        {:else}
          <span>{source.src}</span>
        {/if}
        {#if img}<span class="dim">{img.w}x{img.h}</span>{/if}
      </span>
      {#if upscaled}
        <span class="warn">Upscaled from {upscaled}: it will look soft</span>
      {/if}
      <span class="spacer"></span>
      {#if !disc && img}
        <div class="ez-seg mode" role="group" aria-label="Eyecatch framing">
          <button
            class:on={!stretch}
            data-testid="art-mode-visible"
            title="Your 4:3 crop fills the screen; the image carries on past its edges"
            onclick={() => void setMode('visible')}>Screen 4:3</button
          >
          <button
            class:on={stretch}
            data-testid="art-mode-stretch"
            title="The whole image squeezed to 1024x512, as EZ2PORT's importer does"
            onclick={() => void setMode('stretch')}>Whole image</button
          >
        </div>
      {/if}
      {#if resettable}
        <button class="ez-btn" data-testid="art-reset" onclick={reset}>Reset</button>
      {/if}
    {/if}
  </footer>
</section>

<style>
  .art {
    container-type: inline-size;
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: var(--radius);
    border: 1px solid rgba(88, 225, 255, 0.12);
    background: rgba(11, 14, 23, 0.7);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--neon);
  }
  .what {
    font-size: 11.5px;
    color: var(--ink-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .tools {
    margin-left: auto;
    padding: 0;
    width: min(260px, 40%);
    flex: none;
  }
  .tools select {
    padding: 4px 6px;
    font-size: 12px;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background:
      repeating-conic-gradient(#0a0c14 0 25%, #0d101a 0 50%) 0 0 / 16px 16px,
      #0a0c14;
    touch-action: none;
    user-select: none;
  }
  .stage img {
    position: absolute;
    image-rendering: auto;
    pointer-events: none;
  }
  .veil {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .veil .dim {
    fill: rgba(3, 4, 8, 0.72);
  }
  .veil .beyond {
    fill: rgba(3, 4, 8, 0.42);
  }
  .veil .extent {
    fill: none;
    stroke: rgba(88, 225, 255, 0.45);
    stroke-dasharray: 4 4;
  }
  .veil .ring {
    fill: none;
    stroke: var(--neon);
    stroke-width: 1.5;
    filter: drop-shadow(0 0 4px rgba(88, 225, 255, 0.7));
  }
  .frame {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgba(88, 225, 255, 0.55);
    cursor: move;
    outline: none;
  }
  .frame:not(.round) {
    border: 1.5px solid var(--neon);
    box-shadow: 0 0 8px rgba(88, 225, 255, 0.45);
  }
  .frame:focus-visible {
    box-shadow: 0 0 0 2px rgba(255, 79, 216, 0.6);
  }
  .handle {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--neon);
    box-shadow: var(--glow);
    cursor: nwse-resize;
  }
  .whole {
    position: absolute;
    box-sizing: border-box;
    border: 1.5px solid var(--neon);
    box-shadow: 0 0 8px rgba(88, 225, 255, 0.45);
    pointer-events: none;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 24px;
    text-align: center;
    font-size: 12.5px;
    color: var(--ink-dim);
  }
  .err {
    color: var(--err);
  }
  .small {
    margin: 4px 0 0;
    font-size: 11px;
    max-width: 320px;
  }
  .result {
    display: grid;
    justify-items: center;
  }
  .rail {
    display: grid;
    place-items: center;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, #10162a 0 60%, #05060a 72%);
    box-shadow: inset 0 0 30px rgba(88, 225, 255, 0.12);
  }
  canvas.disc {
    /* The wheel draws the disc at 176 px. */
    width: 176px;
    height: 176px;
    border-radius: 50%;
    animation: spin 5s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    canvas.disc {
      animation: none;
    }
  }
  canvas.off {
    opacity: 0.15;
  }
  .screen {
    position: relative;
    width: 320px;
    aspect-ratio: 2 / 1;
    background: #000;
    border-radius: 4px;
    overflow: hidden;
  }
  .screen canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .offscreen {
    position: absolute;
    background: repeating-linear-gradient(
      -45deg,
      rgba(3, 4, 8, 0.72) 0 6px,
      rgba(3, 4, 8, 0.55) 6px 12px
    );
  }
  .offscreen.right {
    top: 0;
    right: 0;
    bottom: 0;
  }
  .offscreen.bottom {
    left: 0;
    bottom: 0;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-height: 28px;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .from {
    display: flex;
    gap: 8px;
    align-items: baseline;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .from .dim {
    color: var(--ink-faint);
    font-family: var(--font-num);
    font-size: 11px;
  }
  .warn {
    color: var(--warn);
  }
  .spacer {
    flex: 1;
  }
  .mode {
    width: 200px;
  }
  /* Too narrow for the image and the cut side by side: one above the other. */
  @container (max-width: 620px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
