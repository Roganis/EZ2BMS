<script lang="ts">
  // The song as EZ2PORT's song select will show it: its disc at the focus,
  // turning a whole number of times as the tier changes; its title plate on
  // the rail between other songs' (or alone, repeated down the rail, as a
  // category holding only this song is); its preview looping once the wheel
  // has stood still for the game's dwell; and the eyecatch the screen exits
  // through. Placement and motion are the port's own arithmetic
  // (chart-core ez2data/selectwheel.ts); the masks are the user's game's
  // (skin/select.ts), neon stand-ins without them.
  import { modeDef, plateSpecFor, wheelWantsPreview, type Tier } from '@ez2bms/chart-core';
  import {
    NO_ART,
    SCREEN_H,
    SCREEN_W,
    WheelPainter,
    WheelScene,
    toPicture,
    type Picture,
    type WheelArt,
    type WheelEntry,
  } from '../../render/wheel';
  import { loadSelectArt, SELECT_FILES } from '../../skin/select';
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';

  let { project }: { project: Project } = $props();

  const TIERS: Tier[] = ['NM', 'HD', 'SHD', 'EX'];
  /** The select screen's tick: the port paces it at 60 Hz. */
  const TICK_MS = 1000 / 60;
  /** Made-up songs to stand either side of this one, in the shipped plates' colours. */
  const NEIGHBOURS = [
    { title: 'MIDNIGHT RUN', tint: 'white' },
    { title: 'AFTERGLOW', tint: 'green' },
    { title: 'VOLTAGE', tint: 'cyan' },
    { title: 'PRISM LINE', subtitle: 'EXTENDED MIX', tint: 'white' },
    { title: 'STARFALL', tint: 'orange-halo' },
    { title: 'SIDE B', tint: 'cyan-halo' },
    { title: 'HYPERDRIVE', tint: 'green' },
  ];

  // ---- the mode and tiers: the chart being edited decides the select screen
  const slot = $derived(project.active ?? project.charts[0]);
  const mode = $derived(slot?.mode);
  const tiers = $derived(new Set(project.charts.filter((c) => c.mode === mode).map((c) => c.tier)));
  // The tier being edited, until another is picked here.
  let tier = $derived<Tier>(slot?.tier ?? 'NM');

  // ---- what is drawn: this song, its neighbours, the game's art
  let plate = $state.raw<Picture | null>(null);
  let disc = $state.raw<Picture | null>(null);
  let eyecatch = $state.raw<Picture | null>(null);
  let plateError = $state('');
  const plateKey = $derived.by(() => {
    for (const c of project.charts) void c.rev;
    void project.images;
    return app.art.plateKey(project);
  });
  $effect(() => {
    void plateKey;
    let live = true;
    app.art
      .renderPlate(project)
      .then((px) => {
        if (!live) return;
        plate = toPicture(px.w, px.h, px.rgb, 3);
        plateError = '';
      })
      .catch((e: unknown) => {
        if (!live) return;
        plate = null;
        plateError = e instanceof Error ? e.message : String(e);
      });
    return () => (live = false);
  });
  const artOf = (kind: 'disc' | 'eyecatch') => {
    void project.images;
    const a = project.art[kind];
    return a?.path ? JSON.stringify({ path: a.path, job: a.job }) : '';
  };
  const discKey = $derived(artOf('disc'));
  const eyecatchKey = $derived(artOf('eyecatch'));
  function cut(key: string, set: (p: Picture | null) => void): () => void {
    let live = true;
    if (!key) set(null);
    else {
      const { path, job } = JSON.parse(key) as {
        path: string;
        job: Parameters<typeof app.art.pixels>[2];
      };
      app.art
        .pixels(project, path, job)
        .then((px) => live && set(toPicture(px.w, px.h, px.rgb, 3)))
        .catch(() => live && set(null));
    }
    return () => (live = false);
  }
  $effect(() => cut(discKey, (p) => (disc = p)));
  $effect(() => cut(eyecatchKey, (p) => (eyecatch = p)));

  let others = $state.raw<(Picture | null)[]>([]);
  $effect(() => {
    let live = true;
    void Promise.all(
      NEIGHBOURS.map((n) =>
        app.backend.media
          .plate(plateSpecFor({ tint: n.tint }, { title: n.title, subtitle: n.subtitle ?? '' }))
          .then((px) => toPicture(px.w, px.h, px.rgb, 3))
          .catch(() => null),
      ),
    ).then((pics) => live && (others = pics));
    return () => (live = false);
  });

  let art = $state.raw<WheelArt>(NO_ART);
  let missing = $state.raw<string[]>([]);
  let artLoading = $state(false);
  const root = $derived(app.settings.data.gameRoot);
  $effect(() => {
    void app.skin.rev;
    const r = root;
    let live = true;
    if (!r) {
      art = NO_ART;
      missing = [];
      return;
    }
    artLoading = true;
    void loadSelectArt(app.backend, r)
      .then((a) => {
        if (!live) return;
        const pic = (i: typeof a.discMask) => (i ? toPicture(i.width, i.height, i.rgba, 4) : null);
        art = {
          discMask: pic(a.discMask),
          shapeMask: pic(a.shapeMask),
          railStrip: pic(a.railStrip),
          stageMask: pic(a.stageMask),
          stagePlate: pic(a.stagePlate),
        };
        missing = a.missing;
      })
      .finally(() => live && (artLoading = false));
    return () => (live = false);
  });
  const artKind = $derived(
    !root
      ? 'neon'
      : missing.length === Object.keys(SELECT_FILES).length
        ? 'neon'
        : missing.length
          ? 'partial'
          : 'game',
  );

  // ---- the scene, ticked at 60 Hz
  let alone = $state(false);
  let view = $state<'wheel' | 'eyecatch'>('wheel');
  let sound = $state(true);
  const entries = $derived<WheelEntry[]>([
    { plate, disc, thumb: null },
    ...(alone ? [] : others.map((p) => ({ plate: p, disc: null, thumb: null }))),
  ]);
  const count = $derived(entries.length);

  let canvas = $state<HTMLCanvasElement>();
  let input = { down: false, up: false };
  let level = 0;
  /** The entry whose preview has been asked for (the port's prev_for). */
  let prevFor = -1;
  /** Whether the loop running is ours to stop. */
  let previewing = false;

  // A new ring when the song count changes (alone or among others): the
  // screen is entered afresh, the cursor on this song.
  let scene = new WheelScene(1);
  $effect.pre(() => {
    const t = scene.tier;
    scene = new WheelScene(count, 0);
    scene.tier = t;
    prevFor = -1;
  });
  $effect(() => {
    scene.setTier(tier);
  });

  function stopPreview() {
    if (previewing) app.preview.stop();
    previewing = false;
  }

  function tick() {
    const stepped = input.down || input.up;
    scene.tick(input.down, input.up, (i) => !!entries[i]?.disc);
    input = { down: false, up: false };
    // A step silences the preview at once; the dwell brings the next one.
    if (stepped) stopPreview();
    const w = scene.wheel;
    if (wheelWantsPreview(w) && prevFor !== w.cursor) {
      prevFor = w.cursor;
      stopPreview();
      // Only this song has a preview; its neighbours are made up.
      if (w.cursor === 0 && sound) {
        previewing = true;
        // A step while the sounds load stops it as soon as it starts.
        void app.preview.play(project).then(
          () => !previewing && app.preview.stop(),
          () => (previewing = false),
        );
      }
    }
    if (view === 'eyecatch' && level < 255) level = level + 10 > 0xfe ? 0xff : level + 10;
  }

  $effect(() => {
    const c = canvas;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const painter = new WheelPainter();
    // End-to-end tests read each frame's drawing time (?e2e only).
    const hook: { drawTimes: number[] } | undefined =
      '__ez2bms' in window ? { drawTimes: [] } : undefined;
    if (hook) (window as unknown as { __ez2bmsWheel: typeof hook }).__ez2bmsWheel = hook;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      acc += Math.min(now - last, 250);
      last = now;
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        tick();
      }
      const t0 = performance.now();
      if (view === 'eyecatch') painter.drawEyecatch(g, eyecatch, art, level);
      else painter.drawWheel(g, scene, entries, art);
      if (hook) {
        hook.drawTimes.push(performance.now() - t0);
        if (hook.drawTimes.length > 600) hook.drawTimes.shift();
      }
      c.dataset.angle = String(Math.round(scene.angle));
      c.dataset.cursor = String(scene.wheel.cursor);
      c.dataset.focus = String(
        scene.focused(scene.wheel.cursor, !!entries[scene.wheel.cursor]?.disc),
      );
      c.dataset.level = String(level);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
  $effect(() => () => stopPreview());

  function move(dir: 1 | -1) {
    if (dir > 0) input.down = true;
    else input.up = true;
  }
  function pickTier(t: Tier) {
    if (tiers.has(t)) tier = t;
  }
  function setView(v: 'wheel' | 'eyecatch') {
    view = v;
    level = 0;
  }
  function toggleSound() {
    sound = !sound;
    if (!sound) stopPreview();
    // Back on: the song under the cursor previews again after the dwell.
    else prevFor = -1;
  }
  function onkey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') move(-1);
    else if (k >= '1' && k <= '4') pickTier(TIERS[Number(k) - 1]!);
    else if (k === 'e' || k === 'E') setView(view === 'eyecatch' ? 'wheel' : 'eyecatch');
    else return;
    e.preventDefault();
  }
