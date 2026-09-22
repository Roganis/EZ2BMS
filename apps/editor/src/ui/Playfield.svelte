<script lang="ts">
  // The canvas. Scroll to move through the chart, Ctrl+scroll to zoom.
  import { columnsFor, eraseNotes, modeDef, placeNote } from '@ez2bms/chart-core';
  import { onMount } from 'svelte';
  import { laneForKey } from '../input/lanekeys';
  import { PointerTool, type ToolHost } from '../input/pointer';
  import { PlayfieldRenderer } from '../render/renderer';
  import { toast } from '../state/toasts.svelte';
  import { app } from '../state/app.svelte';
  import type { ChartSlot } from '../state/project.svelte';
  import { chartTiming } from '../state/timing';
  import Minimap from './Minimap.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const v = app.view;
  let host: HTMLDivElement;
  let renderer: PlayfieldRenderer | undefined = $state();
  let failed = $state('');
  let lo = $state(0);
  let hi = $state(0);
  let ghost = $state<{ x: number; y: number; l: number } | null>(null);
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
      setGhost: (g) => (ghost = g),
      setMarquee: (m) => (marquee = m),
      pan: (d) => (v.cursor = Math.max(0, v.cursor + d)),
      say: (m) => toast(m, 'warn'),
    };
  }

  function onDown(e: PointerEvent) {
    const h = host_();
    if (!h) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    tool.down(e, h);
  }

  function onUp(e: PointerEvent) {
    const h = host_();
    if (h) tool.up(e, h);
  }

  function onKeyCapture(e: KeyboardEvent) {
    if (e.key === 'Escape' && tool.busy) {
      const h = host_();
      if (h) tool.cancel(h);
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    // Step input: the cabinet's keys toggle a note at the cursor.
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (
      !v.stepInput ||
      v.mode !== 'edit' ||
      typing ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      app.view.paletteOpen
    )
      return;
    const x = laneForKey(e.code, new Set(columns.map((c) => c.x)));
    if (x === undefined) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const d = slot.doc;
    const step = (d.resolution * 4) / v.snap;
    const y = Math.max(0, Math.round(v.cursor / step) * step);
    const there = d.index.at(x, y);
    if (there.length)
      eraseNotes(
        d,
        there.map((n) => n.id),
      );
    else if (v.brush === null) toast('Pick a sound to draw with first', 'warn');
    else if (placeNote(d, { x, y, ch: v.brush }) === undefined)
      toast("Can't place a note there", 'warn');
  }

  const columns = $derived(columnsFor(modeDef(slot.mode), v.side));
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
        r.onView = (a, b) => {
          if (a !== lo) lo = a;
          if (b !== hi) hi = b;
        };
        ro = new ResizeObserver(() => r.resize(host.clientWidth, host.clientHeight));
        ro.observe(host);
      })
      .catch((e: unknown) => (failed = e instanceof Error ? e.message : String(e)));
    window.addEventListener('keydown', onKeyCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyCapture, true);
      alive = false;
      ro?.disconnect();
      renderer?.destroy();
    };
  });

  $effect(() => {
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
      ghost,
      marquee,
      pressed: new Set(),
      live: v.playing,
    });
  });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!renderer) return;
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
    v.hoverLane = renderer?.laneAt(e.offsetX)?.x ?? null;
    const h = host_();
    if (h) tool.move(e, h);
  }

  function onLeave() {
    v.hoverLane = null;
    if (!tool.busy) ghost = null;
  }
</script>

<div class="wrap">
  <div
    class="field"
    class:select={v.tool === 'select'}
    id="playfield"
    bind:this={host}
    onwheel={onWheel}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={() => {
      const h = host_();
      if (h) tool.cancel(h);
    }}
    onpointerleave={onLeave}
    oncontextmenu={(e) => e.preventDefault()}
    data-testid="playfield"
    role="application"
    aria-label="Playfield"
  >
    {#if failed}<p class="fail">The playfield needs WebGL: {failed}</p>{/if}
  </div>
  <Minimap {slot} {lo} {hi} />
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
  .field :global(canvas) {
    display: block;
  }
  .fail {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--err);
  }
</style>
