<script lang="ts">
  import { onMount } from 'svelte';
  import { registerBuiltins } from '../commands/builtin';
  import { registerNoteCommands } from '../commands/notes';
  import { app } from '../state/app.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import Editor from './Editor.svelte';
  import StartScreen from './StartScreen.svelte';
  import Toasts from './Toasts.svelte';

  registerBuiltins(app);
  registerNoteCommands(app);

  onMount(() => {
    void app.init();
    const onKey = (e: KeyboardEvent) => {
      if (app.view.paletteOpen && e.key !== 'Escape') return;
      app.commands.handleKey(e);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (app.project?.dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  });
</script>

{#if app.project}
  <Editor project={app.project} />
{:else}
  <StartScreen />
{/if}
<CommandPalette />
<Toasts />