</script>

<section class="wheel" data-testid="wheel-preview" aria-label="Song select preview">
  <!-- The screen takes the wheel's keys, as the cabinet's panel would. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="screen" tabindex="0" role="application" aria-label="Song select" onkeydown={onkey}>
    <canvas
      bind:this={canvas}
      data-testid="wheel-canvas"
      data-art={artKind}
      data-view={view}
      width={SCREEN_W}
      height={SCREEN_H}
    ></canvas>
  </div>

  <div class="side ez-form">
    <div class="ez-seg" role="group" aria-label="Screen">
      <button
        class:on={view === 'wheel'}
        data-testid="wheel-view-wheel"
        onclick={() => setView('wheel')}>Song select</button
      >
      <button
        class:on={view === 'eyecatch'}
        data-testid="wheel-view-eyecatch"
        onclick={() => setView('eyecatch')}>Eyecatch</button
      >
    </div>

    {#if view === 'wheel'}
      <div class="row">
        <span class="lbl">{mode ? modeDef(mode).portName : 'No chart'} · tier</span>
        <div class="ez-seg" role="group" aria-label="Tier">
          {#each TIERS as t, i (t)}
            <button
              class:on={tier === t}
              data-testid="wheel-tier-{t}"
              disabled={!tiers.has(t)}
              title={tiers.has(t) ? `${t} (${i + 1})` : `No ${t} chart in this mode`}
              onclick={() => pickTier(t)}>{t}</button
            >
          {/each}
        </div>
      </div>
      <div class="move">
        <button class="ez-btn" data-testid="wheel-up" onclick={() => move(-1)}>▲ Previous</button>
        <button class="ez-btn" data-testid="wheel-down" onclick={() => move(1)}>Next ▼</button>
      </div>
      <label class="check">
        <input type="checkbox" data-testid="wheel-alone" bind:checked={alone} />
        Alone in its category (the rail repeats it)
      </label>
      <label class="check">
        <input type="checkbox" data-testid="wheel-sound" checked={sound} onchange={toggleSound} />
        Play the preview when the wheel stops
      </label>
    {:else}
      <button class="ez-btn" data-testid="wheel-replay" onclick={() => (level = 0)}
        >Replay the fade</button
      >
      <p class="hint">
        The song select's exit: the eyecatch at its own size from the top left - a 1024x512 picture
        shows its top-left 640x480 - under the stage mask and plate, faded in from black.
        {#if !eyecatch}<b>This song has no eyecatch</b>: the screen stays black under the plate.{/if}
      </p>
    {/if}

    <p class="hint">
      Click the screen, then <kbd>↑</kbd><kbd>↓</kbd> to turn the wheel, <kbd>1</kbd>–<kbd>4</kbd>
      for the tier, <kbd>E</kbd> for the eyecatch. The preview starts after the wheel stands still for
      half a second, as the game waits.
    </p>
    <p class="hint" data-testid="wheel-art">
      {#if !root}
        Neon stand-ins: set your game folder (the Port drawer) to see your song select's own masks.
      {:else if artLoading}
        Reading your game's song select art…
      {:else if artKind === 'game'}
        Drawn with your game's song select masks.
      {:else}
        Your game folder has no <code>{missing.join(', ')}</code>: neon stand-ins take their place.
      {/if}
      The animated backdrop and frame are not drawn yet.
    </p>
    {#if !disc}
      <p class="warn" data-testid="wheel-no-disc">
        No disc: EZ2PORT shows the masks alone at the focus.
      </p>
    {/if}
    {#if plateError}<p class="warn">The title plate: {plateError}</p>{/if}
    <p class="hint">
      While it flies along the arc a package's disc shows no picture: EZ2PORT looks for that
      thumbnail in the game's <code>system\discsmall</code>, never in the package.
    </p>
  </div>
</section>

<style>
  .wheel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 18px;
    align-items: start;
    max-width: 1240px;
  }
  .screen {
    border-radius: 8px;
    border: 1px solid rgba(88, 225, 255, 0.16);
    overflow: hidden;
    background: #000;
    outline: none;
    line-height: 0;
  }
  .screen:focus-visible {
    box-shadow: 0 0 0 2px rgba(255, 79, 216, 0.6);
  }
  canvas {
    width: 100%;
    aspect-ratio: 4 / 3;
  }
  .side {
    display: grid;
    gap: 12px;
    padding: 0;
  }
  .move {
    display: flex;
    gap: 8px;
  }
  .move .ez-btn {
    flex: 1;
  }
  .ez-seg button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .hint {
    margin: 0;
  }
  .warn {
    margin: 0;
  }
  @media (max-width: 900px) {
    .wheel {
      grid-template-columns: 1fr;
    }
  }
</style>
