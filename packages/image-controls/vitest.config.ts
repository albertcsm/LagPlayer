import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
  resolve: {
    alias: {
      '@lagplayer/player': resolve(__dirname, '../player/src/index.ts'),
    },
  },
});
