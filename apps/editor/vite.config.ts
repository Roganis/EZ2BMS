import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The desktop app's content security policy, applied to `vite preview` too, so
// the e2e suite runs the build under the rules the webview enforces (Pixi's
// generated code was blocked there while every browser test passed).
const tauriCsp: string = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../src-tauri/tauri.conf.json'), 'utf8'),
).app.security.csp;

// Tauri serves the built files from dist/ and, in dev, loads this server.
// A fixed port keeps tauri.conf.json's devUrl valid.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  preview: {
    port: 4173,
    strictPort: true,
    headers: { 'Content-Security-Policy': tauriCsp },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        perf: resolve(import.meta.dirname, 'perf.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
  },
});
