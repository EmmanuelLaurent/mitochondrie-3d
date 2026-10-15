import * as THREE from 'three'

/**
 * The aqueous compartments as tinted participating media (Beer–Lambert), the same
 * convention as the intermembrane space of scene 1: hue and haze tell the student which
 * compartment a molecule is in (cool cytosol, blue-grey IMS, warm matrix). Every
 * molecular-scale material and the backdrop evaluate the same analytic ray/box
 * integral, so geometry and empty water tint identically. Flat sets use three slabs; a
 * curved crista adds boxes cut by a cylinder along z (the half-round tip of its lumen,
 * and the matrix around it).
 */

/** In-scattered radiance (linear) and extinction per nm of each compartment: conventional tints from scene 1's palette. */
export const MEDIUM_TINTS = {
  cytosol: { color: '#10161e', sigma: 0.012 },
  intermembraneSpace: { color: '#2a4152', sigma: 0.045 },
  matrix: { color: '#5a4636', sigma: 0.035 },
} as const

export type MediumKind = keyof typeof MEDIUM_TINTS

/** A cylinder along z (centre x, y and radius, in the xy plane) that cuts a medium's box. */
export interface MediumCylinder {
  x: number
  y: number
  radius: number
  /** 'inside': the box ∩ the cylinder; 'outside': the box minus the cylinder. */
  keep: 'inside' | 'outside'
}

/** One compartment region: a box, optionally cut by a cylinder (regions must not overlap). */
export interface Medium {
  box: THREE.Box3
  kind: MediumKind
  cylinder?: MediumCylinder
}

export type MediaLayout = readonly Medium[]

export interface MediaUniforms {
  uMediaMin: THREE.IUniform<THREE.Vector3[]>
  uMediaMax: THREE.IUniform<THREE.Vector3[]>
  uMediaColor: THREE.IUniform<THREE.Color[]>
  uMediaSigma: THREE.IUniform<number[]>
  /** Cylinder cut per entry: (x, y, radius, mode), mode 0 none, 1 inside, 2 and 3 the two runs outside. */
  uMediaShape: THREE.IUniform<THREE.Vector4[]>
  uMediaAmount: THREE.IUniform<number>
}

/**
 * The shader entries of a layout: a box minus a cylinder can hold two runs of a ray (in
 * front of and behind the hole), so it takes two entries.
 */
function mediaEntries(layout: MediaLayout): { medium: Medium; shape: THREE.Vector4 }[] {
  return layout.flatMap((medium) => {
    const c = medium.cylinder
    if (!c) return [{ medium, shape: new THREE.Vector4(0, 0, 0, 0) }]
    if (c.keep === 'inside') return [{ medium, shape: new THREE.Vector4(c.x, c.y, c.radius, 1) }]
    return [2, 3].map((mode) => ({ medium, shape: new THREE.Vector4(c.x, c.y, c.radius, mode) }))
  })
}

export function createMediaUniforms(layout: MediaLayout): MediaUniforms {
  const entries = mediaEntries(layout)
  return {
    uMediaMin: { value: entries.map(({ medium }) => medium.box.min.clone()) },
    uMediaMax: { value: entries.map(({ medium }) => medium.box.max.clone()) },
    uMediaColor: { value: entries.map(({ medium }) => new THREE.Color(MEDIUM_TINTS[medium.kind].color)) },
    uMediaSigma: { value: entries.map(({ medium }) => MEDIUM_TINTS[medium.kind].sigma) },
    uMediaShape: { value: entries.map(({ shape }) => shape) },
    uMediaAmount: { value: 1 },
  }
}

/**
 * GLSL for `count` non-overlapping regions: each ray's chord through every region (a box,
 * or a box cut by a cylinder along z), then front-to-back compositing of the regions
 * crossed before the surface hit (ordered by entry distance, ties broken by index).
 */
