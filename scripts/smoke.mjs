/**
 * Prueba de humo (opcional, no forma parte del entregable):
 * carga la build de producción en Edge headless con cámara falsa de Chromium
 * y falla si hay errores de página, peticiones 404 o la UI no arranca.
 *
 * Uso: npm run build && node scripts/smoke.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PORT = 4199
const BASE = `http://127.0.0.1:${PORT}/`

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* aún no está listo */
    }
    await sleep(300)
  }
  throw new Error(`El servidor no respondió en ${url}`)
}

async function main() {
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    throw new Error('No hay dist/. Ejecuta `npm run build` primero.')
  }

  const executablePath = EDGE_CANDIDATES.find((p) => existsSync(p))
  if (!executablePath) throw new Error('No se encontró Edge/Chrome.')

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: root,
    shell: true,
    stdio: 'ignore',
  })

  const errors = []
  const badResponses = []
  let browser

  try {
    await waitForServer(BASE)

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
        '--no-sandbox',
      ],
    })

    const page = await browser.newPage()
    await browser.overridePermissions?.(new URL(BASE).origin, ['camera'])
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`)
    })

    // --- index.html ---
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
    const webglOk = await page.evaluate(() => document.getElementById('webgl-error').hidden)
    if (!webglOk) errors.push('webgl-error visible: WebGL no disponible en headless')

    await page.click('#start-button')
    // Sondeo: esperamos a que arranque (hasta 45 s: modelo + WASM + delegación GPU→CPU)
    let state = null
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      state = await page.evaluate(() => ({
        startHidden: document.getElementById('start-screen').hidden,
        status: document.getElementById('hud-status')?.dataset.state,
        startError: document.getElementById('start-error').hidden
          ? ''
          : document.getElementById('start-error').textContent.trim(),
        previewHidden: document.getElementById('preview-wrap').hidden,
        canvas: Boolean(document.querySelector('.aura-canvas')),
        notice: document.getElementById('notice').hidden,
        help: document.getElementById('help-list').children.length,
        video: Boolean(document.getElementById('camera-preview')),
      }))
      if (state.startHidden || state.startError) break
      await sleep(1000)
    }
    console.log('index.html →', JSON.stringify(state))

    if (state.startError) errors.push(`onStart falló: "${state.startError}"`)
    if (!state.startHidden) errors.push(`La pantalla inicial no se ocultó (status=${state.status})`)
    if (!state.canvas) errors.push('No se creó el canvas de partículas')
    if (state.status !== 'live' && state.status !== 'fallback') {
      errors.push(`Estado de cámara inválido: ${state.status}`)
    }

    // Controles: paleta + escala + volumen + grabar (solo si la app arrancó)
    if (state.startHidden) {
      await page.evaluate(() => {
        const palette = document.getElementById('ctl-palette')
        palette.value = 'rosa'
        palette.dispatchEvent(new Event('change'))
        const scale = document.getElementById('ctl-scale')
        scale.value = 'mayor'
        scale.dispatchEvent(new Event('change'))
        const vol = document.getElementById('ctl-volume')
        vol.value = '40'
        vol.dispatchEvent(new Event('input'))
      })
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      )
      if (!/ec4899/i.test(accent)) errors.push(`--accent no cambió (got: ${accent})`)

      await page.click('#ctl-record')
      const recording = await page.evaluate(() => document.getElementById('ctl-record').classList.contains('is-recording'))
      if (!recording) errors.push('El botón grabar no entró en estado recording')
      await sleep(700)
      await page.click('#ctl-record')
      const stopped = await page.evaluate(() => !document.getElementById('ctl-record').classList.contains('is-recording'))
      if (!stopped) errors.push('El botón grabar no salió del estado recording')

      // Movimiento de mouse → mano virtual presente aunque haya cámara
      await page.mouse.move(300, 240)
      await page.mouse.move(640, 300, { steps: 6 })
      await sleep(600)
    }

    // --- embed.html con parámetros ---
    await page.goto(`${BASE}embed.html?palette=azul&scale=menor&particles=bajo`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    })
    const embed = await page.evaluate(() => ({
      embed: document.body.classList.contains('embed'),
      headerHidden: !document.querySelector('.aura-header') || getComputedStyle(document.querySelector('.aura-header')).display === 'none',
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    }))
    console.log('embed.html →', JSON.stringify(embed))
    if (!embed.embed) errors.push('embed.html no activó el modo embed')
    if (!/38bdf8/i.test(embed.accent)) errors.push(`embed no aplicó palette=azul (got: ${embed.accent})`)

    // Parámetros inválidos → valor por defecto (dorado)
    await page.goto(`${BASE}embed.html?palette=%3Cscript%3E&scale=xyz&particles=999`, { waitUntil: 'networkidle2' })
    const sanitized = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    )
    if (!/f2a93b/i.test(sanitized)) errors.push(`Parámetros no sanitizados (got: ${sanitized})`)

    await page.click('#start-button')
    let embedStarted = false
    const embedDeadline = Date.now() + 45000
    while (Date.now() < embedDeadline) {
      embedStarted = await page.evaluate(() => document.getElementById('start-screen').hidden)
      if (embedStarted) break
      await sleep(1000)
    }
    if (!embedStarted) errors.push('embed.html no arrancó tras el clic')
  } catch (err) {
    errors.push(`fatal: ${err.message}`)
  } finally {
    await browser?.close().catch(() => {})
    server.kill()
  }

  if (badResponses.length) console.log('Respuestas HTTP con error:\n  ' + badResponses.join('\n  '))

  if (errors.length) {
    console.error(`\n✗ ${errors.length} problema(s):`)
    for (const e of errors) console.error('  - ' + e)
    process.exit(1)
  }
  console.log('\n✓ Smoke test superado: sin errores de runtime.')
}

main()
