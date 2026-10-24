/**
 * Modo respaldo: el cursor (o el dedo táctil) actúa como mano virtual.
 *
 * Genera landmarks sintéticos de 21 puntos con la misma forma que devuelve
 * MediaPipe, de modo que TODO el pipeline de gestos (gestures.js) funciona
 * sin saber si la entrada viene de la cámara o del puntero.
 *
 * Interacción:
 *   - Mover  → melodía: la posición X elige la nota de la escala (5 bandas).
 *   - Clic sostenido → pellizco (las partículas se concentran).
 *   - Soltar tras ≥200 ms → explosión + golpe de sonido.
 *   - Altura del puntero → octava, igual que en modo cámara.
 */

const HAND_SCALE = 0.26 // tamaño de la mano virtual en coordenadas normalizadas

/**
 * Esqueleto de mano abierto en unidades locales: x a la derecha, y hacia arriba
 * (el eje Y de MediaPipe crece hacia abajo, por eso los dedos tienen y negativa).
 */
const OPEN_TEMPLATE = [
  [0, 0, 0], // 0 muñeca
  [-0.28, 0.1, -0.3], [-0.42, 0.24, -0.3], [-0.52, 0.36, -0.3], [-0.6, 0.46, -0.3], // 1-4 pulgar
  [-0.18, -0.5, 0], [-0.2, -0.7, 0], [-0.21, -0.85, 0], [-0.22, -0.97, 0], // 5-8 índice
  [0, -0.53, 0], [0, -0.77, 0], [0, -0.92, 0], [0, -1.05, 0], // 9-12 medio
  [0.17, -0.5, 0], [0.2, -0.72, 0], [0.22, -0.85, 0], [0.24, -0.96, 0], // 13-16 anular
  [0.32, -0.43, 0], [0.37, -0.6, 0], [0.4, -0.71, 0], [0.43, -0.8, 0], // 17-20 meñique
]

/**
 * Articulaciones retraídas por dedo. La regla de gestures.js ("extendido si la
 * punta está más lejos de la muñeca que su PIP") queda satisfecha solo para el
 * dedo activo; el resto queda claramente encogido.
 * Los índices son los landmarks: PIP/DIP/punta de cada dedo.
 */
const CURLED = {
  1: [-0.2, 0.05, -0.1], 2: [-0.24, -0.02, -0.1], 3: [-0.2, -0.06, -0.1], 4: [-0.14, -0.08, -0.1], // pulgar
  6: [-0.1, -0.55, 0], 7: [-0.04, -0.45, 0], 8: [0.03, -0.4, 0], // índice
  10: [0, -0.5, 0], 11: [0, -0.4, 0], 12: [0.02, -0.35, 0], // medio
  14: [0.1, -0.5, 0], 15: [0.06, -0.4, 0], 16: [0.08, -0.35, 0], // anular
  18: [0.2, -0.4, 0], 19: [0.18, -0.3, 0], 20: [0.18, -0.26, 0], // meñique
}

/** landmarks de cada dedo (para saber qué pertenece a cada grado de la escala). */
const FINGER_LANDMARKS = [
  [1, 2, 3, 4], // 0 pulgar
  [5, 6, 7, 8], // 1 índice
  [9, 10, 11, 12], // 2 medio
  [13, 14, 15, 16], // 3 anular
  [17, 18, 19, 20], // 4 meñique
]

const isUIControl = (target) =>
  target instanceof Element && target.closest('button, select, input, label, a')

export class MouseFallbackInput {
  constructor({ onBurst } = {}) {
    this.onBurst = onBurst
    this.pointers = new Map() // pointerId → { x, y, pinchSince } (dedos táctiles)
    this.hover = { x: 0.5, y: 0.5 }
    this.hasHover = false
    this.active = false
    this._bound = {
      move: this._onMove.bind(this),
      down: this._onDown.bind(this),
      up: this._onUp.bind(this),
      cancel: this._onCancel.bind(this),
      leave: this._onLeave.bind(this),
      blur: this._onBlur.bind(this),
    }
  }

