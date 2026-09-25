import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// The hosted preview (docs/hosted-preview.md): the browser build as one page
// for a private web host. The host wraps what it is given in its own <html>,
// <head> and <body> (with the charset and viewport) and serves the other
// files beside it, so the page is built with paths relative to itself and
// without its document skeleton. `pnpm build:hosted` → dist-hosted/.
function withoutSkeleton(): Plugin {
  return {
    name: 'ez2bms-hosted-page',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<!doctype html>\s*/i, '')
          .replace(/<\/?(html|head|body)(\s[^>]*)?>\s*/gi, '')
          .replace(/<meta (charset|name="viewport")[^>]*>\s*/gi, ''),
    },
  };
}

export default defineConfig({
  plugins: [svelte(), withoutSkeleton()],
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-hosted',
    emptyOutDir: true,
    // The editor is one chunk of about 1 MB; the page loads it once.
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: resolve(import.meta.dirname, 'hosted.html') },
  },
});
