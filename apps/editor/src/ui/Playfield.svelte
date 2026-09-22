<script lang="ts">
  // The canvas. Scroll to move through the chart, Ctrl+scroll to zoom.
  import { columnsFor, modeDef } from '@ez2bms/chart-core';
  import { onMount } from 'svelte';
  import { PlayfieldRenderer } from '../render/renderer';
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
        r.onView = (a, b) => {
          if (a !== lo) lo = a;
          if (b !== hi) hi = b;
        };
        ro = new ResizeObserver(() => r.resize(host.clientWidth, host.clientHeight));
        ro.observe(host);
      })
      .catch((e: unknown) => (failed = e instanceof Error ? e.message : String(e)));
    return () => {
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
      ghost: null,
      marquee: null,
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
  }
</script>

<div class="wrap">
  <div
    class="field"
    id="playfield"
    bind:this={host}
    onwheel={onWheel}
    onpointermove={onMove}
    onpointerleave={() => (v.hoverLane = null)}
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
