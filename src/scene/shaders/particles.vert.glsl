// Aura — vertex shader de partículas
// Toda la física (flujo, atracción, pellizco, explosión, vibración) vive aquí
// para que la CPU solo suba uniforms por frame.

uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uRadius;
uniform float uNoiseAmp;
uniform float uNoiseScale;
uniform float uFlowSpeed;
uniform vec3 uHands[3];        // 0-1 manos reales, 2 fantasma (reproducción del bucle)
uniform float uHandStrength[3];
uniform float uPinch[3];
uniform float uBurst;
uniform vec3 uBurstCenter;
uniform float uAudio;          // nivel RMS del sonido 0..1
uniform float uMotion;         // 1 normal · <1 con prefers-reduced-motion
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

attribute vec3 aSeed;
attribute float aRand;
attribute float aScale;

varying vec3 vColor;
varying float vAlpha;

// Ruido senoidal barato (3 sin/cos por eje): suficiente para un flujo orgánico
// a 25.000 partículas sin texturas ni ruido de Perlin completos.
vec3 flow(vec3 p, float t) {
  return vec3(
    sin(p.y + t) + cos(p.z * 1.3 - t * 0.7),
    sin(p.z + t * 1.2) + cos(p.x * 1.1 + t * 0.6),
    sin(p.x - t * 0.9) + cos(p.y * 1.2 + t * 0.8)
  );
}

void main() {
  // Nube base: dirección aleatoria + radio con raíz (más densidad en el centro)
  vec3 dir = normalize(aSeed * 2.0 - 1.0 + vec3(0.0001));
  float radius = pow(aRand, 0.5) * uRadius;
  vec3 base = dir * radius;

  float t = uTime * uFlowSpeed;
  vec3 pos = base + flow(base * uNoiseScale, t) * uNoiseAmp * uMotion;

  // Atracción hacia cada mano con caída gaussiana por distancia
  float attracted = 0.0;
  for (int i = 0; i < 3; i++) {
    float s = uHandStrength[i];
    if (s <= 0.001) continue;

    vec3 h = uHands[i];
    float d = distance(pos, h);
    float w = clamp(s * exp(-d * d * 0.35), 0.0, 0.95);

    // Órbita alrededor de la mano: se cierra al pellizcar (nube → punto brillante)
    float orbitR = mix(0.8, 0.05, uPinch[i]) * (0.4 + aRand);
    vec3 orbit = vec3(
      sin(aSeed.x * 6.2831 + uTime * (1.5 + aRand)),
      cos(aSeed.y * 6.2831 + uTime * (1.3 + aRand)),
      sin(aSeed.z * 6.2831 + uTime * (1.7 + aRand))
    ) * orbitR;

    pos = mix(pos, h + orbit, w);
    attracted = max(attracted, w);
  }

  // Explosión: impulso radial desde el centro de la detonación (uBurst decae en JS)
  if (uBurst > 0.001) {
    vec3 outDir = pos - uBurstCenter;
    pos += (outDir / (length(outDir) + 0.001)) * uBurst * (0.6 + aRand * 2.4);
  }

  // Vibración ligera al ritmo del audio
  pos += flow(pos * 6.0, uTime * 9.0) * uAudio * 0.05 * uMotion;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = uSize * aScale * (1.0 + uAudio * 0.7 + uBurst * 0.8 + attracted * 0.3);
  gl_PointSize = size * uPixelRatio * (12.0 / -mvPosition.z);

  // Color: degradado por altura + realce en la zona de mano + destello de explosión
  float h = smoothstep(-uRadius, uRadius, pos.y);
  vec3 col = mix(uColorA, uColorB, h);
  col = mix(col, uColorC, smoothstep(0.5, 1.0, h) * (0.5 + aRand * 0.7));
  col += uColorC * attracted * 0.35;
  col += vec3(1.0) * uBurst * 0.5;

  vColor = col;
  vAlpha = (0.3 + aRand * 0.7) * (1.0 - attracted * 0.2);
}
