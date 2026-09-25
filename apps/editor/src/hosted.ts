// The hosted preview's page (hosted.html, built by vite.hosted.config.ts; see
// docs/hosted-preview.md): the card says what works in a browser, the
// visitor picks what the demo opens with, and only then does the app start -
// its backend reads the switches once, as it is created.

import { version } from '../package.json';
import { addPageFlags } from './bridge/flags';

const card = document.getElementById('welcome')!;
const open = document.getElementById('welcome-open') as HTMLButtonElement;
const fail = document.getElementById('welcome-fail')!;
const DEMO_CHART = 'streetmix1p-neonparade.bmson';
const option = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;

document.getElementById('welcome-version')!.textContent = version;

open.addEventListener('click', async () => {
  open.disabled = true;
  open.textContent = 'Opening…';
  // Every mode's lane tour; the made-up game install and its skin.
  if (option('opt-modes')) addPageFlags('modes');
  if (option('opt-game')) addPageFlags('game', 'skin');
  try {
    await import('./main');
    const [{ app }, { DEMO_DIR }] = await Promise.all([
      import('./state/app.svelte'),
      import('./bridge/demo'),
    ]);
    await app.openProject(DEMO_DIR);
    // The demo's own 5K chart, not the first lane tour the modes add.
    const main = app.project?.charts.findIndex((c) => c.file === DEMO_CHART) ?? -1;
    if (main >= 0) app.selectChart(main);
    // A phone held sideways: the drawers would leave no room for the chart
    // (the palette and the top bar's ⌘ bring them back).
    if (innerWidth < 900) {
      app.view.leftOpen = false;
      app.view.right = null;
    }
    card.hidden = true;
  } catch (e) {
    fail.textContent = `The editor did not start: ${String(e)}`;
    fail.hidden = false;
    open.textContent = 'Open the demo song';
    open.disabled = false;
  }
});
