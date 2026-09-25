<script lang="ts">
  // The canvas. Scroll to move through the chart, Ctrl+scroll to zoom.
  import { columnsFor, eraseNotes, laneForChannel, modeDef, placeNote } from '@ez2bms/chart-core';
  import { onMount } from 'svelte';
  import { errorText, i18n, t, tSaid } from '../i18n/i18n.svelte';
  import { PointerTool, type StripHooks, type ToolHost } from '../input/pointer';
  import { PlayfieldRenderer } from '../render/renderer';
  import { toast } from '../state/toasts.svelte';
  import { app } from '../state/app.svelte';
  import type { ChartSlot } from '../state/project.svelte';
  import { chartTiming } from '../state/timing';
  import Minimap from './Minimap.svelte';
  import PlayHud from './PlayHud.svelte';
  import RecordPanel from './RecordPanel.svelte';
  import ResultCard from './ResultCard.svelte';
  import RunLog from './RunLog.svelte';
  import StripPanel from './strip/StripPanel.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const v = app.view;
  let host: HTMLDivElement;
  let renderer: PlayfieldRenderer | undefined = $state();
  let failed = $state('');
  let lo = $state(0);
  let hi = $state(0);
  let fieldBox = $state({ left: 0, right: 0, judgeY: 0 });
  let ghost = $state<{ x: number; y: number; l: number } | null>(null);
  /** The game chart's records under the pointer (a grey tag in the gutter), described. */
  let keptTip = $state<{ x: number; y: number; lines: string[] } | null>(null);
  const classicOn = $derived(app.classic.on);
  let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const tool = new PointerTool();

  function host_(): ToolHost | undefined {
    if (!renderer || v.mode !== 'edit') return undefined;
    return {
      renderer,
      doc: slot.doc,
      columns,
      tool: v.tool,
      snap: v.snap,
      brush: v.brush,
      setBrush: (ch) => (v.brush = ch),
      setGhost: (g) => {
        // Classic mode works out what the note would key as the pointer moves.
        if (g && classicOn) app.classic.hover(slot.doc, g.x, g.y, g.l);
        ghost = g;
      },
      setMarquee: (m) => (marquee = m),
      pan: (d) => (v.cursor = Math.max(0, v.cursor + d)),
      say: (m) => toast(m, 'warn'),
      audition: (ch) => {
        const name = slot.doc.channel(ch)?.name;
        if (name && !v.playing) void app.audio.audition(name);
      },
      ...(renderer.currentLayout?.strips.length ? { strips: stripHooks(renderer) } : {}),
      ...(classicOn
        ? {
            classic: {
              snap: (p, within) => app.classic.snap(slot.doc, p, within),
              place: (x, y, l) => {
                if (app.classic.key(slot.doc, x, y, l)) {
                  const name = slot.doc.channel(v.brush ?? -1)?.name;
                  if (name && !v.playing) void app.audio.audition(name);
                }
              },
              right: (note, y) => app.classic.right(slot.doc, note, y),
              canMove: (t) => app.classic.canMove(slot.doc, t),
            },
          }
        : {}),
    };
  }

  /** Slicing in the stem strips (chart-core slice/ops.ts through app.strips). */
  function stripHooks(r: PlayfieldRenderer): StripHooks {
    const d = slot.doc;
    const srcOf = (i: number) => stripSpecs[i]?.src;
    return {
      at: (px) => r.stripAt(px),
      focused: () => {
        const src = app.strips.focused(d);
        const i = stripSpecs.findIndex((x) => x.src === src);
        return i < 0 ? undefined : i;
      },
      sliceAt: (i, py) => r.stripSliceAt(i, py),
      onsetNear: (i, p, within) => {
        const src = srcOf(i);
        return src === undefined ? undefined : app.strips.onsetNear(d, src, p, within);
      },
      split: (i, y) => {
        const src = srcOf(i);
        if (src !== undefined) app.strips.split(d, src, y);
      },
      heal: (id) => app.strips.heal(d, id),
      move: (id, y) => app.strips.move(d, id, y),
      key: (ids, x) => app.strips.key(d, ids, x),
      focus: (i) => {
        const src = srcOf(i);
        if (src !== undefined) app.strips.focus = src;
      },
      ghost: (g) => {
        const cur = app.strips.ghost;
        if (g?.strip !== cur?.strip || g?.y !== cur?.y) app.strips.ghost = g;
      },
      knife: (y) => app.strips.knife(d, y),
      onHeader: (i, py) => py < (r.stripBox(i)?.header ?? 0),
      openPanel: (i) => {
        const src = srcOf(i);
        if (src !== undefined) app.strips.panel = src;
      },
    };
  }

  // The open strip panel beside its strip - right of it when there is room,
  // else left - so the strip and what the panel suggests stay in sight.
  const PANEL_W = 270;
  const panel = $derived.by(() => {
    const src = app.strips.panel;
    const i = src === null ? -1 : stripSpecs.findIndex((x) => x.src === src);
    const b = i < 0 || !renderer ? undefined : renderer.stripBox(i);
    if (!b || !src || !fieldBox.right) return undefined;
    const width = host?.clientWidth ?? 0;
    const right = b.left + b.width + 8;
    const left = right + PANEL_W <= width - 4 ? right : Math.max(4, b.left - PANEL_W - 8);
    return { src, box: { left, top: b.header + 4 } };
  });

  // Touch: one finger is the tool, as the mouse; two scroll the chart and
  // pinch its zoom (the speed dial in Play), since a touchscreen has no
  // wheel. A second finger landing cancels whatever the first one began, and
  // nothing is drawn again until every finger is lifted.
  // Not state: nothing on screen reads the fingers.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const touches = new Map<number, { x: number; y: number }>();
  let gesture: { y: number; dist: number } | null = null;

  function twoFingers(): { y: number; dist: number } {
    const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { y: (a.y + b.y) / 2, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }

  /** True when the event belongs to a two-finger gesture (and is handled). */
  function touchDown(e: PointerEvent): boolean {
    if (e.pointerType !== 'touch') return false;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const h = host_();
      if (h && tool.busy) tool.cancel(h);
      ghost = null;
      marquee = null;
      gesture = twoFingers();
    }
    return gesture !== null;
  }

  function touchMove(e: PointerEvent): boolean {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return false;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return false;
    if (touches.size === 2 && renderer) {
      const g = twoFingers();
      // Fingers moving down pull the chart down: later measures come into view.
      v.cursor = Math.max(0, v.cursor + (g.y - gesture.y) / renderer.pxPerPulse);
      const f = g.dist / gesture.dist;
      if (v.mode === 'play') v.speed = Math.max(50, Math.min(999, Math.round(v.speed * f)));
      else v.zoom = Math.max(12, Math.min(1200, v.zoom * f));
      gesture = g;
    }
    return true;
  }

  function touchUp(e: PointerEvent): boolean {
    if (e.pointerType !== 'touch') return false;
    touches.delete(e.pointerId);
    if (!gesture) return false;
    if (touches.size === 0) gesture = null;
    return true;
  }

  function onDown(e: PointerEvent) {
    if (touchDown(e)) return;
    const h = host_();
    if (!h) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    tool.down(e, h);
  }

  function onUp(e: PointerEvent) {
    if (touchUp(e)) return;
    const h = host_();
    if (h) tool.up(e, h);
  }

  function onKeyCapture(e: KeyboardEvent) {
    // Play: Esc ends the run (the lane keys never get here: the input hub
    // takes them first).
    if (app.play.active && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      void app.play.stop(true);
      return;
    }
    // While drawing a note in Classic mode, Tab picks the next sound (it is
    // Edit/Play otherwise, which means nothing in the middle of a drag).
    if (e.key === 'Tab' && classicOn && tool.placing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      app.classic.cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Escape' && tool.busy) {
      const h = host_();
      if (h) tool.cancel(h);
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
  }

  /**
   * Step input: a press on the cabinet's keys - keyboard or controller,
   * through the input hub - toggles a note at the cursor on that key's lane.
   */
  function stepPress(ch: number) {
    const x = laneForChannel(ch);
    if (x === undefined || !columns.some((c) => c.x === x) || app.view.paletteOpen) return;
    const d = slot.doc;
    const step = (d.resolution * 4) / v.snap;
    const y = Math.max(0, Math.round(v.cursor / step) * step);
    const there = d.index.at(x, y);
    if (classicOn) {
      // Classic: the key un-keys what is there, or keys what is sounding.
      if (there.length)
        app.classic.unkey(
          d,
          there.map((n) => n.id),
        );
      else app.classic.key(d, x, y, 0);
      return;
    }
    if (there.length)
      eraseNotes(
        d,
        there.map((n) => n.id),
      );
    else if (v.brush === null) toast(t('field.pickSound'), 'warn');
    else if (placeNote(d, { x, y, ch: v.brush }) === undefined)
      toast(t('field.cantPlaceThere'), 'warn');
  }

  // Listening for step input only while it is on: otherwise the keys are the editor's.
  $effect(() => {
    if (!v.stepInput || v.mode !== 'edit') return;
    return app.input.attach({
      keys: 'plain',
      pads: true,
      edges: (edges) => {
        for (const e of edges) if (e.down) stepPress(e.channel);
      },
    });
  });

  const columns = $derived(columnsFor(modeDef(slot.mode), v.side));
  const stripSpecs = $derived.by(() => {
    void slot.rev;
    return v.mode === 'edit' ? app.strips.specs(slot.doc) : [];
  });
  /** Onset cuts to draw, on the strip whose panel shows them. */
  const suggested = $derived.by(() => {
    void slot.rev;
    void app.strips.rev;
    const src = app.strips.panel;
    if (!app.strips.suggest || src === null) return null;
    const strip = stripSpecs.findIndex((x) => x.src === src);
    if (strip < 0) return null;
    const step = (slot.doc.resolution * 4) / v.snap;
    const ys = app.strips.suggestions(slot.doc, src, step).map((x) => x.y);
    return { strip, ys };
  });
  const timing = $derived.by(() => {
    void slot.rev;
    return chartTiming(slot.doc);
  });

  onMount(() => {
    let alive = true;
    let ro: ResizeObserver | undefined;
    PlayfieldRenderer.create(host)
      .then((r) => {
        if (!alive) return r.destroy();
        renderer = r;
        // End-to-end tests aim clicks with the real geometry (?e2e only).
        if ('__ez2bms' in window)
          (window as unknown as { __ez2bmsField: unknown }).__ez2bmsField = r;
        r.onView = (a, b, l) => {
          if (a !== lo) lo = a;
          if (b !== hi) hi = b;
          if (
            l.field.left !== fieldBox.left ||
            l.field.right !== fieldBox.right ||
            l.judgeY !== fieldBox.judgeY
          ) {
            fieldBox = { left: l.field.left, right: l.field.right, judgeY: l.judgeY };
          }
        };
        ro = new ResizeObserver(() => r.resize(host.clientWidth, host.clientHeight));
        ro.observe(host);
      })
      .catch((e: unknown) => (failed = errorText(e)));
    window.addEventListener('keydown', onKeyCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyCapture, true);
      alive = false;
      ro?.disconnect();
      renderer?.destroy();
    };
  });

  // The game's own panel for this mode and side, when there is a game folder.
  $effect(() => {
    void app.skin.rev;
    void app.skin.show(app.settings.data.gameRoot, slot.mode, v.side, app.settings.data.gameSkin);
  });

  $effect(() => {
    // The words the renderer draws (a hold's `end`) are read as it draws.
    void i18n.locale;
    renderer?.set({
      doc: slot.doc,
      rev: slot.rev,
      columns,
      timing,
      mode: v.mode,
      pxPerBeat: v.designPxPerBeat,
      cursor: v.cursor,
      snap: v.snap,
      selection: slot.doc.selection.ids,
      hoverLane: v.hoverLane,
      ghost:
        ghost && classicOn
          ? {
              ...ghost,
              label: app.classic.label(slot.doc),
              bad: !app.classic.current || !!app.classic.current.bad,
            }
          : ghost,
      marquee,
      pressed: app.play.pressed,
      hidden: app.play.hidden,
      live: v.playing,
      skin: app.skin.current,
      classic: classicOn,
      classicHint: classicOn && ghost ? app.classic.hint : null,
      brush: v.brush,
      rackScroll: v.rackScroll,
      strips: stripSpecs,
      stripsRev: app.strips.rev,
      hoverSlice: app.strips.hover,
      stripGhost: app.strips.ghost,
      stripSuggest: suggested,
      take: app.recorder.active
        ? { notes: app.recorder.ghosts, states: app.recorder.review?.states ?? null }
        : null,
    });
  });

  /** The slice under the pointer: in a strip, or a stem's note on a lane. */
  function hoverSlice(e: PointerEvent): number | null {
    if (!renderer || v.mode !== 'edit') return null;
    const i = renderer.stripAt(e.offsetX);
    if (i !== undefined) return renderer.stripSliceAt(i, e.offsetY)?.slice.id ?? null;
    const n = renderer.noteAt(e.offsetX, e.offsetY)?.note;
    if (!n) return null;
    const name = slot.doc.channel(n.ch)?.name;
    return name !== undefined && app.strips.has(slot.doc, name) ? n.id : null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!renderer) return;
    // Shift+wheel over the rack scrolls it sideways (it can be wider than its share).
    if (e.shiftKey && renderer.overRack(e.offsetX)) {
      const d = (e.deltaX || e.deltaY) * (e.deltaMode === 1 ? 40 : 1);
      const scale = renderer.currentLayout?.scale ?? 1;
      v.rackScroll = Math.max(0, Math.min(renderer.rackMaxScroll, v.rackScroll + d / scale));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.0015);
      if (v.mode === 'play')
        v.speed = Math.max(50, Math.min(999, Math.round((v.speed * f) / 5) * 5));
      else v.zoom = Math.max(12, Math.min(1200, v.zoom * f));
      return;
    }
    const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    v.cursor = Math.max(0, v.cursor - px / renderer.pxPerPulse);
  }

  function onMove(e: PointerEvent) {
    if (touchMove(e)) return;
    v.hoverLane = renderer?.laneAt(e.offsetX)?.x ?? null;
    const kept = v.mode === 'edit' ? renderer?.keptAt(e.offsetX, e.offsetY) : undefined;
    keptTip = kept
      ? { x: e.offsetX, y: e.offsetY, lines: kept.map((k) => tSaid(k.longSaid)) }
      : null;
    app.strips.hoverOn(slot.doc, hoverSlice(e));
    const h = host_();
    if (h) tool.move(e, h);
  }

  function onLeave() {
    v.hoverLane = null;
    keptTip = null;
    app.strips.hoverOn(slot.doc, null);
    if (!tool.busy) app.strips.ghost = null;
    if (!tool.busy) ghost = null;
  }
