/**
 * HandTracker: cámara + MediaPipe HandLandmarker.
 *
 * La inferencia se limita a ~30 Hz (inferenceIntervalMs) y corre en su propio
 * bucle: el renderer de Three.js nunca espera por la visión por computadora.
 * Devuelve landmarks ya suavizados; la interpretación de gestos ocurre fuera.
 */
import { settings } from '../config/settings.js'
import { HandSmoother } from './smoothing.js'

/**
 * MediaPipe carga el JS/WASM del fileset dentro de su propio módulo; ahí una
 * ruta relativa podría resolverse contra el origen equivocado (p. ej. blob:).
 * La absolutamos contra el documento para que funcione en /, /subcarpeta/ o iframe.
 */
const absolute = (url) => new URL(url, document.baseURI).href

const WASM_DIR = `${import.meta.env.BASE_URL}wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`

export class HandTrackerError extends Error {
  constructor(message, cause) {
    super(message, { cause })
    this.name = 'HandTrackerError'
  }
}

export class HandTracker {
  constructor({ maxHands = settings.maxHands, inferenceIntervalMs = settings.inferenceIntervalMs } = {}) {
    this.maxHands = maxHands
    this.inferenceIntervalMs = inferenceIntervalMs
    this.smoother = new HandSmoother(maxHands, [
      settings.smoothing.minCutoff,
      settings.smoothing.beta,
      settings.smoothing.dCutoff,
    ])
    this.hands = []
    this.video = null
    this.stream = null
    this.landmarker = null
    this.running = false
    this.lastInference = 0
    this.lastVideoTime = -1
    this._loop = this._loop.bind(this)
    this.rafId = 0
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new HandTrackerError('Este navegador no soporta acceso a la cámara.')
    }

    try {
      this.landmarker = await this.#createLandmarker()
    } catch (err) {
      throw new HandTrackerError('No se pudo cargar el modelo de detección de manos.', err)
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
    } catch (err) {
      this.#releaseLandmarker()
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        throw new HandTrackerError('Permiso de cámara denegado.', err)
      }
      if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        throw new HandTrackerError('No se encontró ninguna cámara conectada.', err)
      }
      throw new HandTrackerError('No se pudo abrir la cámara.', err)
    }

    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.muted = true
    this.video.autoplay = true
    this.video.srcObject = this.stream
    await this.video.play().catch(() => {
      // El autoplay puede ser bloqueado; el evento loadedmetadata basta para inferir.
    })

    this.running = true
    this.lastInference = 0
    this.rafId = requestAnimationFrame(this._loop)
    return this.video
  }

  async #createLandmarker() {
    // Import dinámico: MediaPipe solo se descarga al activar la cámara
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(absolute(WASM_DIR))
    const options = {
      baseOptions: { modelAssetPath: absolute(MODEL_URL), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: this.maxHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
    try {
      return await HandLandmarker.createFromOptions(fileset, options)
    } catch {
      // Sin GPU o WebGL reducida: reintentamos en CPU antes de rendirnos.
      return HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: absolute(MODEL_URL), delegate: 'CPU' },
      })
    }
  }

  _loop(now) {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this._loop)

    const video = this.video
    if (!video || video.readyState < 2 || video.currentTime === this.lastVideoTime) return
    if (now - this.lastInference < this.inferenceIntervalMs) return

    const dt = Math.max((now - (this.lastInference || now)) / 1000, 1e-3)
    this.lastInference = now
    this.lastVideoTime = video.currentTime

    try {
      // detectForVideo exige marcas de tiempo estrictamente crecientes.
      const timestamp = Math.max(now, (this._lastTs || 0) + 1)
      this._lastTs = timestamp
      const result = this.landmarker.detectForVideo(video, timestamp)
      const hands = (result.landmarks || []).map((landmarks, i) => ({
        landmarks,
        handedness: result.handedness?.[i]?.[0]?.categoryName || 'Right',
        score: result.handedness?.[i]?.[0]?.score ?? 1,
      }))
      this.hands = this.smoother.smooth(hands, dt, now)
    } catch (err) {
      // Un frame problemático no debe tumbar la sesión; se reintentará en el siguiente.
      console.warn('[HandTracker] inferencia fallida:', err)
    }
  }

  /** Últimos landmarks suavizados (hasta maxHands). */
  getHands() {
    return this.hands
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }
    this.smoother.reset()
    this.hands = []
    this.#releaseLandmarker()
  }

  #releaseLandmarker() {
    if (this.landmarker) {
      this.landmarker.close?.()
      this.landmarker = null
    }
  }
}
