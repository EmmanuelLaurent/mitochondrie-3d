// GLSL for the raymarched mitochondrion. Kept apart from the TypeScript that
// lays out cristae and drives uniforms (mitochondrionSdf.ts).

export const vertexShader = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

export const fragmentShader = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat4 uModelInv;
uniform vec4 uViewport;
uniform float uPixelAngle;
uniform float uFrame;
uniform float uAccumulate;

uniform float uZc;
uniform float uYc;
uniform int uSteps;
uniform int uShadowSteps;
uniform int uSamples;
uniform int uAoTaps;
uniform float uRimShadow;
uniform float uThickness;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

uniform vec4 uCristaA[CRISTA_COUNT];
uniform vec4 uCristaB[CRISTA_COUNT];

uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform vec3 uRimDir;
uniform vec3 uRimColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;

uniform vec3 uOuterColor;
uniform vec3 uOuterCapColor;
uniform vec3 uInnerColor;
uniform vec3 uInnerCapColor;
uniform vec3 uMatrixColor;
uniform vec3 uMatrixCapColor;
uniform vec3 uImsColor;
uniform vec3 uOuterSss;
uniform vec3 uInnerSss;

// Focus + context: weights for (outer membrane, intermembrane space, inner membrane, matrix).
uniform vec4 uFocus;
uniform float uFocusAmt;
uniform vec3 uSignalColor;
// Global fade (scene 2's zoom dissolves the organelle into the molecular set).
uniform float uOpacity;

const float PI = 3.14159265;

// ================================================================== SDF ==

vec3 unbend(vec3 p) {
  vec2 c = vec2(p.x, p.y + BEND_R);
  return vec3(atan(c.x, c.y) * BEND_R, length(c) - BEND_R, p.z);
}

float sdCapsuleX(vec3 q, float halfLen, float r) {
  vec3 d = q;
  d.x -= clamp(q.x, -halfLen, halfLen);
  return length(d) - r;
}

// Polynomial smin on purpose: the mix()-based form cancels catastrophically in
// float32 against a large sentinel (no crista nearby -> 1e9) and produced NaN
// normals at the organelle ends.
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

// Static, irregular undulation shared by both membranes so they stay parallel.
// Deliberately not animated: a rhythmic pulse invites "the mitochondrion breathes".
float wobble(vec3 q) {
  return 0.011 * sin(3.1 * q.x + 1.7 * sin(2.3 * q.z)) * cos(2.7 * q.y + q.x)
       + 0.004 * sin(5.3 * q.x + 2.0 * q.z + 1.3);
}

// Lamellar cristae: thin undulating tongues attached around the circumference,
// narrowing to a neck (crista junction) where they cross the boundary membrane.
// dIn: distance to the uncarved inner capsule (negative inside).
float cristaeLumen(vec3 q, float dIn) {
  float d = 1e9;
  float neck = 1.0 - smoothstep(-(T_IM + 0.07), -(T_IM + 0.012), dIn);
  for (int i = 0; i < CRISTA_COUNT; i++) {
    vec4 a = uCristaA[i];
    vec4 b = uCristaB[i];
    // Lower bound on this slab's distance: skip only slabs that can't beat the current minimum.
    float reach = LUMEN_HALF * 1.2 + a.z * abs(sin(b.z)) + 0.045;
    if (abs(q.x - a.x) - reach > d) continue;

    vec3 p = vec3(q.x - a.x, q.y, q.z);
    p.yz = mat2(b.x, -b.y, b.y, b.x) * p.yz;
    p.y -= a.y;
    float ct = cos(b.z);
    float st = sin(b.z);
    p.xy = mat2(ct, -st, st, ct) * p.xy;
    p.x -= 0.022 * sin(5.0 * p.z + b.w) + 0.014 * sin(6.5 * p.y + 1.7 * b.w);

    float rc = 0.8 * min(a.z, a.w);
    vec2 e = abs(vec2(p.y, p.z)) - vec2(a.z, a.w) + rc;
    float outline = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - rc;
    float hw = LUMEN_HALF * (1.0 + 0.18 * sin(4.0 * p.z + 2.0 * b.w));
    hw = mix(NECK_HALF, hw, neck);
    vec2 w = vec2(outline, abs(p.x) - hw);
    d = min(d, min(max(w.x, w.y), 0.0) + length(max(w, 0.0)));
  }
  return d;
}

