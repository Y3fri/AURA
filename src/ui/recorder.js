/**
 * recorder: graba la interpretación como eventos con timestamp (no video)
 * y la reproduce en bucle, permitiendo seguir tocando encima.
 *
 * Eventos: noteOn · noteOff · burst. Al reproducir, el "fantasma" alimenta el
 * slot 2 de los uniforms para que las partículas también revivan el gesto.
 */

const clone = (e) => ({ ...e })

export class InterpretationRecorder {
  constructor({ onEvent } = {}) {
    this.onEvent = onEvent
    this.state = 'idle' // idle | recording | playing
    this.events = []
    this.startedAt = 0
    this.duration = 0
    this.playIndex = 0
    this.playStartedAt = 0
    this.lastLoopAt = 0
  }

  get isRecording() {
    return this.state === 'recording'
  }

  get isPlaying() {
    return this.state === 'playing'
  }

  record(type, data) {
    if (this.state !== 'recording') return
    this.events.push({ type, at: performance.now() - this.startedAt, ...data })
  }

  startRecording() {
    this.stop()
    this.events = []
    this.startedAt = performance.now()
    this.duration = 0
    this.state = 'recording'
  }

  /** Devuelve la interpretación grabada o null si fue demasiado corta. */
  stopRecording() {
    if (this.state !== 'recording') return null
    this.duration = performance.now() - this.startedAt
    this.state = 'idle'
    if (this.duration < 400) return null
    return { duration: this.duration, events: this.events.map(clone) }
  }

  startPlaying(loop) {
    if (!loop?.events?.length) return false
    this.loop = loop
    // id estable por evento → la misma nota se libera antes de re-atacar en cada vuelta
    loop.events.forEach((e, i) => {
      e.loopId = `loop-${i}`
    })
    this.playIndex = 0
    this.playStartedAt = performance.now()
    this.state = 'playing'
    return true
  }

  stopPlaying() {
    if (this.state === 'playing') this.state = 'idle'
    this.loop = null
  }

  stop() {
    this.stopPlaying()
    this.state = 'idle'
  }

  /**
   * Avanza el reproductor: devuelve los eventos del bucle ocurridos en este frame
   * y la posición normalizada (0..1) del fantasma para la escena.
   * @returns {{ due: object[], ghost: {x:number,y:number}|null }}
   */
  update() {
    if (this.state !== 'playing' || !this.loop) return { due: [], ghost: null }

    const now = performance.now() - this.playStartedAt
    const { duration, events } = this.loop

    // Vuelta al inicio del bucle
    if (now >= duration) {
      this.playStartedAt += duration
      this.playIndex = 0
      const result = this.update()
      return { ...result, restarted: true }
    }

    const due = []
    while (this.playIndex < events.length && events[this.playIndex].at <= now) {
      due.push(events[this.playIndex])
      this.playIndex += 1
    }

    // El fantasma se posiciona en la última notaOn reciente (y se desvanece si no hay)
    let ghost = null
    for (let i = this.playIndex - 1; i >= 0; i--) {
      const e = events[i]
      if (e.type === 'noteOn' && e.x != null) {
        ghost = { x: e.x, y: e.y }
        break
      }
    }

    return { due, ghost }
  }
}
