<script lang="ts">
  // Files dragged onto the window: a full-window target while they are over
  // it, an import when they land - images while the song manager shows the
  // art, sounds everywhere else. The backend says what is being dragged - in
  // the desktop app that is Tauri's own event, which sees OS drops before the
  // page does; in a browser, the DOM's.
  import { app } from '../state/app.svelte';
  import type { Project } from '../state/project.svelte';

  let { project }: { project: Project } = $props();
  let over = $state(false);
  const added = $derived(app.slot ? ` and added to ${app.slot.label}` : '');
  const images = $derived(app.view.songManager && app.view.songTab !== 'charts');

  $effect(() =>
    app.backend.onFileDrop((d) => {
      over = d.kind === 'over';
      if (d.kind !== 'drop' || !d.paths.length) return;
      if (images) void app.art.import(d.paths);
      else void app.sounds.import(d.paths);
    }),
  );
</script>

{#if over}
  <div class="drop" data-testid="drop-zone">
    <div class="card">
      <b>Drop to import</b>
      <span>
        {#if images}
          Images (PNG, JPEG, BMP) are copied into <em>{project.name}</em> for the disc and the eyecatch.
          Nothing in the folder is overwritten.
        {:else}
          Sound files, or folders of them, are copied into <em>{project.name}</em>{added}. Nothing
          in the folder is overwritten.
        {/if}
      </span>
    </div>
  </div>
{/if}

<style>
  .drop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    pointer-events: none;
    background: rgba(5, 6, 10, 0.72);
    outline: 2px dashed var(--neon);
    outline-offset: -14px;
    animation: in 120ms var(--ease-out);
  }
  @keyframes in {
    from {
      opacity: 0;
    }
  }
  .card {
    display: grid;
    gap: 6px;
    max-width: 420px;
    padding: 18px 22px;
    border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    box-shadow: var(--glow);
    text-align: center;
  }
  b {
    font-size: 15px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--neon);
  }
  span {
    font-size: 13px;
    color: var(--ink-dim);
  }
  em {
    font-style: normal;
    color: var(--ink);
  }
</style>
