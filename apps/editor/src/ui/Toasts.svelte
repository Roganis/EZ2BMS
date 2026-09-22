<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { toasts } from '../state/toasts.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div
      class="toast {t.kind}"
      animate:flip={{ duration: 200 }}
      transition:fly={{ x: 40, duration: 220 }}
    >
      <button class="text" onclick={() => toasts.dismiss(t.id)}>{t.text}</button>
      {#if t.action}
        <button
          class="ez-btn"
          onclick={() => {
            t.action!.run();
            toasts.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 16px;
    bottom: 40px;
    display: grid;
    gap: 8px;
    z-index: 50;
    max-width: min(440px, 90vw);
  }
  .toast {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 14px;
    border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    font-size: 13px;
    line-height: 1.35;
  }
  .text {
    all: unset;
    cursor: pointer;
    flex: 1;
  }
  .ok {
    border-color: var(--ok);
  }
  .warn {
    border-color: var(--warn);
  }
  .error {
    border-color: var(--err);
    color: #ffd6de;
  }
</style>
