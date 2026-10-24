import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // base './' permite desplegar en subcarpetas (GitHub Pages /repositorio/)
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // Dos entradas que comparten los mismos módulos de src/
      input: {
        main: resolve(root, 'index.html'),
        embed: resolve(root, 'embed.html'),
      },
    },
  },
  server: {
    // host: true para poder probar la cámara desde el celular en la misma red
    // (recuerda: la cámara exige localhost o HTTPS; ver README)
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
