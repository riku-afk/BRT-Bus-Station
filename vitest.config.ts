import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src/client'),
      '@config': path.resolve(import.meta.dirname, './src/server/config'),
      '@core': path.resolve(import.meta.dirname, './src/server/core'),
      '@lib': path.resolve(import.meta.dirname, './src/server/lib'),
      '@middleware': path.resolve(import.meta.dirname, './src/server/middleware'),
      '@modules': path.resolve(import.meta.dirname, './src/server/modules'),
      '@integrations': path.resolve(import.meta.dirname, './src/server/integrations'),
      '@shared': path.resolve(import.meta.dirname, './src/shared'),
    },
  },
  test: {
    setupFiles: ['./src/client/test/setup.ts'],
    globals: true,
    // .env values (DATABASE_URL, …) for tests; integration tests still switch to a separate *_test database.
    env: loadEnv('test', import.meta.dirname, ''),
    // `include` is set per project: with `extends: true` a root `include` would be added to each project's own.
    projects: [
      // Server and shared code: plain Node.
      { extends: true, test: { name: 'server', environment: 'node', include: ['src/server/**/*.test.ts', 'src/shared/**/*.test.ts', 'scripts/**/*.test.ts'], exclude: ['**/node_modules/**', 'src/server/integration/**'] } },
      // Browser code. happy-dom (not jsdom 29) so tests run on Node 20.
      { extends: true, test: { name: 'client', environment: 'happy-dom', include: ['src/client/**/*.test.{ts,tsx}'] } },
      // Database tests run one file at a time (they rebuild their own database).
      { extends: true, test: { name: 'integration', environment: 'node', include: ['src/server/integration/**/*.test.ts'], fileParallelism: false } },
    ],
  },
});
