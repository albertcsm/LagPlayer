import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'LagPlayer',
      formats: ['es', 'umd'],
      fileName: (format) => `lag-player.${format}.js`,
    },
  },
});
