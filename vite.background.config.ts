import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty because SvelteKit build is already there
    lib: {
      entry: resolve(__dirname, 'src/background/agent.ts'),
      name: 'background',
      formats: ['iife'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib'),
    },
  },
});
