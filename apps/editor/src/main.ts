import { mount } from 'svelte';
import { app } from './state/app.svelte';
import App from './ui/App.svelte';
import './theme/tokens.css';

const target = document.getElementById('app');
if (!target) throw new Error('missing #app');

// End-to-end tests reach the app through this handle (?e2e only).
if (new URLSearchParams(location.search).has('e2e')) {
  (window as unknown as { __ez2bms: unknown }).__ez2bms = app;
}

export default mount(App, { target });
