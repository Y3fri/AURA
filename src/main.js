/**
 * Aura — punto de entrada.
 * Conecta visión, escena, audio, UI y grabador, y dirige el bucle principal.
 *
 * El flujo por frame es siempre el mismo:
 *   manos crudas → gestos → posición en el mundo → notas (on/off) →
 *   pellizco/explosión → uniforms de partículas → HUD (con throttle).
 */
import { AudioEngine } from './audio/AudioEngine.js'
import { degreeLabel } from './audio/scales.js'
import {
  GESTURES,
  PALETTES,
  readUrlParams,
  settings,
} from './config/settings.js'
import { MouseFallbackInput } from './input/mouseFallback.js'
import { AuraScene, hasWebGL } from './scene/AuraScene.js'
import { ParticleSystem } from './scene/particleSystem.js'
import { createHud } from './ui/hud.js'
import { InterpretationRecorder } from './ui/recorder.js'
import { createStartScreen } from './ui/startScreen.js'
import { analyzeHand, octaveFromHeight } from './vision/gestures.js'
import { HandTracker } from './vision/HandTracker.js'

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const motionScale = () => (reducedMotionQuery.matches ? 0.35 : 1)

// ---------------------------------------------------------------------------
// Parámetros de URL (lista blanca) — útiles también en index.html
// ---------------------------------------------------------------------------
const params = readUrlParams()
settings.palette = params.palette
settings.scale = params.scale
settings.quality = params.particles

// ---------------------------------------------------------------------------
// Módulos globales
// ---------------------------------------------------------------------------
const engine = new AudioEngine()
const recorder = new InterpretationRecorder({ onEvent: handleLoopEvent })

const hud = createHud({
  onPalette: applyPalette,
  onScale: applyScale,
  onVolume: (v) => engine.setVolume(v),
  onMute: toggleMute,
  onRecord: toggleRecord,
})

// Encadena el clic del botón inicial → onStart (Tone + cámara en el gesto del usuario)
createStartScreen({ onStart, onBlocked: showWebGLBlock })

/** Slot de estado por mano (máx. 2): fuerza, posición estable, histéresis de pellizco. */
const handStates = Array.from({ length: settings.maxHands }, () => ({
  strength: 0,
  pinchValue: 0,
  x: 0.5,
  y: 0.5,
  depth: 0.5,
  pinch: false,
  pinchSince: 0,
}))

/** Notas activas de la interpretación en vivo: id → grado/octava. */
const liveNotes = new Map()

let scene = null
let particles = null
let tracker = null
let fallback = null
let input = null // fuente activa: tracker o fallback
let rafId = 0
let time = 0
let lastFrame = performance.now()
let hudAccumulator = 0
let previewFrame = 0
let burst = 0
let burstCenter = { x: 0, y: 0, z: 0 }
let ambientPresence = 1
let ambientSent = 1
let currentNote = { label: '', at: 0 }
let running = false
let ghost = null

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (!hasWebGL()) {
  showWebGLBlock('WebGL no está disponible en este navegador.')
} else {
  hud.setPalette(settings.palette)
  hud.setScale(settings.scale)
  hud.setVolume(settings.volume)
  hud.setHelp('camera')
  hud.setStatus('starting')
}

async function onStart() {
  // Tone.start() debe ocurrir dentro del gesto del usuario
  await engine.start()

  scene = new AuraScene(document.getElementById('scene-root'))
  const radius = Math.min(scene.viewSize.width, scene.viewSize.height) * 0.48
  particles = new ParticleSystem(settings.particleCount, PALETTES[settings.palette], radius)
  particles.setMotion(motionScale())
  scene.add(particles.mesh)

  // Intento de cámara; si falla, modo respaldo automático (nunca bloquear al usuario)
  try {
    tracker = new HandTracker()
    const video = await tracker.start()
    input = tracker
    mountPreview(video)
    hud.setStatus('live')
    hud.setHelp('camera')
    hud.hideNotice()
  } catch (err) {
    console.warn('[Aura] modo respaldo:', err)
    useFallback(err)
  }

  running = true
  lastFrame = performance.now()
  scene.start()
  rafId = requestAnimationFrame(frame)
}

function useFallback(err) {
  tracker?.stop()
  tracker = null
  fallback = new MouseFallbackInput({ onBurst: (x, y) => triggerBurst(x, y, 1) })
  fallback.start()
  input = fallback
  document.getElementById('preview-wrap').hidden = true
  hud.setStatus('fallback')
  hud.setHelp('mouse')

  const reasons = {
    NotAllowedError: 'nos diste permiso para usar la cámara',
    NotFoundError: 'no hay ninguna cámara conectada',
    OverconstrainedError: 'no hay ninguna cámara compatible',
    SecurityError: 'esta página no tiene permiso de cámara (¿está en HTTPS?)',
  }
  const reason = reasons[err?.cause?.name] || 'la cámara no está disponible aquí'

  hud.showNotice(`
    <span class="notice-title">Modo mouse activo</span>
    No pudimos usar la cámara: ${reason}. Mueve el cursor para tocar, haz clic sostenido para
    pellizcar y suelta para explotar. <b>Todo funciona igual sin cámara.</b>
  `)
  setTimeout(() => hud.hideNotice(), 9000)
}

