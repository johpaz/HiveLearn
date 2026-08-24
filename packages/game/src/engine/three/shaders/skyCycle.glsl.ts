/**
 * skyCycle — shader GLSL para el cielo del nivel exterior.
 * Ciclo día/noche procedural + sol/luna + nubes fbm + estrellas.
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

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 3; i++) {
      v += amp * noise(p);
      p *= 2.1;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 res = uResolution;
    vec2 uv = (vUv * res - uCamera * 0.1) / res.y;
    float horizon = smoothstep(-0.2, 0.4, uv.y);

    // ciclo día/noche: el día domina para evitar largos tramos grises
    float day = 0.68 + 0.32 * sin(uTime * 0.05);
    day = mix(day, uMood, 0.3);

    // Colores cielo (paleta cálida luminosa)
    vec3 daySky = vec3(0.45, 0.72, 0.98);
    vec3 dusk   = vec3(0.98, 0.60, 0.28);
    vec3 night  = vec3(0.05, 0.07, 0.18);
    vec3 sky = mix(night, daySky, day);
    sky = mix(sky, dusk, 0.22 * (1.0 - abs(day - 0.5) * 2.0));

    // Horizonte: calidez dorada al fondo
    vec3 horizonCol = mix(mix(dusk, vec3(1.0, 0.80, 0.45), 0.5), sky * 0.6, 0.35);
    vec3 col = mix(horizonCol, sky, horizon);

    // Sol / luna: recorre un arco con el ciclo
    float ang = (uTime * 0.05) * 3.14159;
    vec2 sunPos = vec2(cos(ang) * 0.75, abs(sin(ang)) * 0.55 + 0.35);
    float sunDist = length(uv - sunPos);
    float daylight = smoothstep(0.25, 0.6, day);
    // disco + halo (sol de día, luna tenue de noche)
    float disc = smoothstep(0.085, 0.055, sunDist);
    float halo = smoothstep(0.45, 0.05, sunDist);
    vec3 sunCol = mix(vec3(0.85, 0.88, 1.0), vec3(1.0, 0.9, 0.6), daylight);
    col += sunCol * disc * mix(0.5, 1.0, daylight);
    col += sunCol * halo * mix(0.10, 0.35, daylight);

    // Nubes procedurales (2 capas a la deriva, más visibles de día)
    float cloudVis = mix(0.25, 1.0, daylight);
    vec2 cuv1 = uv * 2.2 + vec2(uTime * 0.012, 0.0) + uCamera * 0.0004;
    vec2 cuv2 = uv * 3.6 + vec2(uTime * 0.025, 3.7) + uCamera * 0.0008;
    float c1 = fbm(cuv1);
    float c2 = fbm(cuv2);
    float clouds = smoothstep(0.56, 0.80, c1 * 0.7 + c2 * 0.45);
    clouds *= smoothstep(0.05, 0.35, uv.y); // no nubes bajo el horizonte cercano
    vec3 cloudCol = mix(night * 2.2, vec3(1.0, 0.98, 0.94), daylight);
    // sombreado inferior de la nube
    float shade = fbm(cuv1 + vec2(0.0, 0.12));
    cloudCol *= 0.85 + 0.15 * shade;
    col = mix(col, cloudCol, clouds * 0.68 * cloudVis);

    // Estrellas (solo de noche: se apagan rápido al subir el día)
    float starVis = smoothstep(0.4, 0.15, day);
    vec2 sg = uv * 100.0;
    float star = step(0.992, hash(floor(sg))) * starVis;
    col += vec3(star) * 0.9 * (1.0 - clouds);

    // Nebulosa sutil
    vec2 nz = uv * 2.0 + uCamera * 0.001;
    float neb = hash(floor(nz * 30.0)) * 0.03 * starVis;
    col += neb * vec3(0.6, 0.4, 1.0);

    gl_FragColor = vec4(col, 1.0);
  }
`