// Inner compartment (inner membrane + matrix) with the cristae lumens carved out:
// the inner membrane is the boundary of this region, so it folds into each lumen.
float innerSolid(vec3 q, float w) {
  float dIn = sdCapsuleX(q, HALF_LEN, R_IN) + w;
  if (dIn > 0.2) return dIn;
  return smax(dIn, -cristaeLumen(q, dIn), 0.012);
}

// Removed region of the quarter cutaway {y > yc+off, z > zc+off}, with a filleted
// corner so a crista section curves smoothly from one cut face to the other.
float cutRegion(vec3 q, float off) {
  return smax((uZc + off) - q.z, (uYc + off) - q.y, 0.08);
}

struct Fields {
  float dOut;  // outer capsule (outer face of the outer membrane)
  float dS;    // carved inner solid (outer face of the inner membrane)
  float dOM;
  float dIM;
  float dMat;
  float remOM;
  float remIM;
  float remMat;
};

Fields fields(vec3 q) {
  Fields f;
  float w = wobble(q);
  f.dOut = sdCapsuleX(q, HALF_LEN, R_OUT) + w;
  f.dS = innerSolid(q, w);
  f.dOM = abs(f.dOut + 0.5 * T_OM) - 0.5 * T_OM;
  f.dIM = abs(f.dS + 0.5 * T_IM) - 0.5 * T_IM;
  f.dMat = f.dS + T_IM;
  f.remOM = cutRegion(q, STEP_OM);
  f.remIM = cutRegion(q, 0.0);
  f.remMat = cutRegion(q, -STEP_MAT);
  return f;
}

// x: distance, y: material id, z: signed distance to the intermembrane-space fluid.
// ids: 1 outer membrane (outside face), 2 outer membrane section, 3 inner membrane,
// 4 inner membrane section, 5 matrix, 6 matrix section, 7 outer membrane (face looking into the IMS).
vec3 mapFull(vec3 p) {
  vec3 q = unbend(p);
  float dOut0 = sdCapsuleX(q, HALF_LEN, R_OUT);
  if (dOut0 > 0.25) return vec3(dOut0 * 0.9, 0.0, 1.0);

  Fields f = fields(q);
  // Bevelled cuts: a small rounded lip catches the light along every step edge.
  float kOM = smax(f.dOM, -f.remOM, 0.006);
  float kIM = smax(f.dIM, -f.remIM, 0.005);
  float kMat = smax(f.dMat, -f.remMat, 0.006);

  float idOM = -f.remOM > f.dOM ? 2.0 : (f.dOut + 0.5 * T_OM > 0.0 ? 1.0 : 7.0);
  vec3 res = vec3(kOM, idOM, 0.0);
  if (kIM < res.x) res.xy = vec2(kIM, -f.remIM > f.dIM ? 4.0 : 3.0);
  if (kMat < res.x) res.xy = vec2(kMat, -f.remMat > f.dMat ? 6.0 : 5.0);

  // The intermembrane space: inside the outer membrane, outside the carved inner solid
  // (so the cristae lumens are part of it), cut flush with the inner membrane.
  res.z = max(max(f.dOut + T_OM, -f.dS), -f.remIM);
  return res;
}

float map(vec3 p) { return mapFull(p).x; }

vec3 calcNormal(vec3 p, float eps) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * map(p + k.xyy * eps) +
    k.yyx * map(p + k.yyx * eps) +
    k.yxy * map(p + k.yxy * eps) +
    k.xxx * map(p + k.xxx * eps)
  );
}

// ================================================================ noise ==

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Interleaved gradient noise: per-pixel decorrelation for stochastic terms.
float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}

// Sparse dome-shaped bumps (matrix granules on section faces).
float particles(vec3 p, float freq, float density, float radius) {
  vec3 g = p * freq;
  vec3 c = floor(g);
  vec3 f = fract(g);
  float h = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 o = vec3(float(i), float(j), float(k));
    vec3 cell = c + o;
    if (hash13(cell + 17.0) > density) continue;
    vec3 pt = o + 0.2 + 0.6 * hash33(cell);
    float d = length(f - pt) / radius;
    h = max(h, 1.0 - smoothstep(0.0, 1.0, d * d));
  }
  return h;
}

// =============================================================== lighting ==

