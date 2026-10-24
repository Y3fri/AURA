// Aura — fragment shader de partículas
// Sprite circular suave; la mezcla aditiva del material se encarga del brillo.

varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;

  float core = smoothstep(0.5, 0.0, d);
  float glow = pow(core, 3.0);
  vec3 col = vColor * (0.6 + glow * 1.4);

  gl_FragColor = vec4(col, core * vAlpha);
}
