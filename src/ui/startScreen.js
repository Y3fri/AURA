/**
 * startScreen: pantalla inicial con la llamada a la acción.
 * El clic del usuario es el gesto que permite arrancar cámara y Tone.start().
 */
import gsap from 'gsap'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function createStartScreen({ onStart, onBlocked }) {
  const screen = document.getElementById('start-screen')
  const button = document.getElementById('start-button')
  const errorBox = document.getElementById('start-error')

  if (!screen || !button) {
    onBlocked?.('No se encontró la pantalla inicial.')
    return { hide: () => {}, showError: () => {} }
  }

  let busy = false

  button.addEventListener('click', async () => {
    if (busy) return
    busy = true
    button.disabled = true
    button.classList.add('is-loading')
    const label = button.querySelector('.button-label')
    if (label) label.textContent = 'Preparando…'
    try {
      await onStart()
      hide()
    } catch (err) {
      showError(err?.message || 'No se pudo iniciar. Revisa los permisos del navegador.')
      button.disabled = false
      button.classList.remove('is-loading')
      if (label) label.textContent = 'Intentar de nuevo'
      busy = false
    }
  })

  function showError(message) {
    if (!errorBox) return
    errorBox.hidden = false
    errorBox.textContent = message
    if (!reducedMotion()) {
      gsap.fromTo(errorBox, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' })
    }
  }

  function hide() {
    if (reducedMotion()) {
      screen.hidden = true
      return
    }
    gsap.to(screen, {
      opacity: 0,
      duration: 0.6,
      ease: 'power2.inOut',
      onComplete: () => {
        screen.hidden = true
      },
    })
  }

  function show() {
    screen.hidden = false
    screen.style.opacity = '1'
  }

  return { hide, show, showError }
}
