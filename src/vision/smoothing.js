/**
 * Suavizado de landmarks con filtro One-Euro.
 *
 * Un filtro pasa-bajos simple o retiene el temblor o se siente atrasado;
 * One-Euro ajusta el corte según la velocidad: quieto = mucho suavizado,
 * movimiento rápido = poca latencia. Ideal para manos.
 */

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

const lowPass = (prev, x, a) => a * x + (1 - a) * prev

export class OneEuroFilter {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.xPrev = null
    this.dxPrev = 0
  }

  filter(x, dt) {
    if (this.xPrev === null) {
      this.xPrev = x
      return x
    }
    const safeDt = Math.max(dt, 1e-3)
    const dx = (x - this.xPrev) / safeDt
    const edx = lowPass(this.dxPrev, dx, alpha(this.dCutoff, safeDt))
    this.dxPrev = edx
    // A mayor velocidad instantánea, mayor corte → menos suavizado y menos lag
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    const filtered = lowPass(this.xPrev, x, alpha(cutoff, safeDt))
    this.xPrev = filtered
    return filtered
  }

  reset() {
    this.xPrev = null
    this.dxPrev = 0
  }
}

/** Filtro por punto 3D (x, y, z de un landmark). */
class Point3Filter {
  constructor(opts) {
    this.fx = new OneEuroFilter(...opts)
    this.fy = new OneEuroFilter(...opts)
    this.fz = new OneEuroFilter(...opts)
  }

  filter(p, dt) {
    return { x: this.fx.filter(p.x, dt), y: this.fy.filter(p.y, dt), z: this.fz.filter(p.z || 0, dt) }
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
  }
}

/**
 * Mantiene un suavizador por "ranura" de mano (índice estable entre frames)
 * y lo reinicia si la mano desaparece demasiado tiempo, para que una mano
 * nueva no arrastre la posición de la anterior.
 */
export class HandSmoother {
  constructor(maxHands = 2, opts = []) {
    this.slots = Array.from({ length: maxHands }, () => ({
      filter: new Point3Filter(opts),
      lastSeen: 0,
    }))
  }

  smooth(hands, dt, now = performance.now()) {
    return hands.slice(0, this.slots.length).map((hand, i) => {
      const slot = this.slots[i]
      if (now - slot.lastSeen > 300) slot.filter.reset()
      slot.lastSeen = now
      return {
        ...hand,
        landmarks: hand.landmarks.map((p) => slot.filter.filter(p, dt)),
      }
    })
  }

  reset() {
    this.slots.forEach((s) => {
      s.filter.reset()
      s.lastSeen = 0
    })
  }
}
