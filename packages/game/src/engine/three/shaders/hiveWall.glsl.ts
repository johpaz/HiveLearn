/**
 * hiveWall — shader GLSL para el interior de la colmena (Colmena Central).
 *
 * Dibuja una pared de hexágonos procedurales con SDF, iluminación pulsante
 * ámbar y falso parallax por profundidad. Cubre todo el viewport en un único
 * quad (dos triángulos) — orthográfico NDC.
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

  // SDF hexagon. Devuelve distancia a un hex de radio r centrado en p.
  float sdfHex(vec2 p, float r) {
    const vec3 k = vec3(-0.866025, 0.5, 0.57735);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (vUv * res - uCamera * 0.5) / res.y;
    uv *= 6.0; // escala del patrón hex

    float parallax = 0.0;
    float depth = 0.0;
    vec3 col = vec3(0.0);

    for (int layer = 0; layer < 3; layer++) {
      float lf = float(layer);
      vec2 p = uv * (1.0 - lf * 0.35) + vec2(uCamera.x * 0.001 * (lf + 1.0), uCamera.y * 0.0008 * (lf + 1.0));
      vec2 g = vec2(1.5, sqrt(3.0));
      vec2 id = floor(p / g);
      vec2 r = mod(p, g);
      // Detecta hex pivote
      // Usa dos centros hex por fila para emparejamientos
      vec2 c = ((r.x > 0.75) ? vec2(0.75, sqrt(3.0)/2.0) : vec2(0.0, 0.0)) ;
      float d = abs(sdfHex(r - c, 0.6));
      float puls = 0.5 + 0.5 * sin(uTime * 0.6 + id.x * 0.4 + id.y * 0.3 + lf);
      float glo = smoothstep(0.05, 0.0, d) * 0.6;
      float edge = smoothstep(0.03, 0.02, d) * 0.4;
      col += mix(vec3(0.6, 0.35, 0.05), vec3(1.0, 0.7, 0.2), puls) * (glo + edge) * (1.0 - lf * 0.25);
      depth = max(depth, lf * 0.1 + glo);
    }

    // Vignette ámbar
    float v = smoothstep(1.5, 0.5, length(uv * 0.5));
    col *= v * 1.2 + 0.4;

    // Mood: alert = rojo, celebrate = dorado intenso
    col *= 0.6 + 0.7 * uMood;

    // Background gradient base
    col += vec3(0.25, 0.12, 0.04) * (1.0 - uv.y * 0.5);

    gl_FragColor = vec4(col, 1.0);
  }
`