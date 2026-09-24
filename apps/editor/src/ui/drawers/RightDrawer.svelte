<script lang="ts">
  import { t } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import type { ChartSlot } from '../../state/project.svelte';
  import type { RightDrawer } from '../../state/view.svelte';
  import ChartInfo from './ChartInfo.svelte';
  import Drawer from './Drawer.svelte';
  import Inspector from './Inspector.svelte';
  import Issues from './Issues.svelte';
  import PortPanel from './PortPanel.svelte';
  import TimingPanel from './TimingPanel.svelte';

  let { slot }: { slot: ChartSlot } = $props();
  const TABS: RightDrawer[] = ['inspector', 'chart', 'timing', 'issues', 'port'];
</script>

<Drawer side="right" width={320} onclose={() => (app.view.right = null)}>
  {#snippet tabs()}
    <nav class="tabs">
      {#each TABS as id (id)}
        <button class:on={app.view.right === id} onclick={() => (app.view.right = id)}
          >{t(`drawer.tab.${id}`)}</button
        >
      {/each}
    </nav>
  {/snippet}
  {#if app.view.right === 'inspector'}
    <Inspector {slot} />
  {:else if app.view.right === 'chart'}
    <ChartInfo {slot} />
  {:else if app.view.right === 'timing'}
    <TimingPanel {slot} />
  {:else if app.view.right === 'issues'}
    <Issues />
  {:else}
    <PortPanel />
  {/if}
</Drawer>

<style>
  .tabs {
    display: flex;
    gap: 1px;
    /* Five tabs and the close button in 320 px: the tabs give way, never the ×. */
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    all: unset;
    cursor: pointer;
    flex: none;
    padding: 6px 5px;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border-bottom: 2px solid transparent;
  }
  .tabs button.on {
    color: var(--ink);
    border-color: var(--neon);
  }
</style>
