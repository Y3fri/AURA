/**
 * Escala → frecuencias.
 * Por defecto, pentatónica menor (A C D E G): sin semitonos, no puede sonar mal.
 */
import * as Tone from 'tone'

export const SCALES = {
  pentatonica: {
    label: 'Pentatónica',
    /** grados relativos en semitonos desde la tónica */
    intervals: [0, 3, 5, 7, 10],
  },
  mayor: {
    label: 'Mayor',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  menor: {
    label: 'Menor natural',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
}

const TONIC_MIDI = 57 // A3 → la referencia hace que el rango quede cómodo
const MAX_MIDI = 96 // C7: acotar evita frecuencias agudas chillonas

export function getScale(name) {
  return SCALES[name] || SCALES.pentatonica
}

/**
 * Nota de la escala para el índice `degree` (0-based) en la octava `octaveShift`.
 * Se envuelve por octavas al estilo piano: degree 5 = grado 0 de la octava arriba.
 */
export function frequencyForDegree(name, degree, octaveShift = 0) {
  const { intervals } = getScale(name)
  const n = intervals.length
  const octave = Math.floor(degree / n)
  const step = intervals[((degree % n) + n) % n]
  const midi = Math.min(MAX_MIDI, TONIC_MIDI + octave * 12 + step + octaveShift * 12)
  return Tone.Midi(midi).toFrequency()
}

/** Nombre visible de un grado (p. ej. "La3"), calculado desde el mismo MIDI que sonará. */
export function degreeLabel(name, degree) {
  const { intervals } = getScale(name)
  const n = intervals.length
  const names = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
  const midi = TONIC_MIDI + Math.floor(degree / n) * 12 + intervals[degree % n]
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`
}
