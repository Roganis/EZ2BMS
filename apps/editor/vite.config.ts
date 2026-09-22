import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// Tauri serves the built files from dist/ and, in dev, loads this server.
// A fixed port keeps tauri.conf.json's devUrl valid.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  preview: { port: 4173, strictPort: true },
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
  },
});
