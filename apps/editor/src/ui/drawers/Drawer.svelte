<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';

  let {
    side,
    title,
    width = 280,
    tabs,
    children,
    onclose,
  }: {
    side: 'left' | 'right';
    title?: string;
    width?: number;
    tabs?: Snippet;
    children: Snippet;
    onclose?: () => void;
  } = $props();
</script>

<aside
  class="drawer {side}"
  style:width="{width}px"
  transition:fly={{ x: side === 'left' ? -width : width, duration: 220, opacity: 1 }}
>
  <header>
    {#if tabs}{@render tabs()}{:else}<h2>{title}</h2>{/if}
    {#if onclose}<button class="x" onclick={onclose} aria-label="Close">×</button>{/if}
  </header>
  <div class="content">
    {@render children()}
  </div>
</aside>

<style>
  .drawer {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: linear-gradient(to bottom, #0b0f1c, #080a13);
    z-index: 2;
  }
  .left {
    border-right: 1px solid rgba(88, 225, 255, 0.14);
  }
  .right {
    border-left: 1px solid rgba(88, 225, 255, 0.14);
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 10px;
    border-bottom: 1px solid rgba(88, 225, 255, 0.1);
  }
  h2 {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .x {
    all: unset;
    cursor: pointer;
    margin-left: auto;
    color: var(--ink-faint);
    font-size: 18px;
    padding: 0 4px;
  }
  .x:hover {
    color: var(--ink);
  }
  .content {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
</style>
