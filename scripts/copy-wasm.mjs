/**
 * Copia los archivos WASM de @mediapipe/tasks-vision a public/wasm/
 * para que el proyecto no dependa de CDNs externos en tiempo de ejecución.
 * Se ejecuta automáticamente tras `npm install` (script postinstall).
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceDir = join(projectRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const targetDir = join(projectRoot, 'public', 'wasm')

if (!existsSync(sourceDir)) {
  console.warn('[copy-wasm] No se encontró node_modules/@mediapipe/tasks-vision/wasm.')
  console.warn('[copy-wasm] Ejecuta `npm install` para generar los archivos WASM.')
  process.exit(0)
}

mkdirSync(targetDir, { recursive: true })

let copied = 0
for (const file of readdirSync(sourceDir)) {
  // Solo los binarios y su loader; descartamos sourcemaps y otros assets.
  if (/\.(wasm|js|json)$/.test(file)) {
    cpSync(join(sourceDir, file), join(targetDir, file))
    copied += 1
  }
}

console.log(`[copy-wasm] ${copied} archivos WASM copiados a public/wasm/`)
