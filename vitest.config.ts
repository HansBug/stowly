import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/renderer/src/lib/**', 'src/renderer/src/store/**', 'src/renderer/src/three/boxes.ts', 'src/renderer/src/i18n/**', 'src/main/backend.ts'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 65 }
    }
  }
})
