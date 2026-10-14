import { defineConfig } from 'vite'

// Relative base: works unchanged on GitHub Pages (user or project page)
// and when embedded in an iframe at an arbitrary mount path (Moodle).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
})
