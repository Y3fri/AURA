/**
 * AuraScene: renderer WebGL, cámara, bucle de render, resize y dispose.
 * No conoce nada de gestos ni de audio; solo dibuja lo que le pase particleSystem.
 */
import * as THREE from 'three'

export class SceneUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SceneUnavailableError'
  }
}

/** Comprueba WebGL antes de crear nada, para mostrar el mensaje de error amigable. */
export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export class AuraScene {
  constructor(container) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // innecesario con partículas aditivas y cuesta FPS
      alpha: true, // el fondo/brillo lo pone el CSS con el color de la paleta
      powerPreference: 'high-performance',
    })
    if (!this.renderer.capabilities.isWebGL2 && !this.renderer.getContext()) {
      throw new SceneUnavailableError('WebGL no está disponible.')
    }

    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.domElement.className = 'aura-canvas'

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    this.camera.position.set(0, 0, 6)

    container.appendChild(this.renderer.domElement)

    this.running = false
    this.rafId = 0
    this._render = this._render.bind(this)
    this._onResize = this._onResize.bind(this)

    this.observer = new ResizeObserver(this._onResize)
    this.observer.observe(container)
    window.addEventListener('resize', this._onResize)
    this._onResize()
  }

  _onResize() {
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.position.z = height / width < 0.9 ? 7.4 : 6 // en vertical, aleja para que quepa la nube
    this.camera.updateProjectionMatrix()
  }

  /** Dimensiones del plano de visualización en z=0 (donde "viven" las manos). */
  get viewSize() {
    const height = 2 * Math.abs(this.camera.position.z) * Math.tan((this.camera.fov * Math.PI) / 360)
    return { width: height * this.camera.aspect, height }
  }

  /**
   * Coordenada normalizada de la imagen (0..1, y hacia abajo) → mundo 3D.
   * Se invierte X para espejar: el usuario mueve la mano a la derecha y las
   * partículas se desplazan a su derecha, como en un espejo.
   */
  normalizedToWorld(nx, ny) {
    const { width, height } = this.viewSize
    return { x: (0.5 - nx) * width, y: (0.5 - ny) * height, z: 0 }
  }

  add(object) {
    this.scene.add(object)
    return object
  }

  start() {
    if (this.running) return
    this.running = true
    this.rafId = requestAnimationFrame(this._render)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  _render() {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this._render)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    this.observer.disconnect()
    window.removeEventListener('resize', this._onResize)
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
      else obj.material?.dispose?.()
    })
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