function mountPreview(video) {
  const wrap = document.getElementById('preview-wrap')
  video.id = 'camera-preview'
  video.setAttribute('aria-hidden', 'true')
  wrap.prepend(video)
  wrap.hidden = false
}

function showWebGLBlock(message) {
  document.getElementById('webgl-error').hidden = false
  document.getElementById('start-screen').hidden = true
  if (message) {
    const p = document.querySelector('#webgl-error p')
    if (p) p.textContent = message
  }
}

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------
function frame(now) {
  if (!running) return
  rafId = requestAnimationFrame(frame)

  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now
  time += dt

  const rawHands = input?.getHands() ?? []
  const analyzed = []

  // 1) Gestos por ranura, con fuerza suavizada (aparecer/desaparecer sin saltos)
  for (let i = 0; i < settings.maxHands; i++) {
    const state = handStates[i]
    const raw = rawHands[i]
    const target = raw ? 1 : 0
    state.strength += (target - state.strength) * Math.min(1, dt * 8)

    if (!raw) continue

    const a = analyzeHand(raw.landmarks, state.pinch)
    state.x = a.center.x
    state.y = a.center.y
    state.depth = a.depth
    state.pinchValue += ((a.pinch ? 1 : 0) - state.pinchValue) * Math.min(1, dt * 12)

    // Explosión: pellizco sostenido → abrir la mano (transición a `open`)
    if (a.pinch && !state.pinch) state.pinchSince = now
    if (!a.pinch && state.pinch && a.open && now - state.pinchSince > GESTURES.PINCH_MIN_DURATION) {
      triggerBurst(state.x, state.y, 1)
    }
    state.pinch = a.pinch

    analyzed.push({ hand: a, state, index: i })
  }

  // 2) Notas por dedo (on/off con diff; octava por altura, grado por dedo + mano)
  updateNotes(analyzed, now)

  // 3) Ajuste general del "ambiente" (sin manos → pad respira)
  const presenceTarget = analyzed.length ? 0 : 1
  ambientPresence += (presenceTarget - ambientPresence) * Math.min(1, dt * 1.5)
  if (Math.abs(ambientPresence - ambientSent) > 0.15) {
    engine.setAmbientPresence(ambientPresence)
    ambientSent = ambientPresence
  }

  // 4) Explosión: impulso con decaimiento exponencial
  burst *= Math.exp(-dt * 3.4)
  if (burst < 0.005) burst = 0

  // 5) Reproducción del bucle (fantasma + eventos)
  const loopState = recorder.update()
  if (loopState.restarted) releaseLoopNotes()
  if (loopState.ghost) {
    ghost = toWorld(loopState.ghost.x, loopState.ghost.y, 0.4)
    ghost.strength = 0.85
  } else {
    ghost = null
  }
  for (const ev of loopState.due) handleLoopEvent(ev)

  // 6) Subir todo a la GPU
  const hands = [null, null, ghost]
  for (let i = 0; i < settings.maxHands; i++) {
    const st = handStates[i]
    // Se lee del estado (no de `analyzed`) para que el atractor se desvanezca
    // en su última posición cuando la mano sale del encuadre
    if (st.strength > 0.02) hands[i] = { ...toWorld(st.x, st.y, st.depth), strength: st.strength }
  }

  particles.update({
    time,
    hands,
    pinch: [handStates[0].pinchValue, handStates[1].pinchValue, 0],
    burst: burst * motionScale(),
    burstCenter,
    audio: engine.getLevel(),
    pixelRatio: scene.renderer.getPixelRatio(),
  })

  const maxDepth = analyzed.reduce((m, h) => Math.max(m, h.state.depth), 0.35)
  particles.setSizeScale(maxDepth)

  // 7) HUD a ~10 FPS; vista previa a ~30 FPS (la interfaz nunca frena el render)
  hudAccumulator += dt
  if (hudAccumulator > 0.1) {
    hudAccumulator = 0
    if (currentNote.label && (liveNotes.size === 0 || now - currentNote.at > 1500)) {
      currentNote = { label: '', at: 0 }
      hud.setNote('')
    } else if (currentNote.label) {
      hud.setNote(currentNote.label)
    }
  }
  if ((previewFrame++ & 1) === 0) hud.drawPreview(tracker?.getHands() ?? [])
}

