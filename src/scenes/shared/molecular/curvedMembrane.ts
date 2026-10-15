import * as THREE from 'three'
import { mulberry32 } from '../../scene1-exterior/mitochondrionGeometry'
import { BILAYER, BILAYER_HALF } from './frame'
import { patchMaterial, type MediaUniforms } from './media'

/**
 * A membrane that follows a 2D profile (in the xy plane) extruded along z — e.g. the
 * U-shaped tip of a crista in section. Same look as the flat membrane: instanced head
 * groups on both leaflets (spaced along each leaflet's own arc length, so they stay
 * packed on the inner and outer side of a bend), full lipids with tails along the front
 * cut, a dark core behind them, and procedural sheets that continue the membrane beyond
 * the detailed zone (hex head pattern in profile/z coordinates).
 */

/** A point of the profile and its unit normal, pointing to the « upper » leaflet's side. */
export interface ProfileSample {
  p: THREE.Vector2
  n: THREE.Vector2
}

/** A polyline profile sampled finely, with its arc length. */
export class Profile {
  readonly points: ProfileSample[]
  readonly lengths: number[]

  constructor(points: ProfileSample[]) {
    this.points = points
    this.lengths = [0]
    for (let i = 1; i < points.length; i++) this.lengths.push(this.lengths[i - 1] + points[i].p.distanceTo(points[i - 1].p))
  }

  get length(): number {
    return this.lengths[this.lengths.length - 1]
  }

  /** Point and normal at arc length s (linear between samples). */
  at(s: number): ProfileSample {
    const target = THREE.MathUtils.clamp(s, 0, this.length)
    let lo = 0
    let hi = this.lengths.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.lengths[mid] <= target) lo = mid
      else hi = mid
    }
    const span = this.lengths[hi] - this.lengths[lo] || 1
    const u = (target - this.lengths[lo]) / span
    const a = this.points[lo]
    const b = this.points[hi]
    return { p: a.p.clone().lerp(b.p, u), n: a.n.clone().lerp(b.n, u).normalize() }
  }

  /** The same profile offset by `d` along its normals. */
  offset(d: number): Profile {
    return new Profile(this.points.map((sample) => ({ p: sample.p.clone().addScaledVector(sample.n, d), n: sample.n.clone() })))
  }
}

/**
 * The tip of a crista: two flanks (x = ±radius, from y = 0 up to `height`) joined by a
 * half circle below y = 0, normals pointing into the lumen (the intermembrane space).
 * Arc length runs from the top of the left flank, down, around, and up the right flank.
 */
export function cristaProfile(radius: number, height: number, step = 0.25): Profile {
  const points: ProfileSample[] = []
  for (let y = height; y > 0; y -= step) points.push({ p: new THREE.Vector2(-radius, y), n: new THREE.Vector2(1, 0) })
  const arcSteps = Math.ceil((Math.PI * radius) / step)
  for (let i = 0; i <= arcSteps; i++) {
    const a = Math.PI + (i / arcSteps) * Math.PI // from the left (π) around the bottom to the right (2π)
    const p = new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius)
    points.push({ p, n: p.clone().multiplyScalar(-1 / radius) })
  }
  for (let y = step; y <= height; y += step) points.push({ p: new THREE.Vector2(radius, y), n: new THREE.Vector2(-1, 0) })
  return new Profile(points)
}

export interface CurvedHole {
  /** Arc length along the mid-plane profile. */
  s: number
  z: number
  radius: number
  leaflets: 'both' | 'upper' | 'lower'
}

export interface CurvedMembraneOptions {
  profile: Profile
  /** Instanced lipids only for arc lengths in [sMin, sMax] and z in [zMin, cutZ]. */
  detail: { sMin: number; sMax: number; zMin: number }
  cutZ: number
  /** How far the procedural sheets continue behind (−z). */
  depth: number
  headColor: string
  tailColor: string
  holes: CurvedHole[]
  media: MediaUniforms
  low: boolean
  seed: number
}

export interface CurvedMembrane {
  group: THREE.Group
  dim: THREE.IUniform<number>
}

/** Orientation that turns local +y into the 3D direction of a profile normal (in the xy plane). */
function upTo(n: THREE.Vector2): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, 0))
}