export function mediaPars(count: number): string {
  return /* glsl */ `
#define MEDIA_COUNT ${count}
uniform vec3 uMediaMin[MEDIA_COUNT];
uniform vec3 uMediaMax[MEDIA_COUNT];
uniform vec3 uMediaColor[MEDIA_COUNT];
uniform float uMediaSigma[MEDIA_COUNT];
uniform vec4 uMediaShape[MEDIA_COUNT];
uniform float uMediaAmount;

vec2 mediaBoxChord(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 lo = min(t0, t1);
  vec3 hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

// Chord of the ray through an infinite cylinder along z (centre xy, radius z of 'c').
vec2 mediaCylinderChord(vec3 ro, vec3 rd, vec3 c) {
  vec2 o = ro.xy - c.xy;
  float a = dot(rd.xy, rd.xy);
  float b = dot(o, rd.xy);
  float k = dot(o, o) - c.z * c.z;
  if (a < 1e-10) return k <= 0.0 ? vec2(-1e30, 1e30) : vec2(1e30, -1e30);
  float disc = b * b - a * k;
  if (disc < 0.0) return vec2(1e30, -1e30);
  float s = sqrt(disc);
  return vec2((-b - s) / a, (-b + s) / a);
}

vec2 mediaChord(vec3 ro, vec3 rd, int i) {
  vec2 box = mediaBoxChord(ro, rd, uMediaMin[i], uMediaMax[i]);
  vec4 shape = uMediaShape[i];
  if (shape.w < 0.5) return box;
  vec2 cyl = mediaCylinderChord(ro, rd, shape.xyz);
  if (shape.w < 1.5) return vec2(max(box.x, cyl.x), min(box.y, cyl.y));
  // Box minus cylinder: the run in front of the hole (mode 2), the run behind it (mode 3).
  bool hole = cyl.x < cyl.y && cyl.x < box.y && cyl.y > box.x;
  if (shape.w < 2.5) return hole ? vec2(box.x, min(box.y, cyl.x)) : box;
  return hole ? vec2(max(box.x, cyl.y), box.y) : vec2(1e30, -1e30);
}

vec3 applyMedia(vec3 col, vec3 ro, vec3 rd, float tHit) {
  if (uMediaAmount <= 0.0) return col;
  vec2 chords[MEDIA_COUNT];
  for (int i = 0; i < MEDIA_COUNT; i++) chords[i] = mediaChord(ro, rd, i);
  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);
  float lastEntry = -1e30;
  int lastIndex = -1;
  for (int k = 0; k < MEDIA_COUNT; k++) {
    int best = -1;
    float bestEntry = 1e30;
    for (int i = 0; i < MEDIA_COUNT; i++) {
      float e = chords[i].x;
      bool after = e > lastEntry || (e == lastEntry && i > lastIndex);
      if (after && (e < bestEntry || (e == bestEntry && best < 0))) { best = i; bestEntry = e; }
    }
    if (best < 0) break;
    lastEntry = bestEntry;
    lastIndex = best;
    vec2 c = chords[best];
    float a = max(c.x, 0.0);
    float b = min(c.y, tHit);
    if (b <= a) continue;
    float T = exp(-uMediaSigma[best] * uMediaAmount * (b - a));
    scattered += transmittance * uMediaColor[best] * (1.0 - T);
    transmittance *= T;
  }
  return col * transmittance + scattered * uMediaAmount;
}
`
}

/** Optional per-material extras on top of the media. */
export interface PatchOptions {
  /** 0..1: desaturate and darken (focus + context: the active actor stays lit). */
  dim?: THREE.IUniform<number>
  /**
   * Instanced lipid heads: darken the half of each head that faces into the membrane
   * (stand-in for the occlusion of packed neighbours and tails).
   * Requires a per-instance float attribute `aLeaflet` (+1 upper leaflet, -1 lower).
   */
  headOcclusion?: boolean
  /** Further shader edits applied after the media injection (procedural surfaces). */
  extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void
  /** Distinguishes program variants created by `extra`. */
  cacheKey?: string
}

