<script lang="ts">
  import { songFindings } from '../port/lint';
  import { app } from '../state/app.svelte';
  import type { Project } from '../state/project.svelte';

  let { project }: { project: Project } = $props();
  const slot = $derived(project.active);
  const stats = $derived.by(() => {
    if (!slot) return null;
    void slot.rev;
    const d = slot.doc;
    return {
      notes: d.data.notes.filter((n) => n.x !== 0).length,
      bgm: d.data.notes.filter((n) => n.x === 0).length,
      sounds: d.data.channels.length,
      selected: d.selection.ids.size,
      undo: d.undoLabel,
    };
  });
  const audio = $derived(app.audioInfo);
  const lint = $derived.by(() => {
    const f = songFindings(app);
    return {
      errors: f.filter((x) => x.severity === 'error').length,
      warnings: f.filter((x) => x.severity === 'warning').length,
    };
  });
</script>

<footer class="status">
  <span class="song">{project.name}</span>
  {#if stats}
    <span>{stats.notes} notes</span>
    <span>{stats.bgm} background</span>
    <span>{stats.sounds} sounds</span>
    {#if stats.selected}<span class="sel">{stats.selected} selected</span>{/if}
    {#if stats.undo}<span class="dim">last: {stats.undo}</span>{/if}
    {#if app.classic.on && slot}
      <span class="classic" data-testid="classic-status"
        >CLASSIC{#if app.classic.cands.length}
          · {app.classic.label(slot.doc)}{/if}</span
      >
    {/if}
  {/if}
  <span class="right">
    <button
      class="lint"
      class:bad={lint.errors > 0}
      onclick={() => app.commands.run('view.issues')}
      data-testid="lint"
    >
      {#if lint.errors || lint.warnings}
        {#if lint.errors}<b>{lint.errors} error{lint.errors === 1 ? '' : 's'}</b>{/if}
        {#if lint.warnings}<i>{lint.warnings} warning{lint.warnings === 1 ? '' : 's'}</i>{/if}
      {:else}ready for EZ2PORT{/if}
    </button>
    {#if app.port.runId !== null}<button class="lint" onclick={() => (app.port.logOpen = true)}
        >EZ2PORT running</button
      >{/if}
    {#if audio}
      <span class="audio {audio.backend}"
        >{audio.backend === 'cpal'
          ? `${audio.rate / 1000} kHz`
          : audio.backend === 'null'
            ? 'no audio device'
            : 'browser preview'}</span
      >
    {/if}
    <span class="side">{app.view.side}</span>
  </span>
</footer>

<style>
  .classic {
    color: #ff4fd8;
    font-weight: 600;
  }
  .status {
    display: flex;
    gap: 14px;
    align-items: center;
    height: 26px;
    padding: 0 12px;
    font-size: 12px;
    color: var(--ink-dim);
    background: #070910;
    border-top: 1px solid rgba(88, 225, 255, 0.12);
    white-space: nowrap;
    overflow: hidden;
  }
  .song {
    color: var(--ink);
  }
  .sel {
    color: var(--neon);
  }
  .dim {
    color: var(--ink-faint);
  }
  .right {
    margin-left: auto;
    display: flex;
    gap: 12px;
  }
  .lint {
    all: unset;
    cursor: pointer;
    display: flex;
    gap: 8px;
    color: var(--ok);
  }
  .lint b {
    color: var(--err);
    font-weight: 600;
  }
  .lint i {
    color: var(--warn);
    font-style: normal;
  }
  .lint:hover {
    text-decoration: underline;
  }
  .audio.null,
  .audio.web {
    color: var(--warn);
  }
  .side {
    font-family: var(--font-num);
    color: var(--ink);
  }
</style>
