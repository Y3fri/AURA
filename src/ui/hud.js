/**
 * hud: nota actual, estado de la cámara, controles y ayuda de gestos.
 * También dibuja la vista previa espejada con los puntos de la mano.
 */
import { PALETTES } from '../config/settings.js'
import { SCALES } from '../audio/scales.js'

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

export function createHud({ onPalette, onScale, onVolume, onMute, onRecord }) {
  const $ = (id) => document.getElementById(id)
  const els = {
    status: $('hud-status'),
    note: $('hud-note'),
    mode: $('hud-mode'),
    palette: $('ctl-palette'),
    scale: $('ctl-scale'),
    volume: $('ctl-volume'),
    mute: $('ctl-mute'),
    record: $('ctl-record'),
    loopBadge: $('hud-loop'),
    helpList: $('help-list'),
    notice: $('notice'),
    previewWrap: $('preview-wrap'),
    overlay: $('preview-overlay'),
  }

  // Selectores poblados desde los catálogos (una sola fuente de verdad)
  if (els.palette) {
    els.palette.innerHTML = Object.entries(PALETTES)
      .map(([key, p]) => `<option value="${key}">${p.label}</option>`)
      .join('')
    els.palette.addEventListener('change', () => onPalette?.(els.palette.value))
  }
  if (els.scale) {
    els.scale.innerHTML = Object.entries(SCALES)
      .map(([key, s]) => `<option value="${key}">${s.label}</option>`)
      .join('')
    els.scale.addEventListener('change', () => onScale?.(els.scale.value))
  }

  els.volume?.addEventListener('input', () => onVolume?.(Number(els.volume.value) / 100))
  els.mute?.addEventListener('click', () => onMute?.())
  els.record?.addEventListener('click', () => onRecord?.())

  const ctx = els.overlay?.getContext('2d')

  return {
    els,

    setPalette(key) {
      if (els.palette) els.palette.value = key
      document.documentElement.style.setProperty('--accent', PALETTES[key]?.accent || '#f2a93b')
    },

    setScale(key) {
      if (els.scale) els.scale.value = key
    },

    setVolume(v) {
      if (els.volume) els.volume.value = String(Math.round(v * 100))
    },

    /** 'live' | 'fallback' | 'starting' */
    setStatus(state) {
      if (!els.status) return
      els.status.dataset.state = state
      const text = { live: 'Cámara activa', fallback: 'Modo mouse', starting: 'Conectando…' }[state] || state
      els.status.querySelector('.status-label').textContent = text
      if (els.mode) {
        els.mode.textContent = state === 'live' ? 'Control por manos' : 'Control por mouse / táctil'
      }
    },

    setNote(text) {
      if (!els.note) return
      els.note.textContent = text || '—'
      els.note.classList.toggle('is-active', Boolean(text))
    },

    setRecording(on) {
      els.record?.classList.toggle('is-recording', on)
      const label = els.record?.querySelector('.record-label')
      if (label) label.textContent = on ? 'Detener' : 'Grabar'
    },

    setLoopActive(on) {
      if (els.loopBadge) els.loopBadge.hidden = !on
    },

    showNotice(html) {
      if (!els.notice) return
      els.notice.hidden = false
      els.notice.innerHTML = html
    },

    hideNotice() {
      if (els.notice) els.notice.hidden = true
    },

    setHelp(mode) {
      if (!els.helpList) return
      const cameraItems = [
        '<b>Acerca la mano</b> a la cámara: las partículas la siguen.',
        '<b>Levanta un dedo</b> para tocar una nota (cada dedo = una nota).',
        '<b>Pellizca</b> pulgar e índice: la nube se concentra.',
        '<b>Abre la mano</b> tras el pellizco: explosión de luz y sonido.',
        '<b>Altura</b> cambia la octava · <b>distancia</b> cambia volumen y tamaño.',
      ]
      const mouseItems = [
        '<b>Mueve el cursor</b>: cambia la nota (5 bandas horizontales).',
        '<b>Altura del cursor</b> cambia la octava.',
        '<b>Clic sostenido</b> = pellizco: la nube se concentra.',
        '<b>Soltar</b> tras un pellizco: explosión de luz y sonido.',
      ]
      const items = mode === 'mouse' ? mouseItems : cameraItems
      els.helpList.innerHTML = items.map((t) => `<li>${t}</li>`).join('')
    },

    /** Vista previa espejada + landmarks. Se llama a ~30 FPS desde el bucle principal. */
    drawPreview(hands) {
      if (!ctx || !els.overlay || els.previewWrap?.hidden) return
      const w = (els.overlay.width = els.previewWrap.clientWidth || 160)
      const h = (els.overlay.height = els.previewWrap.clientHeight || 120)
      ctx.clearRect(0, 0, w, h)
      if (!hands?.length) return

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f2a93b'
      for (const hand of hands) {
        const pts = hand.landmarks.map((p) => ({ x: (1 - p.x) * w, y: p.y * h })) // espejo
        ctx.strokeStyle = accent
        ctx.globalAlpha = 0.9
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.moveTo(pts[a].x, pts[a].y)
          ctx.lineTo(pts[b].x, pts[b].y)
        }
        ctx.stroke()
        ctx.fillStyle = '#fff'
        for (const p of pts) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    },

    dispose() {
      els.palette?.replaceWith(els.palette.cloneNode(true))
      els.scale?.replaceWith(els.scale.cloneNode(true))
    },
  }
}
