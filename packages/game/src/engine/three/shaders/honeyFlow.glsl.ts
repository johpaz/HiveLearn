/**
 * honeyFlow — shader GLSL para trono de miel / superficies fluidas ámbar.
 * fBm noise para simular flujo lento + especular animado + goteo.
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

  // hash + value noise básico (no library)
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (vUv * res - uCamera * 0.2) / res.y;
    uv *= 3.0;

    // Flujo lento
    vec2 flow = uv + vec2(uTime * 0.05, sin(uTime * 0.1) * 0.1);
    float n = fbm(flow * 1.5);
    float n2 = fbm(flow * 3.0 + vec2(5.0, 1.0));

    vec3 honey = vec3(1.0, 0.65, 0.15);
    vec3 deep = vec3(0.45, 0.22, 0.05);
    vec3 col = mix(deep, honey, n);

    // Especular "wet" pulsante
    float spec = pow(n2, 6.0) * 1.2;
    col += spec * vec3(1.0, 0.95, 0.7);

    // Goteo: streaks verticales que caen con tiempo
    float streak = sin(uv.x * 12.0 + uTime * 0.5) * 0.5 + 0.5;
    streak = pow(streak, 8.0) * smoothstep(mod(uTime * 0.4 + uv.x * 2.0, 1.0) * 4.0, 0.0, uv.y);
    col += streak * vec3(1.0, 0.8, 0.3) * 0.4;

    // Mood para realzar alert/celebrate
    col *= 0.6 + 0.6 * uMood;

    gl_FragColor = vec4(col, 1.0);
  }
`