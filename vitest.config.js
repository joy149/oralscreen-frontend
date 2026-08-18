import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Test config is deliberately separate from `vite.config.js`: the app build pulls in
 * VitePWA (service-worker generation, manifest, precache globbing), none of which has
 * any bearing on a jsdom unit test and all of which slows the run down.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/main.jsx',          // bootstrap only — renders <App/> into the DOM
        'src/test/**',
        'src/**/*.test.{js,jsx}',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
