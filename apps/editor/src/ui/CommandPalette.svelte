<script lang="ts">
  import { formatKey, type Match } from '../commands/registry';
  import { app } from '../state/app.svelte';

  let query = $state('');
  let index = $state(0);
  let input: HTMLInputElement | undefined = $state();
  const matches: Match[] = $derived(app.view.paletteOpen ? app.commands.search(query) : []);

  $effect(() => {
    if (app.view.paletteOpen) {
      query = '';
      index = 0;
      queueMicrotask(() => input?.focus());
    }
  });
  $effect(() => {
    void query;
    index = 0;
  });

  function close() {
    app.view.paletteOpen = false;
  }

  function run(m: Match | undefined) {
    if (!m) return;
    if (m.cmd.verb && m.arg === undefined) {
      query = `${m.cmd.verb} `;
      input?.focus();
      return;
    }
    close();
    app.commands.run(m.cmd.id, m.arg);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(matches.length - 1, index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(0, index - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(matches[index]);
    }
  }
</script>

{#if app.view.paletteOpen}
  <div class="scrim" onpointerdown={close} role="presentation"></div>
  <div class="palette" role="dialog" aria-label="Command palette" data-testid="palette">
    <input
      bind:this={input}
      bind:value={query}
      onkeydown={onKey}
      placeholder="Type a command - or goto 32, bpm 174, snap 1/12, speed 300"
      spellcheck="false"
      autocomplete="off"
    />
    <ul>
      {#each matches as m, i (m.cmd.id)}
        <li>
          <button class:on={i === index} onpointerenter={() => (index = i)} onclick={() => run(m)}>
            <span class="group">{m.cmd.group}</span>
            <span class="title">
              {m.cmd.title}
              {#if m.arg !== undefined}<b>{m.arg}</b>{:else if m.cmd.verb}<i
                  >{m.cmd.verb} {m.cmd.argHint}</i
                >{/if}
            </span>
            <span class="keys">
              {#each app.commands.keysFor(m.cmd.id).slice(0, 2) as k (k)}<kbd>{formatKey(k)}</kbd
                >{/each}
            </span>
          </button>
        </li>
      {:else}
        <li class="none">No command matches “{query}”</li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(2, 3, 8, 0.55);
    z-index: 40;
  }
  .palette {
    position: fixed;
    top: 12vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(640px, 92vw);
    z-index: 41;
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    border-radius: 14px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.6),
      var(--glow);
    overflow: hidden;
    animation: drop 0.18s var(--ease-out);
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translate(-50%, -8px);
    }
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 16px 18px;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--panel-edge);
    color: var(--ink);
    font: 16px var(--font-ui);
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 50vh;
    overflow: auto;
  }
  li button {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: grid;
    grid-template-columns: 70px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
  }
  li button.on {
    background: rgba(88, 225, 255, 0.12);
    box-shadow: inset 2px 0 0 var(--neon);
  }
  .group {
    color: var(--ink-faint);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .title b {
    color: var(--neon);
    margin-left: 6px;
    font-family: var(--font-num);
  }
  .title i {
    color: var(--ink-faint);
    margin-left: 8px;
    font-style: normal;
    font-family: var(--font-num);
    font-size: 12px;
  }
  kbd {
    font-family: var(--font-num);
    font-size: 11px;
    color: var(--ink-dim);
    border: 1px solid var(--ink-faint);
    border-radius: 4px;
    padding: 1px 5px;
    margin-left: 4px;
  }
  .none {
    padding: 12px;
    color: var(--ink-dim);
  }
</style>
