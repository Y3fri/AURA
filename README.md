# Aura

> Instrumento musical de partículas: toca notas con las manos frente a la cámara, sin tocar nada.

**Aura** abre una nube de miles de partículas brillantes en 3D. La cámara detecta tus manos y las
partículas las siguen como imanes de luz. Levanta los dedos para tocar notas, pellizca para
concentrar toda la nube en un punto y ábrela de golpe para explotarla con un destello y un golpe
de sonido. Todo se procesa en tu navegador: **el vídeo nunca sale de tu dispositivo**.

<!-- Pon aquí tu GIF favorito -->
![Demo de Aura](docs/aura-demo.gif)

> 💡 **Saca un buen reel**: graba a 60 FPS con buena luz delante, fondo oscuro y limpia, y las
> manos a unos 40–60 cm de la cámara. Más consejos al final del README.

---

## Tecnologías

| Tecnología | Para qué |
| --- | --- |
| [Vite](https://vite.dev) + ES Modules | desarrollo y build (sin frameworks de UI) |
| [Three.js](https://threejs.org) | renderer WebGL, cámaras y shaders propios |
| [GLSL](https://www.khronos.org/opengl/wiki/GLSL) | **toda** la física de partículas corre en la GPU (vertex shader) |
| [@mediapipe/tasks-vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) | HandLandmarker: 21 puntos por mano, hasta 2 manos |
| [Tone.js](https://tonejs.github.io) | sintetizador, reverb, límite de voces y volumen |
| [GSAP](https://gsap.com) | transiciones de la interfaz |
| CSS puro con variables | tema oscuro, responsive, `prefers-reduced-motion` |

Sin dependencias de servidores externos en tiempo de ejecución: el modelo
(`public/models/hand_landmarker.task`) y los WASM (`public/wasm/`) se sirven desde el propio
proyecto.

---

## Instalar y correr

Requisitos: Node.js 18+ y un navegador con WebGL (Chrome, Edge, Firefox o Safari actuales).

```bash
npm install        # instala dependencias y copia los WASM de MediaPipe a public/wasm/
npm run dev        # http://localhost:5173  (la cámara solo funciona en localhost o HTTPS)
npm run build      # compila a dist/  (ejecútalo antes de desplegar)
npm run preview    # sirve la build de producción en local
```

Opcional (prueba automatizada en navegador headless con cámara falsa):

```bash
npm run smoke      # build + prueba de humo con Edge/Chrome headless
```

### Probar desde el celular (en tu propia red)

La cámara **exige HTTPS o localhost**. Si abres `http://192.168.x.x:5173` desde el móvil, el
navegador bloqueará la cámara. Soluciones:

1. **Túnel gratuito (recomendado):** instala [ngrok](https://ngrok.com) o
   [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
   y ejecútalo contra tu dev server: `ngrok http 5173`. Abre la URL HTTPS que te dé.
2. **Chrome en el PC:** ve a `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
   añade `http://TU_IP:5173` y reinicia (funciona para probar, no para publicar).

`npm run dev` ya arranca con `--host`, así que tu IP local apare en la terminal.

---

## Cómo tocar (tabla de gestos)

| Gesto | Qué hace | Umbral (ajustable en `src/config/settings.js`) |
| --- | --- | --- |
| Acerca la mano | Una nube de partículas se orbita alrededor de tu palma (hasta 2 manos) | `strength` se suaviza al aparecer/desaparecer |
| Dedo levantado | Toca una nota de la escala (como un piano en el aire). Al bajarlo, la nota se apaga | `FINGER_MARGIN: 1.06` (punta más lejos de la muñeca que su PIP) |
| Pellizco (pulgar + índice) | Todas las partículas se concentran en un punto brillante | `PINCH_CLOSE: 0.35` y `PINCH_RELEASE: 0.60` (histéresis, en tamaños de mano) |
| Abrir la mano tras un pellizco (≥220 ms) | Explosión hacia afuera + golpe de sonido + destello | `PINCH_MIN_DURATION: 220` ms, `OPEN_HAND: 1.45` |
| Altura de la mano | Cambia la octava (arriba +1 · centro 0 · abajo −1) | `OCTAVE_TOP: 0.36`, `OCTAVE_BOTTOM: 0.68` |
| Distancia a la cámara | Más cerca = más volumen y partículas más grandes | `DEPTH_NEAR: 0.20`, `DEPTH_FAR: 0.09` |
| Sin manos a la vista | Las partículas flotan en reposo y el pad ambiente respira | — |
| Sonido del sistema | Color, brillo y vibración reaccionan al nivel RMS del audio | — |

> **Nota sobre distancias:** todos los umbrales se normalizan por el tamaño de la mano
> (muñeca → MCP del dedo medio, landmarks 0 y 9), así funcionan igual con la mano cerca o lejos.

### Modo respaldo (sin cámara)

Si no hay permiso de cámara, no hay dispositivo o falla MediaPipe, **Aura se cambia solo a modo
mouse/táctil** y lo avisa con un mensaje claro:

- **Mueve el cursor** → 5 bandas horizontales eligen la nota.
- **Altura del cursor** → octava.
- **Clic sostenido** → pellizco (la nube se concentra).
- **Soltar** tras ≥200 ms → explosión.
- En pantallas táctiles, cada dedo que toca la pantalla es una mano.

### Grabar y reproducir en bucle

El botón **Grabar** guarda *eventos* de la interpretación (notas y explosiones con su tiempo),
**nunca vídeo**. Al detener, la interpretación se reproduce en bucle y **puedes seguir tocando
encima**. Un clic más detiene el bucle.

---

## Modo embebido (iframe)

`/embed.html` muestra solo la escena y la pantalla de activación (sin encabezado ni menús),
ajustándose al 100 % del iframe. **Reutiliza los mismos módulos de `src/`: no hay código duplicado.**

```html
<iframe
  src="https://TU-DOMINIO/embed.html?palette=violeta&scale=pentatonica&particles=alto"
  allow="camera; microphone"
  title="Aura"
  width="100%"
  height="600"
  style="border: 0"
></iframe>
```

### Parámetros de URL

| Parámetro | Valores admitidos | Por defecto |
| --- | --- | --- |
| `palette` | `violeta` · `rosa` · `azul` · `dorado` | `dorado` |
| `scale` | `pentatonica` · `mayor` · `menor` | `pentatonica` |
| `particles` | `bajo` · `medio` · `alto` | `alto` |

**Sanitización:** cualquier valor fuera de la lista blanca se ignora y se usa el valor por defecto
(`src/config/settings.js → readUrlParams()`), por lo que `?palette=<script>` es inofensivo.
Funcionan también en `index.html`.

### ⚠️ Requisitos para quien incrusta

1. **HTTPS obligatorio:** la API de cámara (`getUserMedia`) solo funciona en `https://` o
   `localhost`. Un iframe servido por HTTP no podrá abrir la cámara.
2. **`allow="camera; microphone"`** en el iframe (sin ese atributo el navegador deniega el permiso).
3. Si incrustas en otra página, el navegador puede pedir el permiso **en el contexto del iframe**;
   si falla, Aura cae automáticamente al modo mouse y lo indica.

---

## Despliegue gratis

La build usa rutas relativas (`base: './'` en `vite.config.js`), así que funciona en la raíz o en
una subcarpeta sin tocar nada.

### Vercel

```bash
npm i -g vercel
npm run build
vercel --prod
```

O conecta el repositorio en [vercel.com/new](https://vercel.com/new): Framework **Vite**,
Build Command `npm run build`, Output Directory `dist`. Listo.

### GitHub Pages

1. Sube el proyecto a un repositorio.
2. `npm run build` y publica `dist/` en la rama `gh-pages`
   (puedes usar la acción oficial [`actions/deploy-pages`](https://github.com/actions/starter-workflows)
   o el paquete `gh-pages`: `npx gh-pages -d dist`).
3. La build con `base: './'` funciona en `https://USUARIO.github.io/REPOSITORIO/`.

Recuerda: GitHub Pages sirve por HTTPS ✔️, así que la cámara funciona sin trucos.

---

## Estructura del proyecto

```
aura/
├── index.html               # pantalla completa con HUD y ayuda de gestos
├── embed.html               # versión para iframe (solo escena + activación)
├── vite.config.js           # base './', dos entradas, --host para probar en el móvil
├── public/
│   ├── models/              # hand_landmarker.task (modelo local, 7.8 MB)
│   └── wasm/                # WASM de MediaPipe (copiados por scripts/copy-wasm.mjs)
├── scripts/
│   ├── copy-wasm.mjs        # postinstall: copia WASM desde node_modules
│   └── smoke.mjs            # prueba de humo opcional (Edge headless + cámara falsa)
└── src/
    ├── main.js              # orquestador: bucle, gestos → notas → partículas → HUD
    ├── vision/              # cámara + MediaPipe + gestos + suavizado (100 % local)
    ├── input/               # modo mouse/táctil (genera landmarks sintéticos)
    ├── scene/               # renderer, buffers de partículas y shaders GLSL
    ├── audio/               # sintetizador, reverb, límite de voces, escalas
    ├── ui/                  # pantalla inicial, HUD, grabador de eventos
    ├── config/settings.js   # partículas, paletas, sensibilidad y TODOS los umbrales
    └── styles/              # tokens.css · base.css · components.css
```

---

## Rendimiento y buenas prácticas

- **25.000 partículas** en escritorio y **10.000** en móvil (detectado por ancho de pantalla);
  el preset se puede bajar con `?particles=bajo`.
- El movimiento completo (flujo, atracción, pellizco, explosión, vibración) vive en el
  **vertex shader**; JavaScript solo sube uniforms por frame.
- Pixel ratio máximo 2, sin antialias (innecesario con mezcla aditiva).
- Inferencia de manos limitada a **~30 Hz y 2 manos**; el render corre a 60 FPS por separado.
- Landmarks suavizados con filtro **One-Euro** (poco temblor sin añadir latencia).
- La pestaña oculta **pausa el render y suspende el audio**; `pagehide` libera cámara, WebGL y
  contexto de audio.
- `prefers-reduced-motion` reduce la animación de las partículas y las transiciones.

### Solución de problemas

| Problema | Causa probable | Solución |
| --- | --- | --- |
| La cámara no abre | Página por HTTP o permiso denegado | Usa `localhost` o HTTPS; revisa el candado del navegador |
| "Modo mouse activo" | No hay cámara o MediaPipe falló | Es el respaldo automático; sigue siendo usable |
| Sin sonido | Autoplay bloqueado | Pulsa el botón inicial (ese clic inicia `Tone.start()`) |
| Página negra | WebGL desactivado | Activa la aceleración gráfica o prueba otro navegador |
| Lentitud | Muchas pestañas / GPU integrada | `?particles=bajo` y cierra otras pestañas |

---

## Verificación manual (checklist)

1. `npm run dev` → abre `http://localhost:5173` → pulsa **"Activar cámara y sonido"** y acepta la cámara.
2. **Mano visible:** debe aparecer la preview espejada con los puntos y una nube orbitando tu palma.
3. **Dedos:** levanta 1, 2, 3 dedos → el HUD muestra notas distintas; al bajarlos suenan y se apagan.
4. **Altura:** sube la mano → nota más aguda (octava +1); bájala → más grave.
5. **Pellizco:** junta pulgar e índice → la nube se concentra en un punto brillante.
6. **Explosión:** tras el pellizco, abre la mano de golpe → partículas hacia afuera + golpe de sonido.
7. **Distancia:** acerca la mano → volumen y tamaño de partículas suben.
8. **Reposo:** quita las manos → las partículas flotan y el pad ambiente sube.
9. **Controles:** cambia paleta y escala, mueve el volumen, silencia y vuelve a sonar.
10. **Grabar:** Graba unos segundos, detén → el bucle repite y puedes tocar encima.
11. **Respaldo:** niega el permiso de cámara (o abre por HTTP) → aviso amigable y el mouse controla todo.
12. **Embed:** abre `/embed.html?palette=azul&scale=menor&particles=bajo` → solo escena, sin menús.
13. Cambia de pestaña → el sonido se pausa; vuelves → continúa.
