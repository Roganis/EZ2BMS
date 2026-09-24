<script lang="ts">
  import { t } from '../i18n/i18n.svelte';
  import type { Project } from '../state/project.svelte';
  import { app } from '../state/app.svelte';
  import ChannelsDrawer from './drawers/ChannelsDrawer.svelte';
  import DropZone from './DropZone.svelte';
  import RightDrawer from './drawers/RightDrawer.svelte';
  import Playfield from './Playfield.svelte';
  import StatusBar from './StatusBar.svelte';
  import TopBar from './TopBar.svelte';
  import Workbench from './workbench/Workbench.svelte';
  import SongManager from './song/SongManager.svelte';

  let { project }: { project: Project } = $props();
  const slot = $derived(project.active);

  // Keep the engine's copy of the chart current: recompiled a moment after
  // each edit (sooner while playing), with the same compiler as Publish.
  $effect(() => {
    if (!slot) return;
    void slot.rev;
    void app.audio.muteBgm;
    void app.audio.solo;
    app.audio.scheduleSync(slot);
  });
  // Unsaved work goes to the app's folder a few seconds after each edit.
  $effect(() => {
    for (const c of project.charts) void c.rev;
    if (project.dirty) app.autosave.schedule(project);
  });
  // The title plate is rendered again a moment after what it shows changes,
  // so lint knows of glyphs the fonts lack without the designer open.
  $effect(() => {
    for (const c of project.charts) void c.rev;
    void project.images;
    const key = app.art.plateKey(project);
    if (app.art.plateCheck?.key === key) return;
    const timer = setTimeout(() => void app.art.renderPlate(project).catch(() => undefined), 400);
    return () => clearTimeout(timer);
  });
  // New sounds in the chart get loaded.
  $effect(() => {
    if (!slot) return;
    void slot.rev;
    void app.audio.load(
      project,
      slot.doc.data.channels.map((c) => c.name),
    );
  });
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
        <div class="empty">
          <p>{t('field.noCharts')}</p>
          <button class="ez-btn" onclick={() => (app.view.newChartOpen = true)}
            >{t('field.newChart')} <kbd>Ctrl N</kbd></button
          >
        </div>
      {/if}
      {#if app.view.workbench}
        <Workbench {project} />
      {/if}
      {#if app.view.songManager}
        <SongManager {project} />
      {/if}
    </div>
    {#if app.view.right && slot}
      <RightDrawer {slot} />
    {/if}
  </div>
  <StatusBar {project} />
  <DropZone {project} />
</div>

<style>
  .editor {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    /* The window's width, whatever a bar's content would like. */
    grid-template-columns: minmax(0, 1fr);
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
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--ink-dim);
  }
</style>
