<script lang="ts">
  import { onMount } from 'svelte';
  import { registerBuiltins } from '../commands/builtin';
  import { registerNoteCommands } from '../commands/notes';
  import { registerPlayCommands } from '../commands/play';
  import { registerPortCommands } from '../commands/port';
  import { registerClassicCommands } from '../commands/classic';
  import { app } from '../state/app.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import Editor from './Editor.svelte';
  import NewChartDialog from './NewChartDialog.svelte';
  import StartScreen from './StartScreen.svelte';
  import Toasts from './Toasts.svelte';

  registerBuiltins(app);
  registerNoteCommands(app);
  registerPlayCommands(app);
  registerPortCommands(app);
  registerClassicCommands(app);

  onMount(() => {
    void app.init();
    const onKey = (e: KeyboardEvent) => {
      if (app.view.paletteOpen && e.key !== 'Escape') return;
      app.commands.handleKey(e, app.view.workbench);
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
{#if app.project && app.view.newChartOpen}
  <NewChartDialog onclose={() => (app.view.newChartOpen = false)} />
{/if}
<CommandPalette />
<Toasts />
