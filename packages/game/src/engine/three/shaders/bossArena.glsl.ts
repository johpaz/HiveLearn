/**
 * bossArena — shader GLSL para el fondo del jefe.
 * Ondas de choque + viñeta pulsante + distorsión de calor.
 */

export const vertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const fragment = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uCamera;
  uniform float uMood;
  uniform vec2  uResolution;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (vUv * res - uCamera * 0.3) / res.y;
    float t = uTime;

    // Ondas de choque radiales
    float r = length(uv);
    float shock = sin(r * 6.0 - t * 4.0) * 0.5 + 0.5;
    shock *= smoothstep(3.0, 0.5, r);

    // Tensión: viñeta pulsante
    float vignette = smoothstep(1.5, 0.4, r * 1.2);
    float pulse = 0.5 + 0.5 * sin(t * 1.8);
    float tension = vignette * pulse;

    // Distorsión de calor — desplaça el uv
    vec2 heatUv = uv + vec2(sin(t * 1.0 + uv.y * 6.0), cos(t * 0.8 + uv.x * 4.0)) * 0.02;
    vec3 baseCol = vec3(0.35, 0.08, 0.08);
    
    // Bandas ámbar por calor
    float band = sin(heatUv.y * 12.0 + t * 2.0) * 0.5 + 0.5;
    band = pow(band, 3.0) * 0.5;
    vec3 col = baseCol + band * vec3(1.0, 0.5, 0.1) * (1.0 - r * 0.3);

    col += shock * vec3(1.0, 0.7, 0.3) * 0.6;
    col = mix(col, col * 1.5, tension * 0.5);

    // Mood: alert → rojo más intenso
    col *= 0.6 + 0.8 * uMood;

    gl_FragColor = vec4(col, 1.0);
  }
`