  start() {
    if (this.active) return
    this.active = true
    window.addEventListener('pointermove', this._bound.move, { passive: true })
    window.addEventListener('pointerdown', this._bound.down, { passive: true })
    window.addEventListener('pointerup', this._bound.up, { passive: true })
    window.addEventListener('pointercancel', this._bound.cancel, { passive: true })
    document.documentElement.addEventListener('pointerleave', this._bound.leave, { passive: true })
    window.addEventListener('blur', this._bound.blur)
  }

  stop() {
    if (!this.active) return
    this.active = false
    window.removeEventListener('pointermove', this._bound.move)
    window.removeEventListener('pointerdown', this._bound.down)
    window.removeEventListener('pointerup', this._bound.up)
    window.removeEventListener('pointercancel', this._bound.cancel)
    document.documentElement.removeEventListener('pointerleave', this._bound.leave)
    window.removeEventListener('blur', this._bound.blur)
    this.pointers.clear()
    this.hasHover = false
  }

  _pos(e) {
    return {
      x: Math.min(1, Math.max(0, e.clientX / window.innerWidth)),
      y: Math.min(1, Math.max(0, e.clientY / window.innerHeight)),
    }
  }

  _onMove(e) {
    const pos = this._pos(e)
    const p = this.pointers.get(e.pointerId)
    if (p) {
      p.x = pos.x
      p.y = pos.y
    } else {
      this.hover = pos
      this.hasHover = true
    }
  }

  _onDown(e) {
    if (isUIControl(e.target)) return // los clics en la interfaz no son gestos
    const pos = this._pos(e)
    this.pointers.set(e.pointerId, { ...pos, pinchSince: performance.now() })
    this.hover = pos
    this.hasHover = true
  }

  _onUp(e) {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    // Soltar tras sostener el pellizco = explosión (equivalente a abrir la mano)
    if (performance.now() - p.pinchSince > 200) this.onBurst?.(p.x, p.y)
    this.pointers.delete(e.pointerId)
  }

  _onCancel(e) {
    this.pointers.delete(e.pointerId)
  }

  _onLeave() {
    // Sin puntero sobre la ventana no hay mano: la escena vuelve a reposo
    this.hasHover = false
  }

  _onBlur() {
    this.pointers.clear()
    this.hasHover = false
  }

  /**
   * Construye una mano virtual en (x, y).
   * `zone` (0..4) decide qué dedo está levantado → la melodía.
   * `pinch` cierra pulgar+índice para que gestures.js detecte el pellizco.
   */
  #buildHand(x, y, zone, pinch) {
    const lms = OPEN_TEMPLATE.map(([lx, ly, lz], i) => {
      let [px, py, pz] = [lx, ly, lz]

      // El dedo activo se mantiene extendido; el resto (incluido el pulbar) se encoge
      const activeFinger = FINGER_LANDMARKS.findIndex((group) => group.includes(i))
      if (activeFinger !== zone && CURLED[i]) {
        ;[px, py, pz] = CURLED[i]
      }

      if (pinch && (i === 3 || i === 4)) {
        // Pulgar e índice superpuestos en la punta del índice → distancia ≈ 0
        const [, , iz] = OPEN_TEMPLATE[8]
        px = OPEN_TEMPLATE[8][0] + (i === 4 ? 0.01 : -0.02)
        py = OPEN_TEMPLATE[8][1] + 0.02
        pz = iz - 0.05
      }

      return { x: x + px * HAND_SCALE, y: y + py * HAND_SCALE, z: pz }
    })
    return { landmarks: lms, handedness: 'Virtual' }
  }

  /** Devuelve las manos virtuales en el mismo formato que HandTracker. */
  getHands() {
    const hands = []
    for (const p of this.pointers.values()) {
      if (hands.length >= 2) break
      hands.push(this.#buildHand(p.x, p.y, this.#zoneFor(p.x), true))
    }
    if (hands.length === 0 && this.hasHover) {
      // El hover muestra la mano siempre: así las partículas siguen al cursor
      hands.push(this.#buildHand(this.hover.x, this.hover.y, this.#zoneFor(this.hover.x), false))
    }
    return hands
  }

  /** Zona melódica: 5 bandas horizontales → grado 0..4 de la escala. */
  #zoneFor(x) {
    return Math.min(4, Math.max(0, Math.floor(x * 5)))
  }

  get mode() {
    return 'mouse'
  }
}
