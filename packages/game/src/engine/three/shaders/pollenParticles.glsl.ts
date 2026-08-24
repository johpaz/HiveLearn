/**
 * pollenParticles — shader GLSL para ~50k partículas GPU.
 * Usa un BufferGeometry con `THREE.Points`. Cada partícula deriva por
 * una curva basada en su ID + atracción al jugador (uCamera).
 *
 * Para mantener el sistema simple, vertex shader posiciona partículas en
 * función del uTime y un offset aleatorio hardcoded por ID. El fragment
 * dibuja discs suaves con additive blending.
 */

export const vertex = /* glsl */`
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec2  uCamera;
  uniform float uQuality;
  uniform vec2  uResolution;
  varying float vAlpha;

  void main() {
    // Ranura pseudoaleatoria por ID para distribuir partículas en el mundo
    vec2 base = aSeed.rg * vec2(2.0, 1.5) - vec2(1.0, 0.0);
    float t = uTime * 0.5;
    base.x += sin(t * 0.7 + aSeed.b * 6.28) * 0.2;
    base.y += cos(t * 0.5 + aSeed.b * 4.0) * 0.15 - 0.05 * t;

    // Atracción leve al jugador
    vec2 toCam = uCamera * 0.01 - base;
    base += toCam * 0.02 * (aSeed.b * 0.5 + 0.5);

    // Convertir en clip-space (orthográfico simple NDC basado en resolución)
    vec2 ndc = (base + vec2(uCamera.x * 0.0002, uCamera.y * 0.0002)) / vec2(uResolution.x / uResolution.y, 1.0);
    ndc.xy = ndc.xy * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);

    gl_PointSize = (1.0 + 2.0 * aSeed.b) * uQuality;
    vAlpha = (0.25 + 0.35 * sin(uTime * 1.0 + aSeed.b * 10.0)) * uQuality;
  }
`

export const fragment = /* glsl */`
  precision mediump float;
  varying float vAlpha;
  uniform float uMood;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha * (0.25 + 0.35 * uMood);
    if (alpha < 0.01) discard;
    vec3 col = vec3(1.0, 0.85, 0.4) * alpha;
    gl_FragColor = vec4(col, alpha);
  }
`