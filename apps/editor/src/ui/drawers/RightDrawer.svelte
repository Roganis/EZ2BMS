<script lang="ts">
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';
  import type { RightDrawer } from '../../state/view.svelte';
  import Drawer from './Drawer.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const TABS: { id: RightDrawer; label: string }[] = [
    { id: 'inspector', label: 'Notes' },
    { id: 'chart', label: 'Chart' },
    { id: 'timing', label: 'Timing' },
  ];
</script>

<Drawer side="right" width={300} onclose={() => (app.view.right = null)}>
  {#snippet tabs()}
    <nav class="tabs">
      {#each TABS as t (t.id)}
        <button class:on={app.view.right === t.id} onclick={() => (app.view.right = t.id)}
          >{t.label}</button
        >
      {/each}
    </nav>
  {/snippet}
  <div class="pad">
    {#if app.view.right === 'inspector'}
      <p class="dim">
        {slot.doc.selection.ids.size
          ? `${slot.doc.selection.ids.size} selected`
          : 'Select notes to edit them here.'}
      </p>
    {:else if app.view.right === 'chart'}
      <p class="dim">{slot.label} · level {slot.level}</p>
    {:else}
      <p class="dim">Initial BPM {slot.doc.data.info.initBpm}</p>
    {/if}
  </div>
</Drawer>

<style>
  .tabs {
    display: flex;
    gap: 2px;
  }
  .tabs button {
    all: unset;
    cursor: pointer;
    padding: 6px 10px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border-bottom: 2px solid transparent;
  }
  .tabs button.on {
    color: var(--ink);
    border-color: var(--neon);
  }
  .pad {
    padding: 12px;
  }
  .dim {
    color: var(--ink-dim);
    font-size: 13px;
  }
</style>