vec3 toObject(vec3 dirWorld) { return normalize(mat3(uModelInv) * dirWorld); }
vec3 toWorld(vec3 dirObject) { return normalize(mat3(uModel) * dirObject); }

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// IQ's improved soft shadow: smooth penumbra, no terracing.
float softShadow(vec3 ro, vec3 rd, float w) {
  float res = 1.0;
  float t = 0.004;
  for (int i = 0; i < MAX_SHADOW_STEPS; i++) {
    if (i >= uShadowSteps) break;
    float h = map(ro + rd * t);
    res = min(res, h / (w * t));
    t += clamp(h, 0.002, 0.05);
    if (res < -1.0 || t > 3.0) break;
  }
  res = max(res, -1.0);
  return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
}

// Jittered ambient occlusion: tap offsets change per pixel and per sample, so
// accumulation dissolves the contour ripples fixed taps would leave.
float calcAO(vec3 p, vec3 n, float jitter) {
  float occ = 0.0;
  float sca = 1.0;
  float taps = float(uAoTaps);
  for (int i = 0; i < 8; i++) {
    if (i >= uAoTaps) break;
    float u = (float(i) + jitter) / taps;
    float h = 0.004 + 0.12 * u * u;
    occ += (h - map(p + h * n)) * sca;
    sca *= 0.85;
  }
  return clamp(1.0 - 3.2 * occ * 8.0 / taps, 0.0, 1.0);
}

// Coloured multi-bounce AO (Jimenez et al. 2016): occluded warm walls stay warm instead of going grey.
vec3 multiBounce(float ao, vec3 albedo) {
  vec3 a = 2.0404 * albedo - 0.3324;
  vec3 b = -4.7951 * albedo + 0.6417;
  vec3 c = 2.7552 * albedo + 0.6903;
  return max(vec3(ao), ((ao * a + b) * ao + c) * ao);
}

// 0 = very thin (membranes let light through), 1 = thick.
float localThickness(vec3 p, vec3 n) {
  float t = 0.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.022 * float(i);
    t += clamp(-map(p - n * h), 0.0, h) / h;
  }
  return t * 0.25;
}

// Studio environment with rectangular softboxes (long highlights along the bean, not round blobs).
float softbox(vec3 r, vec3 d, vec3 up, vec2 halfSize, float feather) {
  float c = dot(r, d);
  if (c <= 0.0) return 0.0;
  vec3 p = r / c - d;
  vec3 x = normalize(cross(up, d));
  vec3 y = cross(d, x);
  vec2 q = abs(vec2(dot(p, x), dot(p, y)));
  vec2 e = 1.0 - smoothstep(halfSize * (1.0 - feather), halfSize, q);
  return e.x * e.y;
}

vec3 envColor(vec3 r, float rough) {
  float up = r.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.012, 0.016, 0.024), vec3(0.11, 0.15, 0.21), smoothstep(0.25, 1.0, up));
  float f = mix(0.12, 0.6, rough);
  vec3 keyD = normalize(vec3(0.55, 0.75, 0.38));
  c += vec3(1.0, 0.88, 0.74) * 2.4 * softbox(r, keyD, cross(keyD, vec3(1.0, 0.0, 0.0)), vec2(1.1, 0.16), f);
  vec3 rimD = normalize(vec3(-0.72, 0.3, -0.62));
  c += vec3(0.45, 0.88, 1.0) * 1.6 * softbox(r, rimD, vec3(0.0, 1.0, 0.0), vec2(0.12, 0.9), f);
  c += vec3(0.8, 0.85, 0.9) * 0.25 * softbox(r, vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), vec2(0.9, 0.9), f);
  return c;
}

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

float V_SmithCorrelated(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / (gv + gl + 1e-5);
}

float F_Schlick(float VoH, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
}

float specularGGX(vec3 n, vec3 v, vec3 l, float rough) {
  float a = rough * rough;
  vec3 h = normalize(l + v);
  float NoL = clamp(dot(n, l), 0.0, 1.0);
  float NoV = clamp(dot(n, v), 1e-4, 1.0);
  return D_GGX(clamp(dot(n, h), 0.0, 1.0), a) * V_SmithCorrelated(NoV, NoL, a) * F_Schlick(clamp(dot(v, h), 0.0, 1.0), 0.04) * NoL;
}

// =============================================================== materials ==

struct Material {
  vec3 albedo;
  vec3 sss;
  float roughness;
  float translucency;
  float specular;
  float rim;
  float section;   // 1 = cut face: matte, compressed lighting, diagrammatic
  float layer;     // 0 outer membrane, 1 inner membrane, 2 matrix
};

