import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { assemblyscriptPlugin } from '@lagplayer/wasm-sharpener/vite-plugin';

export default defineConfig({
  plugins: [react(), assemblyscriptPlugin()],
  resolve: {
    // Point directly at each package's TS source so Vite handles HMR across packages.
    alias: {
      '@lagplayer/player': resolve(__dirname, '../../packages/player/src/index.ts'),
      '@lagplayer/image-controls': resolve(__dirname, '../../packages/image-controls/src/index.ts'),
      '@lagplayer/wasm-sharpener': resolve(__dirname, '../../packages/wasm-sharpener/src/index.ts'),
    },
  },
});
