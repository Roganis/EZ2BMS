<script lang="ts">
  // The song manager: everything about the song rather than one chart - its
  // info and category beside every chart in a mode x tier matrix, its title
  // plate, or its disc and eyecatch. It sits over the playfield like the
  // keysound workbench (one or the other).
  import { app } from '../../state/app.svelte';
  import type { Project } from '../../state/project.svelte';
  import ArtCropper from './ArtCropper.svelte';
  import Matrix from './Matrix.svelte';
  import MetaForm from './MetaForm.svelte';
  import PlateDesigner from './PlateDesigner.svelte';

  const TABS = [
    { id: 'charts', label: 'Charts' },
    { id: 'plate', label: 'Title plate' },
    { id: 'art', label: 'Disc & eyecatch' },
  ] as const;

  let { project }: { project: Project } = $props();

  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || app.view.paletteOpen || e.defaultPrevented) return;
    e.preventDefault();
    app.view.songManager = false;
  }
</script>

<svelte:window onkeydown={onkey} />

<section class="manager" data-testid="song-manager" aria-label="Song manager">
  <header>
    <h2>Song</h2>
    <span class="folder" title={project.dir}>{project.name}</span>
    <span class="count">{project.charts.length} chart{project.charts.length === 1 ? '' : 's'}</span>
    <nav class="tabs" aria-label="Song manager pages">
      {#each TABS as t (t.id)}
        <button
          class:on={app.view.songTab === t.id}
          data-testid="song-tab-{t.id}"
          aria-pressed={app.view.songTab === t.id}
          onclick={() => (app.view.songTab = t.id)}>{t.label}</button
        >
      {/each}
    </nav>
    <button class="x" title="Close (Esc)" onclick={() => (app.view.songManager = false)}>×</button>
  </header>
  <div class="body" class:full={app.view.songTab !== 'charts'}>
    {#if app.view.songTab === 'charts'}<MetaForm {project} />{/if}
    {#if app.view.songTab === 'plate'}
      <PlateDesigner {project} />
    {:else if app.view.songTab === 'art'}
      <div class="art">
        <ArtCropper {project} kind="disc" />
        <ArtCropper {project} kind="eyecatch" />
        <p class="hint">
          Cut here exactly as they are published (<code>disc.abm</code>,
          <code>eyecatch.abm</code>). Without a choice, the image a chart's bmson names is used, as
          EZ2PORT's own importer would. Drop images anywhere on this page to add them.
        </p>
      </div>
    {:else}
      <div class="charts">
        <h3>Charts</h3>
        <Matrix {project} />
        <p class="hint">
          Click a chart to open it, an empty cell to start one there. Charts are saved as
          <code>&lt;mode&gt;1p-{project.sidecar.key || 'key'}[-hd|-shd|-ex].bmson</code>, the way
          EZ2PORT names them.
        </p>
      </div>
    {/if}
  </div>
</section>

<style>
  .manager {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    grid-template-rows: auto 1fr;
    background: rgba(5, 6, 10, 0.97);
    animation: rise 180ms var(--ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(88, 225, 255, 0.12);
  }
  h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--neon);
  }
  .folder {
    font-weight: 600;
  }
  .count {
    font-size: 12px;
    color: var(--ink-dim);
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin-left: 12px;
    align-self: center;
  }
  .tabs button {
    all: unset;
    cursor: pointer;
    padding: 4px 10px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border-bottom: 2px solid transparent;
  }
  .tabs button:hover {
    color: var(--ink-dim);
  }
  .tabs button.on {
    color: var(--ink);
    border-color: var(--neon);
  }
  .body.full {
    grid-template-columns: minmax(0, 1fr);
  }
  .art {
    display: grid;
    gap: 14px;
    align-content: start;
    min-width: 0;
    max-width: 1100px;
  }
  .x {
    all: unset;
    cursor: pointer;
    margin-left: auto;
    font-size: 20px;
    line-height: 1;
    padding: 0 6px;
    color: var(--ink-dim);
  }
  .x:hover {
    color: var(--ink);
  }
  .body {
    display: grid;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    gap: 24px;
    padding: 16px;
    overflow: auto;
    min-height: 0;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .hint {
    font-size: 11.5px;
    color: var(--ink-faint);
  }
  @media (max-width: 900px) {
    .body {
      grid-template-columns: 1fr;
    }
  }
</style>
