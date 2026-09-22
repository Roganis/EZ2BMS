<script lang="ts">
  import type { Project } from '../state/project.svelte';
  import { app } from '../state/app.svelte';
  import ChannelsDrawer from './drawers/ChannelsDrawer.svelte';
  import RightDrawer from './drawers/RightDrawer.svelte';
  import Playfield from './Playfield.svelte';
  import StatusBar from './StatusBar.svelte';
  import TopBar from './TopBar.svelte';

  let { project }: { project: Project } = $props();
  const slot = $derived(project.active);
</script>

<div class="editor" class:play={app.view.mode === 'play'} data-testid="editor">
  <TopBar {project} />
  <div class="body">
    {#if app.view.leftOpen && slot}
      <ChannelsDrawer {slot} />
    {/if}
    <div class="center">
      {#if slot}
        <Playfield {slot} />
      {:else}
        <div class="empty">This song has no charts yet.</div>
      {/if}
    </div>
    {#if app.view.right && slot}
      <RightDrawer {slot} />
    {/if}
  </div>
  <StatusBar {project} />
</div>

<style>
  .editor {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--bg-0);
  }
  .body {
    display: flex;
    min-height: 0;
  }
  .center {
    flex: 1;
    min-width: 0;
    position: relative;
  }
  .empty {
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--ink-dim);
  }
</style>
