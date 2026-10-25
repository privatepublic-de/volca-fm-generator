import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the build works at any address, such as GitHub Pages' /volca-fm-generator/.
  base: './',
  // The generator's page, the protocol probe (Phase 0), the engine's test page (Phase 2) and the generator lab (Phase 3).
  build: { rollupOptions: { input: { index: 'index.html', probe: 'probe.html', engine: 'engine.html', generator: 'generator.html' } } },
  // the measure tests render many voices
  test: { exclude: ['**/node_modules/**', '.claude/**', 'local/**'], testTimeout: 30000 },
})
