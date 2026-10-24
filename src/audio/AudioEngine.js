/**
 * AudioEngine: sintetizador suave + reverb, límite de voces y volumen.
 *
 * Cadena de señal: PolySynth → Filtro → Reverb (dry/wet) → Analyser → Limiter → Destino.
 * El Limiter es la red de seguridad final: aunque se apilen notas, la salida
 * nunca supera -1 dBFS y no se satura la grabación del video.
 */
import * as Tone from 'tone'
import { settings } from '../config/settings.js'
import { frequencyForDegree } from './scales.js'

export class AudioEngine {
  constructor() {
    this.started = false
    this.scale = settings.scale
    this.volume = settings.volume
    this.muted = false
    this.analyser = null
    this.activeNotes = new Map() // notaId → { synthVoice, degree }
    this.ambient = null
    this.ambientGain = 1
  }

  /** Debe llamarse tras un gesto del usuario (botón de la pantalla inicial). */
  async start() {
    if (this.started) return
    await Tone.start()

    this.limiter = new Tone.Limiter(-1).toDestination()

    this.reverb = new Tone.Reverb({ decay: 3.5, preDelay: 0.02, wet: 0.35 })
    this.reverb.connect(this.limiter)

    this.filter = new Tone.Filter(2400, 'lowpass').connect(this.reverb)
    this.dry = new Tone.Gain(0.65).connect(this.limiter)
    this.filter.connect(this.dry)

    this.analyser = new Tone.Analyser('waveform', 256)
    this.filter.connect(this.analyser)

    this.synth = new Tone.PolySynth(Tone.FMSynth, {
      maxPolyphony: settings.maxSimultaneousNotes,
      volume: -8,
      harmonicity: 2.01,
      modulationIndex: 3,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.35, release: 1.1 },
      modulation: { type: 'triangle' },
      modulationEnvelope: { attack: 0.04, decay: 0.2, sustain: 0.1, release: 0.6 },
    }).connect(this.filter)

    // Pad ambiente: casi inaudible, sube cuando no hay manos (reposo).
    // Filtro propio para no oscurecer las notas al mover el ambiente.
    this.padFilter = new Tone.Filter(900, 'lowpass')
    this.ambientGainNode = new Tone.Gain(0).connect(this.filter)
    this.padFilter.connect(this.ambientGainNode)
    this.ambient = new Tone.PolySynth(Tone.Synth, {
      volume: -26,
      oscillator: { type: 'triangle' },
      envelope: { attack: 1.5, decay: 2, sustain: 0.6, release: 4 },
    }).connect(this.padFilter)

    const ambientNotes = ['A2', 'E3']
    this.ambient.triggerAttack(ambientNotes)
    this.ambient.triggerAttack(ambientNotes[1])
    this.ambientGainNode.gain.value = 0.22 // arranque en reposo (presencia 1)

    this.setVolume(this.volume)
    this.started = true
  }

  get ready() {
    return this.started
  }

  /** Nota nueva (degree de la escala en la octava dada). Devuelve un id. */
  noteOn({ id, degree, octave = 0 }) {
    if (!this.started || this.activeNotes.has(id)) return
    if (this.activeNotes.size >= settings.maxSimultaneousNotes) this.#stealVoice()
    const freq = frequencyForDegree(this.scale, degree, octave)
    this.synth.triggerAttack(freq, Tone.now())
    this.activeNotes.set(id, { freq, degree })
    return freq
  }

  noteOff(id) {
    if (!this.started) return
    const note = this.activeNotes.get(id)
    if (!note) return
    this.synth.triggerRelease(note.freq, Tone.now())
    this.activeNotes.delete(id)
  }

  /** Golpe de percusión para la explosión: ruido filtrado, corto y seguro. */
  burst(intensity = 1) {
    if (!this.started) return
    const now = Tone.now()
    const osc = new Tone.Oscillator({
      frequency: 160 * (1 + intensity * 0.4),
      type: 'sine',
      volume: -10,
    }).connect(this.limiter)
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.35)
    osc.start(now)
    osc.stop(now + 0.4)
    // Tone usa Emitter, no eventos DOM: la liberación por tiempo es lo fiable aquí
    setTimeout(() => osc.dispose(), 700)

    // Capa de textura con reverb
    const hit = new Tone.MembraneSynth({ volume: -8 }).connect(this.reverb)
    hit.triggerAttackRelease('A1', '8n', now, 0.8)
    setTimeout(() => hit.dispose(), 1200)
  }

  #stealVoice() {
    // Robo de voz FIFO: la primera nota en soltar sitio evita distorsión por polyfonía.
    const first = this.activeNotes.keys().next().value
    if (first) this.noteOff(first)
  }

  /** Presencia del pad según actividad: 1 = manos quietas/reposo, 0 = tocando. */
  setAmbientPresence(presence) {
    if (!this.started) return
    this.ambientGain = Math.min(1, Math.max(0, presence))
    // Solo sube el pad en reposo; las notas nunca pasan por este gain
    this.ambientGainNode.gain.rampTo(0.22 * this.ambientGain, 0.8)
  }

  /** Nivel RMS 0..1 para que las partículas reaccionen al sonido. */
  getLevel() {
    if (!this.started || !this.analyser) return 0
    const values = this.analyser.getValue()
    let sum = 0
    for (let i = 0; i < values.length; i++) sum += values[i] * values[i]
    const rms = Math.sqrt(sum / values.length)
    return Math.min(1, rms * 6)
  }

  setScale(scale) {
    this.scale = scale
    // Notas activas de otra escala se liberan para no dejar frecuencias colgadas
    for (const id of [...this.activeNotes.keys()]) this.noteOff(id)
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.started) {
      Tone.Destination.volume.rampTo(this.muted ? -Infinity : Tone.gainToDb(this.volume), 0.1)
    }
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.started) {
      Tone.Destination.volume.rampTo(this.muted ? -Infinity : Tone.gainToDb(this.volume), 0.1)
    }
    return this.muted
  }

  /** Liberar todo al ocultar/cerrar la pestaña. */
  async dispose() {
    if (!this.started) return
    for (const id of [...this.activeNotes.keys()]) this.noteOff(id)
    this.ambient?.releaseAll()
    this.synth?.releaseAll()
    this.ambient?.dispose()
    this.synth?.dispose()
    this.ambientGainNode?.dispose()
    this.padFilter?.dispose()
    this.filter?.dispose()
    this.reverb?.dispose()
    this.dry?.dispose()
    this.analyser?.dispose()
    this.limiter?.dispose()
    try {
      await this.#contextCall('close')
    } catch (err) {
      console.warn('[AudioEngine] no se pudo cerrar el contexto:', err)
    }
    this.started = false
  }

  /** Pausa el contexto de audio cuando la pestaña queda oculta. */
  async suspend() {
    if (!this.started) return
    try {
      await this.#contextCall('suspend')
    } catch (err) {
      console.warn('[AudioEngine] suspend() no disponible:', err)
    }
  }

  async resume() {
    if (!this.started) return
    try {
      await this.#contextCall('resume')
    } catch (err) {
      console.warn('[AudioEngine] resume() no disponible:', err)
    }
  }

  async #contextCall(method) {
    const ctx = Tone.getContext()
    if (typeof ctx[method] === 'function') return ctx[method]()
    if (typeof ctx.rawContext?.[method] === 'function') return ctx.rawContext[method]()
    throw new Error(`${method} no soportado`)
  }
}