// Phospholipid bilayer seen edge-on: dark head-group lines at both surfaces around a
// lighter core (the "railroad track" of electron micrographs), filtered by pixel footprint.
float bilayer(float s, float footprint) {
  float w = max(0.12, 1.2 * footprint);
  float x = (abs(s) - 0.82) / w;
  float lines = exp(-x * x) * (0.12 / w);
  float merge = 1.0 - smoothstep(1.5, 3.0, 2.0 / max(footprint, 1e-3));
  return clamp(mix(lines, 0.55, merge), 0.0, 1.0);
}

Material materialFor(float id, vec3 p, float pixel) {
  vec3 q = unbend(p);
  Fields f = fields(q);
  Material m;
  m.section = 0.0;
  m.translucency = 0.3;
  m.specular = 0.35;
  m.rim = 0.0;
  m.roughness = 0.6;
  m.sss = vec3(1.0);

  if (id < 2.5 || id > 6.5) {
    m.layer = 0.0;
    float cap = smoothstep(-0.004, 0.004, -f.remOM - f.dOM);
    float s = (f.dOut + 0.5 * T_OM) / (0.5 * T_OM);
    vec3 capCol = mix(uOuterCapColor, uOuterCapColor * 0.6, bilayer(s, pixel / (0.5 * T_OM)));
    vec3 skin = uOuterColor * (0.95 + 0.1 * vnoise(q * 1.4));
    if (id > 6.5) skin = uOuterColor * 0.82;
    m.albedo = mix(skin, capCol, cap);
    m.sss = uOuterSss;
    m.roughness = mix(id > 6.5 ? 0.7 : 0.42, 0.9, cap);
    m.specular = mix(id > 6.5 ? 0.3 : 0.9, 0.1, cap);
    m.translucency = mix(0.9, 0.3, cap);
    m.rim = id < 1.5 ? 1.0 - cap : 0.0;
    m.section = cap;
  } else if (id < 4.5) {
    m.layer = 1.0;
    float cap = smoothstep(-0.004, 0.004, -f.remIM - f.dIM);
    float s = (f.dS + 0.5 * T_IM) / (0.5 * T_IM);
    vec3 capCol = mix(uInnerCapColor, uInnerCapColor * 0.58, bilayer(s, pixel / (0.5 * T_IM)));
    m.albedo = mix(uInnerColor * (0.95 + 0.1 * vnoise(q * 9.0)), capCol, cap);
    m.sss = uInnerSss;
    m.roughness = mix(0.48, 0.9, cap);
    m.specular = mix(0.4, 0.1, cap);
    m.translucency = mix(1.0, 0.35, cap);
    m.rim = 0.25 * (1.0 - cap);
    m.section = cap;
  } else {
    m.layer = 2.0;
    float cap = smoothstep(-0.004, 0.004, -f.remMat - f.dMat);
    float granules = particles(q, 40.0, 0.38, 0.32) * (1.0 - smoothstep(0.004, 0.009, pixel));
    vec3 capCol = uMatrixCapColor * (0.97 + 0.06 * vnoise(q * 6.0)) * (1.0 - 0.32 * granules);
    m.albedo = mix(uMatrixColor, capCol, cap);
    m.sss = vec3(1.0, 0.75, 0.6);
    m.roughness = mix(0.7, 0.88, cap);
    m.specular = mix(0.3, 0.12, cap);
    m.translucency = 0.3;
    m.section = cap;
  }
  return m;
}

// Thin ink line along every cut edge (illustration convention: makes sections read as
// sections). Membrane sections are skipped: their bilayer lines already mark both faces.
float inkLine(float id, vec3 p, float pixel) {
  if ((id > 1.5 && id < 2.5) || (id > 3.5 && id < 4.5)) return 0.0;
  Fields f = fields(unbend(p));
  float e;
  if (id < 1.5) e = f.remOM;
  else if (id < 3.5) e = f.remIM;
  else if (id < 5.5) e = f.remMat;
  else if (id < 6.5) e = -f.dMat;
  else e = f.remOM;
  return 1.0 - smoothstep(0.6 * pixel, 1.6 * pixel, abs(e));
}

