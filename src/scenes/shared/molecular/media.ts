import * as THREE from 'three'

/**
 * The aqueous compartments as tinted participating media (Beer–Lambert), the same
 * convention as the intermembrane space of scene 1: hue and haze tell the student which
 * compartment a molecule is in (cool cytosol, blue-grey IMS, warm matrix). Every
 * molecular-scale material and the backdrop evaluate the same analytic ray/box
 * integral, so geometry and empty water tint identically. Three slabs per set.
 */

/** In-scattered radiance (linear) and extinction per nm of each compartment: conventional tints from scene 1's palette. */
export const MEDIUM_TINTS = {
  cytosol: { color: '#10161e', sigma: 0.012 },
  intermembraneSpace: { color: '#2a4152', sigma: 0.045 },
  matrix: { color: '#5a4636', sigma: 0.035 },
} as const

export type MediumKind = keyof typeof MEDIUM_TINTS

/** One compartment slab (boxes must not overlap). */
export interface Medium {
  box: THREE.Box3
  kind: MediumKind
}

export type MediaLayout = readonly [Medium, Medium, Medium]

export interface MediaUniforms {
  uMediaMin: THREE.IUniform<THREE.Vector3[]>
  uMediaMax: THREE.IUniform<THREE.Vector3[]>
  uMediaColor: THREE.IUniform<THREE.Color[]>
  uMediaSigma: THREE.IUniform<number[]>
  uMediaAmount: THREE.IUniform<number>
}

export function createMediaUniforms(layout: MediaLayout): MediaUniforms {
  return {
    uMediaMin: { value: layout.map((medium) => medium.box.min.clone()) },
    uMediaMax: { value: layout.map((medium) => medium.box.max.clone()) },
    uMediaColor: { value: layout.map((medium) => new THREE.Color(MEDIUM_TINTS[medium.kind].color)) },
    uMediaSigma: { value: layout.map((medium) => MEDIUM_TINTS[medium.kind].sigma) },
    uMediaAmount: { value: 1 },
  }
}

export const MEDIA_PARS = /* glsl */ `
uniform vec3 uMediaMin[3];
uniform vec3 uMediaMax[3];
uniform vec3 uMediaColor[3];
uniform float uMediaSigma[3];
uniform float uMediaAmount;

vec2 mediaChord(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 lo = min(t0, t1);
  vec3 hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

// Front-to-back compositing through the (non-overlapping) slabs crossed before tHit.
vec3 applyMedia(vec3 col, vec3 ro, vec3 rd, float tHit) {
  if (uMediaAmount <= 0.0) return col;
  vec2 c0 = mediaChord(ro, rd, uMediaMin[0], uMediaMax[0]);
  vec2 c1 = mediaChord(ro, rd, uMediaMin[1], uMediaMax[1]);
  vec2 c2 = mediaChord(ro, rd, uMediaMin[2], uMediaMax[2]);
  // Sort the three slabs by entry distance (tiny fixed network).
  vec3 entry = vec3(c0.x, c1.x, c2.x);
  ivec3 order = ivec3(0, 1, 2);
  if (entry.y < entry.x) { entry.xy = entry.yx; order.xy = order.yx; }
  if (entry.z < entry.y) { entry.yz = entry.zy; order.yz = order.zy; }
  if (entry.y < entry.x) { entry.xy = entry.yx; order.xy = order.yx; }
  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    int i = k == 0 ? order.x : (k == 1 ? order.y : order.z);
    vec2 c = i == 0 ? c0 : (i == 1 ? c1 : c2);
    float a = max(c.x, 0.0);
    float b = min(c.y, tHit);
    if (b <= a) continue;
    float T = exp(-uMediaSigma[i] * uMediaAmount * (b - a));
    scattered += transmittance * uMediaColor[i] * (1.0 - T);
    transmittance *= T;
  }
  return col * transmittance + scattered * uMediaAmount;
}
`

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
        ${MEDIA_PARS}`,
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
  const key = `molecular-media-${options.headOcclusion ? 'h' : ''}${dim ? 'd' : ''}-${options.cacheKey ?? ''}`
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
      ${MEDIA_PARS}

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
