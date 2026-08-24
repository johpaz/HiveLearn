/**
 * portal — shader GLSL para el portal del hub.
 * Distorsión swirl + rim de energía pulsante.
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

  void main() {
    vec2 res = uResolution;
    vec2 p = (vUv * res - uCamera * 0.1) / res.y;
    p += vec2(2.0, 0.0);

    float t = uTime * 0.8;
    // Polar coords
    float r = length(p);
    float a = atan(p.y, p.x);

    // Swirl: rotación aumenterson del radio
    a += t + r * 3.0;

    // Anillo energéticoentre r=0.95-1.05
    float ring = smoothstep(1.1, 0.95, r) - smoothstep(0.95, 0.8, r);
    float inner = smoothstep(0.8, 0.0, r) * 0.3;

    // Rayos radiales
    float rays = sin(a * 12.0 + t) * 0.5 + 0.5;
    float rays2 = sin(a * 6.0 - t * 1.5) * 0.5 + 0.5;

    vec3 col = mix(vec3(0.9, 0.5, 0.1), vec3(1.0, 0.85, 0.3), rays);
    col *= ring * (0.6 + rays2 * 0.6);
    col += inner * vec3(1.0, 0.6, 0.2);

    // Mood - celebración intensifica
    col *= 1.0 + 0.4 * uMood;

    // Cae a cero fuera del radio
    float alpha = clamp(ring + inner, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`