vec3 shade(vec3 pos, vec3 rd, float id, float t, float jitter) {
  float pixel = t * uPixelAngle;
  Material m = materialFor(id, pos, pixel);
  vec3 n = calcNormal(pos, clamp(0.5 * pixel, 1e-4, 2e-3));
  vec3 v = -rd;
  float NoV = clamp(dot(n, v), 1e-4, 1.0);
  float ao = calcAO(pos, n, jitter);
  vec3 nWorld = toWorld(n);

  // Key light; in accumulation mode, jittered over a small disk = true area light.
  vec3 L = toObject(uKeyDir);
  if (uAccumulate > 0.5) {
    vec3 tA = normalize(cross(L, vec3(0.0, 1.0, 0.0)));
    vec3 tB = cross(L, tA);
    float u1 = fract(jitter * 1.618 + 0.13);
    float u2 = fract(jitter * 2.414 + 0.71);
    vec2 disk = 0.06 * sqrt(u1) * vec2(cos(6.2832 * u2), sin(6.2832 * u2));
    L = normalize(L + disk.x * tA + disk.y * tB);
  }
  float NoL = dot(n, L);
  float lambert = clamp(NoL, 0.0, 1.0);
  float wrapD = clamp((NoL + 0.35) / 1.35, 0.0, 1.0);
  float sh = NoL > 0.0 ? softShadow(pos + n * 0.002, L, uAccumulate > 0.5 ? 0.02 : 0.06) : 1.0;
  float shW = mix(1.0, sh, smoothstep(0.0, 0.3, NoL));
  // Continuous terminator: the hard Lambert term carries the shadow, the wrap band
  // (a warm subsurface-like glow) fades smoothly, so there is no seam at n.L = 0.
  vec3 wrapTint = mix(vec3(1.0), m.sss, 0.5 * m.translucency);
  vec3 keyLin = uKeyColor * (lambert * sh + (wrapD - lambert) * mix(0.3, 1.0, shW) * wrapTint);

  // Fill and ambient keep hue: half-desaturated so pink stays pink in shadow.
  vec3 fillTint = mix(vec3(luma(uFillColor)), uFillColor, 0.5);
  vec3 bounce = multiBounce(ao, m.albedo);
  vec3 indirect = fillTint * clamp(0.5 + 0.5 * dot(n, toObject(uFillDir)), 0.0, 1.0);
  indirect += mix(uGroundColor, uSkyColor, nWorld.y * 0.5 + 0.5);
  // Faint warm bounce from below keeps shadowed membranes their own colour instead of black.
  indirect += vec3(1.0, 0.56, 0.42) * 0.1 * clamp(0.5 - 0.5 * nWorld.y, 0.0, 1.0);

  vec3 lin = keyLin + indirect * bounce;
  // Sections read as diagram planes: compressed lighting keeps their colour close to the code.
  lin = mix(lin, vec3(luma(lin)) * 0.55 + 0.55 * bounce, 0.45 * m.section);

  // Thin membranes glow when we look through them toward a light ("fast translucency").
  // While the view moves, a fixed estimate replaces the 4-tap thickness probe.
  float thin = uThickness > 0.5 ? 1.0 - localThickness(pos, n) : 0.6 * step(0.5, m.translucency);
  vec3 Lrim = toObject(uRimDir);
  float throughKey = pow(clamp(dot(v, -(L + n * 0.25)), 0.0, 1.0), 4.0);
  float throughRim = pow(clamp(dot(v, -(Lrim + n * 0.25)), 0.0, 1.0), 4.0);
  vec3 transmitted = (uKeyColor * throughKey + uRimColor * throughRim) * 0.5 * thin * m.translucency * m.sss;

  vec3 col = m.albedo * lin + transmitted * m.albedo;

  float specOcc = clamp(pow(NoV + ao, exp2(-16.0 * m.roughness - 1.0)) - 1.0 + ao, 0.0, 1.0);
  col += uKeyColor * specularGGX(n, v, L, m.roughness) * sh * m.specular;
  col += envColor(toWorld(reflect(-v, n)), m.roughness) * F_Schlick(NoV, 0.04) * specOcc * m.specular;

  // Directional rim: only where the surface faces the rim light, shadowed, skins only.
  if (m.rim > 0.0) {
    float rimMask = smoothstep(-0.1, 0.55, dot(n, Lrim));
    float rimSh = 1.0;
    if (uRimShadow > 0.5 && rimMask > 0.0) rimSh = softShadow(pos + n * 0.002, Lrim, 0.08);
    col += uRimColor * pow(1.0 - NoV, 5.0) * rimMask * rimSh * m.rim * 1.6;
  }

  col = max(col, m.albedo * 0.12);
  col *= 1.0 - 0.45 * inkLine(id, pos, pixel);
  return col;
}

