import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@plugin-sdk': path.resolve(__dirname, './src/plugin-sdk'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
    },
  },
});
