/**
 * particleSystem: buffers + uniforms de la nube de partículas.
 * La geometría se genera una vez; por frame solo se tocan uniforms.
 */
import * as THREE from 'three'
import vertexShader from './shaders/particles.vert.glsl?raw'
import fragmentShader from './shaders/particles.frag.glsl?raw'

export class ParticleSystem {
  constructor(count, palette, radius = 3.2) {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 3)
    const rands = new Float32Array(count)
    const scales = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // position es solo para el bounding box; el movimiento real es en el shader
      const u = Math.random() * 2 - 1
      const v = Math.random() * 2 - 1
      const w = Math.random() * 2 - 1
      positions.set([u * radius, v * radius, w * radius], i * 3)
      seeds.set([Math.random(), Math.random(), Math.random()], i * 3)
      rands[i] = Math.random()
      scales[i] = 0.5 + Math.random() * Math.random() * 1.6
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 1))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

    const colors = palette.stops.map((hex) => new THREE.Color(hex))

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: 7.5 },
      uRadius: { value: radius },
      uNoiseAmp: { value: 0.55 },
      uNoiseScale: { value: 0.35 },
      uFlowSpeed: { value: 0.35 },
      uHands: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uHandStrength: { value: [0, 0, 0] },
      uPinch: { value: [0, 0, 0] },
      uBurst: { value: 0 },
      uBurstCenter: { value: new THREE.Vector3() },
      uAudio: { value: 0 },
      uMotion: { value: 1 },
      uColorA: { value: colors[0] },
      uColorB: { value: colors[1] },
      uColorC: { value: colors[2] },
    }

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    this.mesh = new THREE.Points(geometry, material)
    // El movimiento ocurre en el shader: el culling por AABB sería incorrecto.
    this.mesh.frustumCulled = false
    this.count = count
  }

  /** Actualiza los uniforms del frame. `hands` recibe hasta 3 posiciones (slot 2 = bucle). */
  update({ time, hands, pinch, burst, burstCenter, audio, pixelRatio }) {
    const u = this.uniforms
    u.uTime.value = time
    u.uPixelRatio.value = pixelRatio ?? u.uPixelRatio.value
    u.uBurst.value = burst
    u.uAudio.value = audio

    for (let i = 0; i < 3; i++) {
      const h = hands[i]
      if (h) {
        u.uHands.value[i].set(h.x, h.y, h.z || 0)
        u.uHandStrength.value[i] = h.strength
        u.uPinch.value[i] = pinch[i] ?? 0
      } else {
        u.uHandStrength.value[i] = 0
        u.uPinch.value[i] = 0
      }
    }

    if (burstCenter) u.uBurstCenter.value.set(burstCenter.x, burstCenter.y, burstCenter.z || 0)
  }

  setMotion(motion) {
    this.uniforms.uMotion.value = motion
  }

  /** Tamaño de partículas por profundidad (0..1) — lo usa el gesto de distancia. */
  setSizeScale(depth) {
    this.uniforms.uSize.value = 6.5 + depth * 4.5
  }

  setPalette(palette) {
    const colors = palette.stops.map((hex) => new THREE.Color(hex))
    this.uniforms.uColorA.value.copy(colors[0])
    this.uniforms.uColorB.value.copy(colors[1])
    this.uniforms.uColorC.value.copy(colors[2])
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