// Focus + context: lift the focused compartment, mute the others.
vec3 applyFocus(vec3 col, float layer, float isFluid) {
  if (uFocusAmt <= 0.0) return col;
  float w = layer < 0.5 ? uFocus.x : (layer < 1.5 ? uFocus.z : uFocus.w);
  w = mix(w, uFocus.y, isFluid);
  vec3 muted = vec3(luma(col)) * 0.45;
  vec3 lifted = col * 1.12 + uSignalColor * 0.06;
  return mix(col, mix(muted, lifted, w), uFocusAmt);
}

// ================================================================== march ==

vec2 boxIntersect(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

vec3 rayDirection(vec2 fragCoord) {
  vec2 ndc = (fragCoord - uViewport.xy) / uViewport.zw * 2.0 - 1.0;
  vec4 v = uProjInv * vec4(ndc, -1.0, 1.0);
  v /= v.w;
  return normalize(mat3(uCamWorld) * v.xyz);
}

const vec2 SAMPLE_OFFSETS[4] = vec2[4](
  vec2(0.125, 0.375), vec2(0.375, -0.125), vec2(-0.125, -0.375), vec2(-0.375, 0.125)
);

void main() {
  vec3 ro = (uModelInv * vec4(cameraPosition, 1.0)).xyz;
  float pixelNoise = ign(gl_FragCoord.xy + 17.0 * uFrame);
  vec3 colorSum = vec3(0.0);
  float hits = 0.0;
  float nearestT = 1e9;
  vec3 nearestPos = vec3(0.0);

  for (int s = 0; s < MAX_SAMPLES; s++) {
    if (s >= uSamples) break;
    vec2 offset = uSamples == 1 ? vec2(0.0) : SAMPLE_OFFSETS[s];
    float jitter = fract(pixelNoise + 0.618034 * float(s) + 0.38197 * uFrame);
    vec3 rd = toObject(rayDirection(gl_FragCoord.xy + offset));
    vec2 tb = boxIntersect(ro, rd);
    if (tb.x > tb.y || tb.y < 0.0) continue;

    float t = max(tb.x, 0.0);
    float id = -1.0;
    float tau = 0.0;
    float bestRatio = 1e9;
    float bestT = t;
    float bestId = -1.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= uSteps) break;
      vec3 m = mapFull(ro + rd * t);
      float eps = max(1e-4, 0.35 * t * uPixelAngle);
      if (m.x < eps) { id = m.y; break; }
      float ratio = m.x / t;
      if (ratio < bestRatio && m.y > 0.5) { bestRatio = ratio; bestT = t; bestId = m.y; }
      // Stop exactly on the fluid boundary so its path length is measured accurately.
      float stepLen = min(m.x, max(abs(m.z), 0.0015)) * 0.7;
      if (m.z < 0.0) tau += stepLen;
      t += stepLen;
      if (t > tb.y) break;
    }
    // Grazing rays in thin lumens can run out of steps: shade the closest approach
    // instead of punching a hole through the organelle.
    if (id < 0.5 && bestId > 0.5 && bestRatio < 0.004 && t < tb.y) {
      t = bestT;
      id = bestId;
    }
    if (id < 0.5) continue;

    vec3 pos = ro + rd * t;
    vec3 col = shade(pos, rd, id, t, jitter);
    float layer = (id < 2.5 || id > 6.5) ? 0.0 : (id < 4.5 ? 1.0 : 2.0);
    col = applyFocus(col, layer, 0.0);

    // The intermembrane space as a softly lit aqueous medium (Beer-Lambert).
    float Tr = exp(-SIGMA_IMS * tau);
    vec3 fillTint = mix(vec3(luma(uFillColor)), uFillColor, 0.5);
    vec3 fluid = uImsColor * (0.65 * (uSkyColor + uGroundColor) + 0.6 * fillTint + 0.14 * uKeyColor);
    fluid = applyFocus(fluid, 0.0, 1.0);
    col = col * Tr + fluid * (1.0 - Tr);

    colorSum += col;
    hits += 1.0;
    if (t < nearestT) {
      nearestT = t;
      nearestPos = pos;
    }
  }

  if (hits < 0.5) discard;

  vec4 clip = uViewProj * (uModel * vec4(nearestPos, 1.0));
  gl_FragDepth = clamp(0.5 * clip.z / clip.w + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(colorSum / hits, hits / float(uSamples) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
