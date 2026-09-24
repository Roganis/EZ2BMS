<script lang="ts">
  // One sound in the workbench: its waveform (click to listen), length, where
  // it is used, and what can be done with it.
  import type { SoundInfo } from '@ez2bms/chart-core';
  import { baseName } from '../../bridge';
  import { channelHue } from '../../colors';
  import { t, type MessageKey } from '../../i18n/i18n.svelte';
  import { app } from '../../state/app.svelte';
  import Thumb from './Thumb.svelte';
  import { formatLength } from './workbench';

  let {
    info,
    labels,
    width,
    renaming,
    onrename,
    onreplace,
  }: {
    info: SoundInfo;
    /** Chart file -> "7K HD". */
    labels: ReadonlyMap<string, string>;
    width: number;
    renaming: boolean;
    /** Start (no argument), commit (the new name) or cancel (null) a rename. */
    onrename: (name?: string | null) => void;
    onreplace: () => void;
  } = $props();

  const loaded = $derived(app.audio.loadedInfo(info.name));
  const hue = $derived(channelHue(info.name));
  const active = $derived(app.slot?.file);
  const isBrush = $derived.by(() => {
    const b = app.view.brush;
    return b !== null && !!info.charts.find((c) => c.chart === active)?.channels.includes(b);
  });
  const status = $derived<MessageKey | null>(
    !info.inFolder
      ? 'workbench.tagMissing'
      : loaded?.error
        ? 'workbench.tagUnreadable'
        : info.charts.length === 0
          ? 'workbench.tagUnused'
          : null,
  );
</script>

<div
  class="card"
  class:missing={!info.inFolder}
  class:brush={isBrush}
  style:--h={hue}
  style:width="{width}px"
  data-testid="sound-card"
  data-name={info.name}
>
  <button
    class="wave"
    title={loaded?.error ?? t(info.inFolder ? 'workbench.listen' : 'workbench.notInFolder')}
    disabled={!loaded || loaded.id === null}
    onclick={() => void app.audio.audition(info.name)}
  >
    <Thumb {loaded} width={width - 2} height={40} {hue} />
    {#if status}<span class="tag" class:bad={status !== 'workbench.tagUnused'}>{t(status)}</span
      >{/if}
  </button>
  {#if renaming}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="rename"
      value={baseName(info.name)}
      autofocus
      spellcheck="false"
      data-testid="rename-input"
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onrename(e.currentTarget.value);
        if (e.key === 'Escape') onrename(null);
      }}
      onblur={() => onrename(null)}
    />
  {:else}
    <div class="name" title={info.name}>{info.name}</div>
  {/if}
  <div class="meta">
    <span>{formatLength(loaded && !loaded.error ? loaded.seconds : undefined)}</span>
    <span>{t('workbench.notes', { n: info.notes })}</span>
  </div>
  <div class="uses">
    {#each info.charts.slice(0, 3) as u (u.chart)}
      <span
        class="use"
        class:here={u.chart === active}
        class:idle={u.lane + u.bgm === 0}
        title={t('workbench.uses', {
          chart: labels.get(u.chart) ?? u.chart,
          lane: u.lane,
          bgm: u.bgm,
        })}>{labels.get(u.chart) ?? u.chart} <b>{u.lane + u.bgm}</b></span
      >
    {/each}
    {#if info.charts.length > 3}<span class="use">+{info.charts.length - 3}</span>{/if}
  </div>
  <div class="acts">
    <button
      class="act main"
      title={t('workbench.drawTitle')}
      disabled={!app.slot}
      onclick={() => {
        app.sounds.brush(info);
        app.view.workbench = false;
      }}>{t('workbench.draw')}</button
    >
    <button
      class="act"
      title={t('workbench.renameTitle')}
      disabled={!info.inFolder}
      onclick={() => onrename()}>{t('workbench.rename')}</button
    >
    <button
      class="act"
      title={t('workbench.replaceTitle')}
      disabled={!info.charts.length}
      onclick={onreplace}>{t('workbench.replace')}</button
    >
  </div>
</div>

<style>
  .card {
    box-sizing: border-box;
    height: 100%;
    display: grid;
    grid-template-rows: 42px auto auto 1fr auto;
    gap: 3px;
    padding: 0 0 6px;
    border-radius: 9px;
    border: 1px solid rgba(88, 225, 255, 0.12);
    background: linear-gradient(180deg, hsl(var(--h) 60% 50% / 0.08), transparent 70%), #0a0e1a;
    overflow: hidden;
    transition:
      border-color 120ms,
      transform 120ms var(--ease-out);
  }
  .card:hover {
    border-color: hsl(var(--h) 85% 62% / 0.6);
  }
  .card.brush {
    border-color: var(--neon);
    box-shadow: var(--glow);
  }
  .card.missing {
    background: #0d0a12;
    border-style: dashed;
  }
  .wave {
    all: unset;
    position: relative;
    cursor: pointer;
    background: #05070d;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .wave:disabled {
    cursor: default;
  }
  .wave:hover:not(:disabled) {
    background: #0b1222;
  }
  .tag {
    position: absolute;
    right: 5px;
    top: 4px;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 194, 71, 0.18);
    color: var(--warn);
  }
  .tag.bad {
    background: rgba(255, 84, 112, 0.18);
    color: var(--err);
  }
  .name,
  .rename {
    margin: 2px 8px 0;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rename {
    box-sizing: border-box;
    padding: 1px 4px;
    border: 1px solid var(--neon);
    border-radius: 5px;
    background: #05070d;
    color: var(--ink);
    font-family: var(--font-ui);
    outline: none;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    margin: 0 8px;
    font: 11px var(--font-num);
    color: var(--ink-dim);
  }
  .uses {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 0 8px;
    align-content: start;
    overflow: hidden;
  }
  .use {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--ink-dim);
    white-space: nowrap;
  }
  .use.here {
    background: rgba(88, 225, 255, 0.12);
    color: var(--ink);
  }
  .use.idle {
    color: var(--warn);
    background: rgba(255, 194, 71, 0.1);
  }
  .use b {
    font: 600 10px var(--font-num);
  }
  .acts {
    display: flex;
    gap: 4px;
    margin: 0 6px;
  }
  .act {
    all: unset;
    cursor: pointer;
    flex: 1;
    text-align: center;
    font-size: 11px;
    padding: 3px 0;
    border-radius: 5px;
    color: var(--ink-dim);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
  .act:hover:not(:disabled) {
    color: var(--ink);
    border-color: hsl(var(--h) 85% 62% / 0.7);
  }
  .act.main {
    color: var(--ink);
    border-color: rgba(88, 225, 255, 0.3);
  }
  .act:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
