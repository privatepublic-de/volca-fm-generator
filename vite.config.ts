import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths: the build works at any address, such as GitHub Pages' /volca-fm-generator/.
  base: './',
  // Phase 0: the protocol probe; the generator joins it in Phase 1.
  build: { rollupOptions: { input: { index: 'index.html', probe: 'probe.html' } } },
  test: { exclude: ['**/node_modules/**', '.claude/**', 'local/**'] },
})