/** Injects the compartment media (and options) into a built-in lit material. */
export function patchMaterial(material: THREE.Material, media: MediaUniforms, options: PatchOptions = {}): void {
  const dim = options.dim
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, media)
    if (dim) shader.uniforms.uDim = dim

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMediaWorldPos;
        ${options.headOcclusion ? 'attribute float aLeaflet;\nvarying float vHeadFacing;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 mediaWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mediaWorld = instanceMatrix * mediaWorld;
          #endif
          vMediaWorldPos = (modelMatrix * mediaWorld).xyz;
          ${
            options.headOcclusion
              ? `vec3 headNormal = objectNormal;
                 #ifdef USE_INSTANCING
                   headNormal = mat3(instanceMatrix) * headNormal;
                 #endif
                 vHeadFacing = normalize(mat3(modelMatrix) * headNormal).y * aLeaflet;`
              : ''
          }
        }`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMediaWorldPos;
        ${options.headOcclusion ? 'varying float vHeadFacing;' : ''}
        ${dim ? 'uniform float uDim;' : ''}
        ${mediaPars(media.uMediaMin.value.length)}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${options.headOcclusion ? 'diffuseColor.rgb *= mix(0.4, 1.0, smoothstep(-0.2, 0.85, vHeadFacing));' : ''}`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `${
          dim
            ? `{
                float l = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(l) * 0.45, 0.8 * uDim);
              }`
            : ''
        }
        {
          vec3 mediaRay = vMediaWorldPos - cameraPosition;
          float mediaT = length(mediaRay);
          gl_FragColor.rgb = applyMedia(gl_FragColor.rgb, cameraPosition, mediaRay / mediaT, mediaT);
        }
        #include <tonemapping_fragment>`,
      )
    options.extra?.(shader)
  }
  // Distinct program cache keys per variant (three caches programs by onBeforeCompile source).
  const key = `molecular-media${media.uMediaMin.value.length}-${options.headOcclusion ? 'h' : ''}${dim ? 'd' : ''}-${options.cacheKey ?? ''}`
  material.customProgramCacheKey = () => key
}

/**
 * Studio backdrop as a full-screen pass drawn behind everything: scene 1's screen-space
 * gradient and soft glow (so the zoom from scene 1 starts on the same picture), with
 * the compartment media integrated to infinity along each pixel's ray.
 */
export function createBackdrop(media: MediaUniforms): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...media,
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vNdc;
      void main() {
        vNdc = position.xy;
        gl_Position = vec4(position.xy, 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform mat4 uProjInv;
      uniform mat4 uCamWorld;
      varying vec2 vNdc;
      ${mediaPars(media.uMediaMin.value.length)}

      vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }

      void main() {
        vec2 uv = vNdc * 0.5 + 0.5;
        // Scene 1's canvas gradient: #16212d (top) -> #0c121a (55%) -> #05070a (bottom).
        vec3 top = srgbToLinear(vec3(0.086, 0.129, 0.176));
        vec3 mid = srgbToLinear(vec3(0.047, 0.071, 0.102));
        vec3 bottom = srgbToLinear(vec3(0.020, 0.027, 0.039));
        float y = 1.0 - uv.y;
        vec3 col = y < 0.55 ? mix(top, mid, y / 0.55) : mix(mid, bottom, (y - 0.55) / 0.45);
        float glow = 1.0 - smoothstep(0.0, 0.6, distance(uv, vec2(0.42, 0.6)));
        col += srgbToLinear(vec3(0.27, 0.47, 0.59)) * 0.3 * glow * glow;

        vec4 v = uProjInv * vec4(vNdc, 1.0, 1.0);
        vec3 rd = normalize(mat3(uCamWorld) * (v.xyz / v.w));
        gl_FragColor = vec4(applyMedia(col, cameraPosition, rd, 1e6), 1.0);
      }
    `,
    depthTest: true,
    depthWrite: false,
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    material.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse)
    material.uniforms.uCamWorld.value.copy(camera.matrixWorld)
  }
  return mesh
}