</script>

<div class="wrap">
  <div
    class="field"
    class:select={v.tool === 'select'}
    class:knife={v.tool === 'knife'}
    id="playfield"
    bind:this={host}
    onwheel={onWheel}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={(e) => {
      if (touchUp(e)) return;
      const h = host_();
      if (h) tool.cancel(h);
    }}
    onpointerleave={onLeave}
    oncontextmenu={(e) => e.preventDefault()}
    data-testid="playfield"
    role="application"
    aria-label={t('field.label')}
  >
    {#if failed}<p class="fail">{t('field.noWebgl', { error: failed })}</p>{/if}
    {#if keptTip}
      <div
        class="tip"
        data-testid="kept-tip"
        style:left="{keptTip.x + 14}px"
        style:top="{keptTip.y + 12}px"
      >
        {#each keptTip.lines.slice(0, 8) as line, i (i)}<p>{line}</p>{/each}
        {#if keptTip.lines.length > 8}<p>
            {t('field.keptMore', { n: keptTip.lines.length - 8 })}
          </p>{/if}
      </div>
    {/if}
  </div>
  {#if panel}
    <StripPanel {slot} src={panel.src} box={panel.box} />
  {/if}
  <Minimap {slot} {lo} {hi} />
  {#if app.play.hud && (app.play.active || v.mode === 'play')}
    <PlayHud hud={app.play.hud} box={fieldBox} active={!!app.play.active} />
  {/if}
  {#if app.recorder.active}
    <RecordPanel box={fieldBox} />
  {/if}
  {#if app.port.logOpen}
    <RunLog />
  {/if}
  {#if app.play.result}
    <ResultCard
      result={app.play.result}
      onretry={() => void app.play.start(app.play.result!.kind)}
      onclose={() => (app.play.result = null)}
    />
  {/if}
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
  }
  .field {
    position: absolute;
    inset: 0 28px 0 0;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }
  .field.select {
    cursor: default;
  }
  .field.knife {
    cursor: col-resize;
  }
  .field :global(canvas) {
    display: block;
  }
  .tip {
    position: absolute;
    z-index: 5;
    max-width: 340px;
    padding: 6px 8px;
    border: 1px solid var(--panel-edge);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 12px;
    pointer-events: none;
  }
  .tip p {
    margin: 0;
  }
  .tip p + p {
    margin-top: 4px;
  }
  .fail {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--err);
  }
</style>
