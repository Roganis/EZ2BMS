<script lang="ts">
  // Files dragged onto the window: a full-window target while they are over
  // it, an import when they land - images while the song manager shows the
  // art, movies on its BGA page, sounds everywhere else. The backend says what is being dragged - in
  // the desktop app that is Tauri's own event, which sees OS drops before the
  // page does; in a browser, the DOM's.
  import { BMS_FILE } from '@ez2bms/chart-core';
  import { dirName } from '../bridge';
  import { t, tParts } from '../i18n/i18n.svelte';
  import { app } from '../state/app.svelte';
  import type { Project } from '../state/project.svelte';

  let { project }: { project: Project } = $props();
  let over = $state(false);
  const images = $derived(
    app.view.songManager && (app.view.songTab === 'plate' || app.view.songTab === 'art'),
  );
  const movies = $derived(app.view.songManager && app.view.songTab === 'bga');
  // What happens to what is dropped, with the song's name set in <em>.
  const says = $derived(
    tParts(
      images ? 'drop.images' : movies ? 'drop.movie' : app.slot ? 'drop.soundsTo' : 'drop.sounds',
      { song: project.name, chart: app.slot?.label ?? '' },
      ['song'],
    ),
  );

  $effect(() =>
    app.backend.onFileDrop((d) => {
      over = d.kind === 'over';
      if (d.kind !== 'drop' || !d.paths.length) return;
      // A BMS file is a song to import, not a sound.
      const bms = d.paths.find((p) => BMS_FILE.test(p));
      if (bms) {
        app.importer.show('bms');
        void app.importer.loadBms(dirName(bms));
      } else if (images) void app.art.import(d.paths);
      else if (movies) void app.bga.import(d.paths);
      else void app.sounds.import(d.paths);
    }),
  );
</script>

{#if over}
  <div class="drop" data-testid="drop-zone">
    <div class="card">
      <b>{t('drop.title')}</b>
      <span>
        {#each says as p, i (i)}{#if 'slot' in p}<em>{project.name}</em>{:else}{p.text}{/if}{/each}
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