function createTailGeometry(color: THREE.Color): THREE.BufferGeometry {
  const { tailLength, tailRadius, headRadius } = BILAYER
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  for (const side of [-1, 1]) {
    const chain = new THREE.CapsuleGeometry(tailRadius, tailLength - 2 * tailRadius, 2, 6).toNonIndexed()
    chain.translate(0, -(headRadius * 0.55 + tailLength / 2), 0)
    chain.rotateZ(side * 0.09)
    chain.translate(side * 0.19, 0, 0)
    const p = chain.getAttribute('position').array as Float32Array
    positions.push(...p)
    normals.push(...(chain.getAttribute('normal').array as Float32Array))
    for (let i = 0; i < p.length; i += 3) {
      const depth = THREE.MathUtils.clamp((-headRadius * 0.55 - p[i + 1]) / tailLength, 0, 1)
      const shade = THREE.MathUtils.lerp(1.0, 0.55, depth)
      colors.push(color.r * shade, color.g * shade, color.b * shade)
    }
    chain.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

/** A strip following a profile, extruded along z from z0 to z1 (uv.x = arc length, uv.y = z). */
function profileStrip(profile: Profile, z0: number, z1: number, flipNormals: boolean): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  profile.points.forEach((sample, i) => {
    for (const z of [z0, z1]) {
      positions.push(sample.p.x, sample.p.y, z)
      const sign = flipNormals ? -1 : 1
      normals.push(sample.n.x * sign, sample.n.y * sign, 0)
      uvs.push(profile.lengths[i], z)
    }
    if (i > 0) {
      const a = 2 * (i - 1)
      const b = 2 * i
      if (flipNormals) indices.push(a, b, a + 1, b, b + 1, a + 1)
      else indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/**
 * Hex head pattern in strip coordinates (vUv = arc length, z), like the flat carpet:
 * domes shade the normal; inside the detailed zone only the dark gaps show.
 */
function sheetShader(detail: CurvedMembraneOptions['detail'], cutZ: number, holes: THREE.Vector4[]): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  const f = (x: number): string => x.toFixed(3)
  return (shader) => {
    shader.uniforms.uSheetHoles = { value: holes }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSheetUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSheetUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vSheetUv;
        uniform vec4 uSheetHoles[4];
        float sheetDome;
        float sheetFade;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        for (int i = 0; i < 4; i++) {
          vec4 hole = uSheetHoles[i];
          if (hole.w > 0.0 && distance(vSheetUv, hole.xy) < hole.w) discard;
        }
        {
          vec2 p = vSheetUv / ${f(BILAYER.spacing)};
          vec2 r = vec2(1.0, 1.7320508);
          vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h;
          vec2 b = mod(p - h, r) - h;
          vec2 g = dot(a, a) < dot(b, b) ? a : b;
          float d = length(g) * ${f(BILAYER.spacing)} / ${f(BILAYER.headRadius)};
          sheetDome = sqrt(max(0.0, 1.0 - d * d));
          vec2 fw = fwidth(p);
          sheetFade = smoothstep(0.3, 0.8, max(fw.x, fw.y));
          bool inDetail = vSheetUv.x > ${f(detail.sMin)} && vSheetUv.x < ${f(detail.sMax)} && vSheetUv.y > ${f(detail.zMin)} && vSheetUv.y < ${f(cutZ)};
          if (inDetail) { sheetDome = 0.0; sheetFade = 0.0; }
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(mix(0.42, 1.0, sqrt(sheetDome)), 0.8, sheetFade);`,
      )
  }
}

/** The bilayer in section on the cut face (vSheetUv.y = signed distance from the mid-plane). */
function sectionShader(headColor: THREE.Color): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  const f = (x: number): string => x.toFixed(3)
  return (shader) => {
    shader.uniforms.uHeadColor = { value: headColor }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSheetUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSheetUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vSheetUv;\nuniform vec3 uHeadColor;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float s = abs(vSheetUv.y);
          float cell = fract(vSheetUv.x / ${f(BILAYER.spacing)}) - 0.5;
          float dx = cell * ${f(BILAYER.spacing)};
          float dy = s - ${f(BILAYER.headOffset)};
          float head = 1.0 - smoothstep(0.75, 1.0, length(vec2(dx, dy)) / ${f(BILAYER.headRadius)});
          float fw = fwidth(vSheetUv.x / ${f(BILAYER.spacing)});
          head = mix(head, 0.55 * (1.0 - smoothstep(0.0, ${f(BILAYER.headRadius)}, abs(dy))), smoothstep(0.3, 0.8, fw));
          float depth = smoothstep(0.0, 1.6, ${f(BILAYER.headOffset)} - s);
          vec3 core = diffuseColor.rgb * mix(0.78, 0.48, depth);
          diffuseColor.rgb = mix(core, uHeadColor * 0.85, head);
        }`,
      )
  }
}

/** A flat band on the cut plane covering the bilayer's thickness along the profile (uv.y = across). */
function sectionBand(profile: Profile, sFrom: number, sTo: number, z: number): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const steps = Math.max(2, Math.ceil((sTo - sFrom) / 0.25))
  for (let i = 0; i <= steps; i++) {
    const s = THREE.MathUtils.lerp(sFrom, sTo, i / steps)
    const sample = profile.at(s)
    for (const side of [-1, 1]) {
      positions.push(sample.p.x + sample.n.x * side * BILAYER_HALF, sample.p.y + sample.n.y * side * BILAYER_HALF, z)
      normals.push(0, 0, 1)
      uvs.push(s, side * BILAYER_HALF)
    }
    if (i > 0) {
      const a = 2 * (i - 1)
      const b = 2 * i
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

export function createCurvedMembrane(options: CurvedMembraneOptions): CurvedMembrane {
  const rand = mulberry32(options.seed)
  const { spacing, headRadius, headOffset, edgeRows } = BILAYER
  const { profile, detail, cutZ } = options
  const rowStep = (spacing * Math.sqrt(3)) / 2
  const edgeBand = rowStep * edgeRows
  const headColor = new THREE.Color(options.headColor)
  const tailColor = new THREE.Color(options.tailColor)
  const dim = { value: 0 }
  const group = new THREE.Group()

  const domeMatrices: THREE.Matrix4[] = []
  const domeColors: THREE.Color[] = []
  const domeLeaflets: number[] = []
  const edgeMatrices: THREE.Matrix4[] = []
  const edgeColors: THREE.Color[] = []
  const edgeLeaflets: number[] = []
  const m = new THREE.Matrix4()
  const inHole = (s: number, z: number, upper: boolean): boolean =>
    options.holes.some((hole) => {
      if (hole.leaflets === 'upper' && !upper) return false
      if (hole.leaflets === 'lower' && upper) return false
      const r = hole.radius + headRadius * 0.6
      return (s - hole.s) ** 2 + (z - hole.z) ** 2 < r * r
    })

  for (const leaflet of [1, -1]) {
    const upper = leaflet === 1
    const surface = profile.offset(leaflet * headOffset)
    // Arc-length positions on this leaflet's own surface, mapped back to mid-plane s for holes.
    const scale = surface.length / profile.length
    const rows = Math.floor((cutZ - detail.zMin) / rowStep)
    for (let r = 0; r <= rows; r++) {
      const z = cutZ - 0.3 - r * rowStep - (upper ? 0 : rowStep / 3)
      const onEdge = cutZ - z < edgeBand
      const offset = (r % 2 ? spacing / 2 : 0) + (upper ? 0 : spacing / 3)
      for (let su = detail.sMin * scale + offset; su <= detail.sMax * scale; su += spacing) {
        const sample = surface.at(su + (rand() - 0.5) * 0.12)
        const jz = z + (rand() - 0.5) * 0.14
        if (jz > cutZ - 0.15 || jz < detail.zMin) continue
        if (inHole(su / scale, jz, upper)) continue
        const radial = (rand() - 0.5) * 0.14
        const position = new THREE.Vector3(sample.p.x + sample.n.x * leaflet * radial, sample.p.y + sample.n.y * leaflet * radial, jz)
        const up = sample.n.clone().multiplyScalar(leaflet)
        const scaleK = 1 + (rand() - 0.5) * 0.12
        const shade = headColor.clone().multiplyScalar(0.9 + rand() * 0.18)
        if (onEdge) {
          const tilt = upTo(up).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25)))
          m.compose(position, tilt, new THREE.Vector3(scaleK, scaleK, scaleK))
          edgeMatrices.push(m.clone())
          edgeColors.push(shade)
          edgeLeaflets.push(leaflet)
        } else {
          m.compose(position, upTo(up), new THREE.Vector3(scaleK, scaleK, scaleK))
          domeMatrices.push(m.clone())
          domeColors.push(shade)
          domeLeaflets.push(leaflet)
        }
      }
    }
  }

  const headMaterial = (): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, envMapIntensity: 0.35 })
    patchMaterial(material, options.media, { dim, headOcclusion: true, cacheKey: 'curved' })
    return material
  }
  // Head occlusion needs « up » = the leaflet's outward normal: here every head is rotated
  // so its local +y points out of the membrane, hence a leaflet sign of +1 for all.
  const domeGeometry = new THREE.SphereGeometry(headRadius, options.low ? 6 : 8, options.low ? 2 : 3, 0, Math.PI * 2, 0, Math.PI / 2)
  domeGeometry.setAttribute('aLeaflet', new THREE.InstancedBufferAttribute(new Float32Array(domeLeaflets.map(() => 1)), 1))
  const domes = new THREE.InstancedMesh(domeGeometry, headMaterial(), domeMatrices.length)
  domeMatrices.forEach((matrix, i) => {
    domes.setMatrixAt(i, matrix)
    domes.setColorAt(i, domeColors[i])
  })
  domes.receiveShadow = true
  domes.computeBoundingSphere()
  group.add(domes)

  const edgeGeometry = new THREE.IcosahedronGeometry(headRadius, 1)
  edgeGeometry.setAttribute('aLeaflet', new THREE.InstancedBufferAttribute(new Float32Array(edgeLeaflets.map(() => 1)), 1))
  const edgeHeads = new THREE.InstancedMesh(edgeGeometry, headMaterial(), edgeMatrices.length)
  edgeMatrices.forEach((matrix, i) => {
    edgeHeads.setMatrixAt(i, matrix)
    edgeHeads.setColorAt(i, edgeColors[i])
  })
  edgeHeads.castShadow = !options.low
  edgeHeads.receiveShadow = true
  edgeHeads.computeBoundingSphere()
  group.add(edgeHeads)

  const tailMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, envMapIntensity: 0.2 })
  patchMaterial(tailMaterial, options.media, { dim })
  const tails = new THREE.InstancedMesh(createTailGeometry(tailColor), tailMaterial, edgeMatrices.length)
  edgeMatrices.forEach((matrix, i) => tails.setMatrixAt(i, matrix))
  tails.castShadow = !options.low
  tails.receiveShadow = true
  tails.computeBoundingSphere()
  group.add(tails)

  // Dark core behind the rows of full lipids (so nothing shows through between them),
  // interrupted where a protein crossing the membrane goes through its plane.
  const coreMaterial = new THREE.MeshStandardMaterial({ color: tailColor.clone().multiplyScalar(0.4), roughness: 0.85 })
  patchMaterial(coreMaterial, options.media, { dim })
  const coreZ = cutZ - edgeBand - 0.1
  const gaps = options.holes
    .filter((hole) => hole.leaflets === 'both' && Math.abs(hole.z - coreZ) < hole.radius)
    .map((hole) => {
      const half = Math.sqrt(hole.radius ** 2 - (hole.z - coreZ) ** 2)
      return [hole.s - half, hole.s + half] as const
    })
    .sort((a, b) => a[0] - b[0])
  let from = detail.sMin
  for (const [a, b] of [...gaps, [detail.sMax, detail.sMax] as const]) {
    const to = Math.min(a, detail.sMax)
    if (to - from > 0.05) group.add(new THREE.Mesh(sectionBand(profile, from, to, coreZ), coreMaterial))
    from = Math.max(from, b)
  }

  // Procedural sheets on both faces, the whole profile, behind as far as `depth`.
  const holes = options.holes
    .filter((hole) => hole.leaflets === 'both')
    .slice(0, 4)
    .map((hole) => new THREE.Vector4(hole.s, hole.z, hole.radius, 1))
  while (holes.length < 4) holes.push(new THREE.Vector4(0, 0, 0, 0))
  for (const leaflet of [1, -1]) {
    const material = new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.75, envMapIntensity: 0.08 })
    patchMaterial(material, options.media, { dim, extra: sheetShader(detail, cutZ, holes), cacheKey: `sheet${leaflet}:${detail.sMin},${detail.sMax},${detail.zMin},${cutZ}` })
    const sheet = new THREE.Mesh(profileStrip(profile.offset(leaflet * headOffset), cutZ - options.depth, cutZ, leaflet === -1), material)
    sheet.receiveShadow = true
    group.add(sheet)
  }

  // The section on the cut face beyond the detailed zone.
  const sectionMaterial = new THREE.MeshStandardMaterial({ color: tailColor, roughness: 0.85, envMapIntensity: 0.15 })
  patchMaterial(sectionMaterial, options.media, { dim, extra: sectionShader(headColor), cacheKey: 'curved-section' })
  for (const [from, to] of [
    [0, detail.sMin],
    [detail.sMax, profile.length],
  ]) {
    if (to - from < 0.01) continue
    const section = new THREE.Mesh(sectionBand(profile, from, to, cutZ), sectionMaterial)
    section.receiveShadow = true
    group.add(section)
  }

  return { group, dim }
}
