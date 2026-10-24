/**
 * Interpretación de landmarks de mano en gestos.
 * Funciones puras: entran 21 landmarks, salen booleanos y valores normalizados.
 *
 * Convención de landmarks (MediaPipe Hand):
 *   0 muñeca · 1-4 pulgar · 5-8 índice · 9-12 medio · 13-16 anular · 17-20 meñique
 */
import { GESTURES } from '../config/settings.js'

export const FINGER_TIPS = [4, 8, 12, 16, 20]
export const FINGER_PIPS = [3, 6, 10, 14, 18]
/** Landmarks que forman la palma (para calcular el centro de atracción). */
const PALM = [0, 5, 9, 13, 17]

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0))

/** Distancia de referencia: muñeca → MCP del dedo medio. */
export const handSize = (lms) => Math.max(dist2(lms[0], lms[9]), 1e-5)

/**
 * Centro de la palma: media de muñeca y MCPs. Más estable que cualquier
 * landmark puntual para anclar la nube de partículas.
 */
export function palmCenter(lms) {
  const sum = PALM.reduce(
    (acc, i) => ({ x: acc.x + lms[i].x, y: acc.y + lms[i].y, z: acc.z + (lms[i].z || 0) }),
    { x: 0, y: 0, z: 0 },
  )
  const n = PALM.length
  return { x: sum.x / n, y: sum.y / n, z: sum.z / n }
}

/**
 * Pellizco con histéresis: `prev` decide en la zona gris entre umbrales
 * para que la señal no parpadee alrededor del valor límite.
 */
export function isPinching(lms, prev = false) {
  const ratio = dist3(lms[4], lms[8]) / handSize(lms)
  if (prev) return ratio < GESTURES.PINCH_RELEASE
  return ratio < GESTURES.PINCH_CLOSE
}

/**
 * Dedos extendidos: la punta está más lejos de la muñeca que su articulación
 * PIP. Es invariante a la orientación de la mano (no depende de ángulos absolutos).
 * El pulgar usa una regla propia porque su PIP queda muy cerca de la base.
 */
export function extendedFingers(lms) {
  const wrist = lms[0]
  const size = handSize(lms)
  const thumbOut = dist2(lms[4], lms[5]) / size > GESTURES.THUMB_EXTENDED
  const fingers = FINGER_TIPS.slice(1).map((tip, i) => {
    const pip = lms[FINGER_PIPS[i + 1]]
    return dist2(lms[tip], wrist) > dist2(pip, wrist) * GESTURES.FINGER_MARGIN
  })
  return [thumbOut, ...fingers]
}

/** Mano abierta: distancia media de las puntas de los 4 dedos a la muñeca. */
export function isOpenHand(lms) {
  const size = handSize(lms)
  const tips = [8, 12, 16, 20]
  const avg = tips.reduce((sum, i) => sum + dist2(lms[i], lms[0]), 0) / tips.length
  return avg / size > GESTURES.OPEN_HAND
}

/** Octava por altura: arriba = +1, centro = 0, abajo = -1 (y normalizado, 0 arriba). */
export function octaveFromHeight(y) {
  if (y < GESTURES.OCTAVE_TOP) return 1
  if (y > GESTURES.OCTAVE_BOTTOM) return -1
  return 0
}

/**
 * Profundidad 0..1 por tamaño aparente de la mano (más grande = más cerca).
 * Controla volumen y tamaño de partículas.
 */
export function depthFromSize(lms) {
  const size = handSize(lms)
  const t = (size - GESTURES.DEPTH_FAR) / (GESTURES.DEPTH_NEAR - GESTURES.DEPTH_FAR)
  return Math.min(1, Math.max(0, t))
}

/**
 * Analiza una mano completa y devuelve todo lo que la escena y el audio necesitan.
 * `prevPinch` mantiene la histéresis del pellizco entre frames.
 */
export function analyzeHand(lms, prevPinch = false) {
  const center = palmCenter(lms)
  return {
    landmarks: lms,
    center,
    tips: FINGER_TIPS.map((i) => lms[i]),
    fingers: extendedFingers(lms),
    pinch: isPinching(lms, prevPinch),
    open: isOpenHand(lms),
    height: center.y,
    depth: depthFromSize(lms),
    span: handSize(lms),
  }
}