function toWorld(nx, ny, depth = 0.5) {
  const p = scene.normalizedToWorld(nx, ny)
  // Profundidad sutil: acercar la mano acerca partículas a la cámara
  return { x: p.x, y: p.y, z: (depth - 0.5) * 1.1 }
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------
function updateNotes(analyzed, now) {
  const seen = new Set()

  for (const { hand, state, index } of analyzed) {
    if (state.strength < 0.35) continue
    hand.fingers.forEach((extended, finger) => {
      const id = `h${index}f${finger}`
      seen.add(id)
      // Segunda mano desplazada +2 grados: ambas manos suman armonía, no unísono
      const degree = finger + index * 2
      const octave = octaveFromHeight(hand.height)

      if (extended && !liveNotes.has(id)) {
        const freq = engine.noteOn({ id, degree, octave })
        if (freq) {
          liveNotes.set(id, { degree, octave })
          currentNote = { label: degreeLabel(settings.scale, degree), at: now }
          hud.setNote(currentNote.label)
          recorder.record('noteOn', { id, degree, octave, x: state.x, y: state.y })
        }
      } else if (!extended && liveNotes.has(id)) {
        engine.noteOff(id)
        liveNotes.delete(id)
        recorder.record('noteOff', { id })
      } else if (extended && liveNotes.has(id)) {
        // El dedo sigue levantado pero cambió de octava: relevo limpio
        const prev = liveNotes.get(id)
        if (prev.octave !== octave) {
          engine.noteOff(id)
          recorder.record('noteOff', { id })
          const freq = engine.noteOn({ id, degree, octave })
          if (freq) {
            liveNotes.set(id, { degree, octave })
            recorder.record('noteOn', { id, degree, octave, x: state.x, y: state.y })
          }
        }
      }
    })
  }

  // Manos que se fueron: silenciar sus notas
  for (const id of [...liveNotes.keys()]) {
    if (!seen.has(id)) {
      engine.noteOff(id)
      liveNotes.delete(id)
      recorder.record('noteOff', { id })
    }
  }
}

function triggerBurst(nx, ny, intensity = 1) {
  burst = Math.max(burst, intensity)
  burstCenter = toWorld(nx, ny, 0.5)
  engine.burst(intensity)
  recorder.record('burst', { x: nx, y: ny })
}

// ---------------------------------------------------------------------------
// Bucle grabado
// ---------------------------------------------------------------------------
function handleLoopEvent(ev) {
  if (ev.type === 'noteOn') {
    engine.noteOn({ id: ev.loopId, degree: ev.degree, octave: ev.octave })
  } else if (ev.type === 'noteOff') {
    engine.noteOff(ev.loopId)
  } else if (ev.type === 'burst') {
    burst = Math.max(burst, 0.8)
    burstCenter = toWorld(ev.x, ev.y, 0.5)
    engine.burst(0.7)
  }
}

function releaseLoopNotes() {
  // En cada vuelta se liberan las voces del bucle por si un evento quedó colgado
  let i = 0
  while (engine.activeNotes?.has(`loop-${i}`)) {
    engine.noteOff(`loop-${i}`)
    i += 1
  }
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------
function applyPalette(key) {
  if (!PALETTES[key]) return
  settings.palette = key
  hud.setPalette(key)
  particles?.setPalette(PALETTES[key])
}

function applyScale(key) {
  settings.scale = key
  hud.setScale(key)
  // Liberar notas vivas: su frecuencia pertenecía a la escala anterior
  for (const id of [...liveNotes.keys()]) {
    engine.noteOff(id)
    liveNotes.delete(id)
    recorder.record('noteOff', { id })
  }
  engine.setScale(key)
}

function toggleMute() {
  const muted = engine.toggleMute()
  const btn = document.getElementById('ctl-mute')
  if (btn) {
    btn.textContent = muted ? 'Activar sonido' : 'Silenciar'
    btn.setAttribute('aria-pressed', String(muted))
    btn.classList.toggle('is-active', muted)
  }
}

function toggleRecord() {
  if (recorder.isRecording) {
    const loop = recorder.stopRecording()
    hud.setRecording(false)
    if (loop && recorder.startPlaying(loop)) {
      hud.setLoopActive(true)
      hud.showNotice('<span class="notice-title">Bucle reproduciendo</span> Sigue tocando encima: tus notas se suman a la repetición.')
      setTimeout(() => hud.hideNotice(), 4000)
    }
  } else if (recorder.isPlaying) {
    recorder.stopPlaying()
    releaseLoopNotes()
    ghost = null
    hud.setLoopActive(false)
  } else {
    recorder.startRecording()
    hud.setRecording(true)
  }
}

// ---------------------------------------------------------------------------
// Ciclo de vida: pausar con pestaña oculta, liberar al salir
// ---------------------------------------------------------------------------
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    running = false
    cancelAnimationFrame(rafId)
    scene?.stop()
    await engine.suspend() // el sonido no debe sonar con la pestaña oculta
  } else if (scene && input) {
    await engine.resume()
    running = true
    lastFrame = performance.now()
    scene.start()
    rafId = requestAnimationFrame(frame)
  }
})

window.addEventListener('pagehide', () => {
  running = false
  cancelAnimationFrame(rafId)
  for (const id of [...liveNotes.keys()]) engine.noteOff(id)
  liveNotes.clear()
  recorder.stop()
  tracker?.stop()
  fallback?.stop()
  particles?.dispose()
  scene?.dispose()
  engine.dispose()
})

// prefers-reduced-motion en caliente
reducedMotionQuery.addEventListener?.('change', () => {
  particles?.setMotion(motionScale())
})
