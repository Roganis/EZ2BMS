<script lang="ts">
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';
  import type { RightDrawer } from '../../state/view.svelte';
  import ChartInfo from './ChartInfo.svelte';
  import Drawer from './Drawer.svelte';
  import Inspector from './Inspector.svelte';
  import TimingPanel from './TimingPanel.svelte';

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
  {#if app.view.right === 'inspector'}
    <Inspector {slot} />
  {:else if app.view.right === 'chart'}
    <ChartInfo {slot} />
  {:else}
    <TimingPanel {slot} />
  {/if}
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
</style>
