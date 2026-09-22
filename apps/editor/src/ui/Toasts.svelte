<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { toasts } from '../state/toasts.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <button
      class="toast {t.kind}"
      animate:flip={{ duration: 200 }}
      transition:fly={{ x: 40, duration: 220 }}
      onclick={() => toasts.dismiss(t.id)}
    >
      {t.text}
    </button>
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
    max-width: min(420px, 90vw);
  }
  .toast {
    all: unset;
    cursor: pointer;
    padding: 10px 14px;
    border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    font-size: 13px;
    line-height: 1.35;
    backdrop-filter: none;
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
