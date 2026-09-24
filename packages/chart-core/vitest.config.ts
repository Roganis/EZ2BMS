import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Oracle tests spawn a native binary; give them room on a cold build.
    testTimeout: 20_000,
  },
});
