/**
 * Ajustes globales de Aura.
 * Los umbrales de gestos están documentados aquí a propósito: son los valores
 * que hay que tocar para adaptar la sensibilidad sin buscar dentro de la lógica.
 */

const MOBILE_BREAKPOINT = 820

export const IS_MOBILE = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches

/** Presets de partículas. `alto` es el valor por defecto del brief: 25k desktop / 10k móvil. */
export const QUALITY_PRESETS = {
  bajo: { desktop: 12000, mobile: 5000 },
  medio: { desktop: 18000, mobile: 8000 },
  alto: { desktop: 25000, mobile: 10000 },
}

/** Paletas. `stops` es el degradado del vertex shader (base → media → brillo). */
export const PALETTES = {
  dorado: { label: 'Dorado', accent: '#f2a93b', stops: ['#3d1a00', '#f2a93b', '#ffeec2'] },
  violeta: { label: 'Violeta', accent: '#8b5cf6', stops: ['#2a0a4a', '#8b5cf6', '#ead9ff'] },
  rosa: { label: 'Rosa', accent: '#ec4899', stops: ['#4a0a2e', '#ec4899', '#ffd9ec'] },
  azul: { label: 'Azul', accent: '#38bdf8', stops: ['#04203f', '#38bdf8', '#dff6ff'] },
}

/**
 * Umbrales de gestos.
 *
 * Todas las distancias se normalizan por el "tamaño de la mano": la distancia
 * entre la muñeca (landmark 0) y el MCP del dedo medio (landmark 9). Así los
 * umbrales funcionan igual esté la mano cerca o lejos de la cámara.
 */
export const GESTURES = {
  /** Distancia pulgar(4)–índice(8) / tamaño de mano por debajo de la cual hay pellizco. */
  PINCH_CLOSE: 0.35,
  /** Umbral de apertura (mayor que PINCH_CLOSE) para evitar parpadeos: histéresis. */
  PINCH_RELEASE: 0.6,
  /** Distancia mínima (en tamaños de mano) del pulgar(4) al MCP del índice(5) para dedo pulgar extendido. */
  THUMB_EXTENDED: 0.62,
  /** Un dedo se considera extendido si su punta está más lejos de la muñeca que su articulación PIP. */
  FINGER_MARGIN: 1.06,
  /** Distancia media de las puntas(8,12,16,20) a la muñeca / tamaño de mano para "mano abierta". */
  OPEN_HAND: 1.45,
  /** Mano sostenida en pellizco durante estos ms al abrirla → explosión. */
  PINCH_MIN_DURATION: 220,
  /** Banda de altura de la mano (coordenada y normalizada, 0 = arriba) por octava. */
  OCTAVE_TOP: 0.36,
  OCTAVE_BOTTOM: 0.68,
  /** Tamaño de mano (muñeca→MCP medio, en coords normalizadas) para mapear profundidad. */
  DEPTH_NEAR: 0.2,
  DEPTH_FAR: 0.09,
}

export const settings = {
  /** Prefijo de calidad: bajo | medio | alto */
  quality: 'alto',
  palette: 'dorado',
  scale: 'pentatonica',
  maxHands: 2,
  /** Ritmo de inferencia de MediaPipe (~30 Hz). El render no depende de esto. */
  inferenceIntervalMs: 33,
  /** Suavizado One-Euro: sube `beta` si el seguimiento se siente lento, baja `minCutoff` si tiembla. */
  smoothing: { minCutoff: 1.2, beta: 0.02, dCutoff: 1 },
  /** Voces simultáneas máximas para no saturar la mezcla. */
  maxSimultaneousNotes: 6,
  /** Volumen inicial 0..1 */
  volume: 0.8,
  get particleCount() {
    return QUALITY_PRESETS[this.quality][IS_MOBILE ? 'mobile' : 'desktop']
  },
}

/** Valores admitidos por los parámetros de la URL (lista blanca, se sanitiza todo). */
export const URL_PARAM_VALUES = {
  palette: Object.keys(PALETTES),
  scale: ['pentatonica', 'mayor', 'menor'],
  particles: Object.keys(QUALITY_PRESETS),
}

/**
 * Lee y sanitiza los parámetros de la URL (?palette=rosa&scale=mayor&particles=bajo).
 * Cualquier valor fuera de la lista blanca se ignora y se usa el valor por defecto.
 */
export function readUrlParams(search = window.location.search) {
  const params = new URLSearchParams(search)
  const pick = (key, allowed, fallback) => {
    const raw = (params.get(key) || '').trim().toLowerCase()
    return allowed.includes(raw) ? raw : fallback
  }
  return {
    palette: pick('palette', URL_PARAM_VALUES.palette, settings.palette),
    scale: pick('scale', URL_PARAM_VALUES.scale, settings.scale),
    particles: pick('particles', URL_PARAM_VALUES.particles, settings.quality),
  }
}
