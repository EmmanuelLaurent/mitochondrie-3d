import * as THREE from 'three'
import { mulberry32 } from '../../scene1-exterior/mitochondrionGeometry'
import { BILAYER, BILAYER_HALF, CUT_Z as DEFAULT_CUT_Z, FRAME, type MembranePatch, type ProteinPlacement } from './frame'
import { patchMaterial, type MediaUniforms } from './media'

export interface MembraneOptions {
  /** Mid-plane height (nm). */
  y: number
  headColor: string
  tailColor: string
  /** Proteins spanning or anchored in this membrane: lipids are removed around them. */
  proteins: ProteinPlacement[]
  seed: number
  media: MediaUniforms
  /** Low quality: coarser heads, no shadows from the cut-face lipids. */
  low: boolean
  /** Where instanced lipids are drawn (beyond it, procedural planes continue the membrane). */
  patch: MembranePatch
  /** The front cut (default CUT_Z). */
  cutZ?: number
  /**
   * Context membrane (e.g. the opposite wall of a crista): procedural planes only, no
   * instanced lipids, casts no shadow.
   */
  planesOnly?: boolean
}

export interface Membrane {
  group: THREE.Group
  /** Focus + context dimming shared by every part of this membrane. */
  dim: THREE.IUniform<number>
}

const HOLE_MAX = 6

/** Two splayed hydrocarbon chains hanging from a head (unit lipid pointing down -y), paler near the head. */
function createTailGeometry(color: THREE.Color): THREE.BufferGeometry {
  const { tailLength, tailRadius, headRadius } = BILAYER
  const positions: number[] = []
  const normals: number[] = []
  for (const side of [-1, 1]) {
    const chain = new THREE.CapsuleGeometry(tailRadius, tailLength - 2 * tailRadius, 2, 6).toNonIndexed()
    chain.translate(0, -(headRadius * 0.55 + tailLength / 2), 0)
    chain.rotateZ(side * 0.09)
    chain.translate(side * 0.19, 0, 0)
    positions.push(...(chain.getAttribute('position').array as Float32Array))
    normals.push(...(chain.getAttribute('normal').array as Float32Array))
    chain.dispose()
  }
  const colors: number[] = []
  const top = -headRadius * 0.55
  for (let i = 0; i < positions.length; i += 3) {
    const depth = THREE.MathUtils.clamp((top - positions[i + 1]) / tailLength, 0, 1)
    const shade = THREE.MathUtils.lerp(1.0, 0.55, depth)
    colors.push(color.r * shade, color.g * shade, color.b * shade)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

function holeFor(protein: ProteinPlacement, upper: boolean): boolean {
  if (protein.leaflets === 'none') return false
  if (protein.leaflets === 'upper' && !upper) return false
  if (protein.leaflets === 'lower' && upper) return false
  return true
}

function insideHole(x: number, z: number, upper: boolean, proteins: readonly ProteinPlacement[]): boolean {
  for (const protein of proteins) {
    if (!holeFor(protein, upper)) continue
    const r = protein.footprint + BILAYER.headRadius * 0.6
    if ((x - protein.position.x) ** 2 + (z - protein.position.z) ** 2 < r * r) return true
  }
  return false
}

/**
 * Lipid carpet for the continuation planes: an analytic hexagonal field of head-group
 * domes (same 0.88 nm period as the instanced heads), shaded by perturbing the normal,
 * fading to its average with pixel footprint so it never shimmers. Inside the instanced
 * patch the plane only shows the dark gaps between the real heads.
 */
function carpetShader(facing: 1 | -1, holes: THREE.Vector4[], patch: MembranePatch): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    shader.uniforms.uHoles = { value: holes }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uHoles[${HOLE_MAX}];
        float carpetDome;
        vec3 carpetNormal;
        float carpetFade;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        for (int i = 0; i < ${HOLE_MAX}; i++) {
          vec4 hole = uHoles[i];
          if (hole.w > 0.0 && distance(vMediaWorldPos.xz, hole.xy) < hole.w) discard;
        }
        {
          vec2 p = vMediaWorldPos.xz / ${BILAYER.spacing.toFixed(3)};
          vec2 r = vec2(1.0, 1.7320508);
          vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h;
          vec2 b = mod(p - h, r) - h;
          vec2 g = dot(a, a) < dot(b, b) ? a : b;
          float d = length(g) * ${BILAYER.spacing.toFixed(3)} / ${BILAYER.headRadius.toFixed(3)};
          carpetDome = sqrt(max(0.0, 1.0 - d * d));
          vec2 slope = d < 1.0 ? g * ${(BILAYER.spacing / BILAYER.headRadius).toFixed(3)} : vec2(0.0);
          carpetNormal = normalize(vec3(slope.x, ${facing.toFixed(1)} * max(carpetDome, 0.05), slope.y));
          vec2 fw = fwidth(p);
          carpetFade = smoothstep(0.3, 0.8, max(fw.x, fw.y));
          bool inPatch = vMediaWorldPos.x > ${patch.minX.toFixed(1)} && vMediaWorldPos.x < ${patch.maxX.toFixed(1)}
            && vMediaWorldPos.z > ${patch.minZ.toFixed(1)};
          if (inPatch) { carpetDome = 0.0; carpetNormal = vec3(0.0, ${facing.toFixed(1)}, 0.0); carpetFade = 0.0; }
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(mix(0.42, 1.0, sqrt(carpetDome)), 0.8, carpetFade);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 nWorld = normalize(mix(carpetNormal, vec3(0.0, ${facing.toFixed(1)}, 0.0), carpetFade));
          normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
        }`,
      )
  }
}

/**
 * The bilayer in section beyond the instanced patch: dark head-group bands at both
 * faces around a lighter hydrocarbon core (the "railroad track" of scene 1's sections,
 * now resolved into rows of heads), filtered by pixel footprint.
 */
function sectionShader(midY: number, headColor: THREE.Color): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    shader.uniforms.uHeadColor = { value: headColor }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uHeadColor;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float s = abs(vMediaWorldPos.y - ${midY.toFixed(3)});
          float cell = fract(vMediaWorldPos.x / ${BILAYER.spacing.toFixed(3)}) - 0.5;
          float dx = cell * ${BILAYER.spacing.toFixed(3)};
          float dy = s - ${BILAYER.headOffset.toFixed(3)};
          float head = 1.0 - smoothstep(0.75, 1.0, length(vec2(dx, dy)) / ${BILAYER.headRadius.toFixed(3)});
          float fw = fwidth(vMediaWorldPos.x / ${BILAYER.spacing.toFixed(3)});
          head = mix(head, 0.55 * (1.0 - smoothstep(0.0, ${BILAYER.headRadius.toFixed(3)}, abs(dy))), smoothstep(0.3, 0.8, fw));
          float tails = 0.85 + 0.15 * cos(6.2832 * vMediaWorldPos.x / 0.45) * (1.0 - smoothstep(0.2, 0.6, fwidth(vMediaWorldPos.x / 0.45)));
          float depth = smoothstep(0.0, 1.6, ${BILAYER.headOffset.toFixed(3)} - s);
          // Darker than a lit surface: matches the shaded tail rows of the instanced patch.
          vec3 core = diffuseColor.rgb * tails * mix(0.78, 0.48, depth);
          diffuseColor.rgb = mix(core, uHeadColor * 0.85, head);
        }`,
      )
  }
}

/**
 * One membrane: instanced head-group domes on both faces over the detailed patch, full
 * lipids (head + two tails) on the rows along the cut face, and procedural planes that
 * continue the membrane far beyond, so the zoom never reveals a floating tile.
 * Static: no thermal jiggle (it would force a redraw every frame for no pedagogical gain).
 */
export function createMembrane(options: MembraneOptions): Membrane {
  const rand = mulberry32(options.seed)
  const { spacing, headRadius, headOffset, edgeRows } = BILAYER
  const { extent } = FRAME
  const CUT_Z = options.cutZ ?? DEFAULT_CUT_Z
  // A planes-only membrane has an empty patch: the carpet shades every head itself.
  const patch: MembranePatch = options.planesOnly ? { minX: 0, maxX: 0, minZ: CUT_Z } : options.patch
  const patchKey = `${patch.minX},${patch.maxX},${patch.minZ},${CUT_Z}`
  const rowStep = (spacing * Math.sqrt(3)) / 2
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
  const tailMatrices: THREE.Matrix4[] = []

  const edgeBand = rowStep * edgeRows
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
  const m = new THREE.Matrix4()

  for (const upper of options.planesOnly ? [] : [true, false]) {
    const rows = Math.floor((CUT_Z - patch.minZ) / rowStep)
    for (let r = 0; r <= rows; r++) {
      const z = CUT_Z - 0.3 - r * rowStep - (upper ? 0 : rowStep / 3)
      const cols = Math.floor((patch.maxX - patch.minX) / spacing)
      for (let c = 0; c <= cols; c++) {
        const x = patch.minX + c * spacing + (r % 2 ? spacing / 2 : 0) + (upper ? 0 : spacing / 3)
        const jx = x + (rand() - 0.5) * 0.16
        const jz = z + (rand() - 0.5) * 0.16
        if (jx < patch.minX || jx > patch.maxX || jz < patch.minZ || jz > CUT_Z - 0.15) continue
        if (insideHole(jx, jz, upper, options.proteins)) continue
        const sign = upper ? 1 : -1
        const y = options.y + sign * (headOffset + (rand() - 0.5) * 0.14)
        const scale = 1 + (rand() - 0.5) * 0.12
        const shade = headColor.clone().multiplyScalar(0.9 + rand() * 0.18)
        const onEdge = CUT_Z - jz < edgeBand
        if (onEdge) {
          const tilt = new THREE.Quaternion().setFromEuler(
            new THREE.Euler((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25),
          )
          if (!upper) tilt.premultiply(flip)
          m.compose(new THREE.Vector3(jx, y, jz), tilt, new THREE.Vector3(scale, scale, scale))
          edgeMatrices.push(m.clone())
          edgeColors.push(shade)
          edgeLeaflets.push(sign)
          tailMatrices.push(m.clone())
        } else {
          m.compose(new THREE.Vector3(jx, y, jz), upper ? new THREE.Quaternion() : flip, new THREE.Vector3(scale, scale, scale))
          domeMatrices.push(m.clone())
          domeColors.push(shade)
          domeLeaflets.push(sign)
        }
      }
    }
  }

  const headMaterial = (): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, envMapIntensity: 0.35 })
    patchMaterial(material, options.media, { dim, headOcclusion: true })
    return material
  }

  if (!options.planesOnly) {
  // Head-group domes: only their upper half can ever be seen.
  const domeGeometry = new THREE.SphereGeometry(headRadius, options.low ? 6 : 8, options.low ? 2 : 3, 0, Math.PI * 2, 0, Math.PI / 2)
  domeGeometry.setAttribute('aLeaflet', new THREE.InstancedBufferAttribute(new Float32Array(domeLeaflets), 1))
  const domes = new THREE.InstancedMesh(domeGeometry, headMaterial(), domeMatrices.length)
  domeMatrices.forEach((matrix, i) => {
    domes.setMatrixAt(i, matrix)
    domes.setColorAt(i, domeColors[i])
  })
  domes.receiveShadow = true
  domes.computeBoundingSphere()
  group.add(domes)

  // Full lipids along the cut: heads and tails, seen in section.
  const edgeGeometry = new THREE.IcosahedronGeometry(headRadius, 1)
  edgeGeometry.setAttribute('aLeaflet', new THREE.InstancedBufferAttribute(new Float32Array(edgeLeaflets), 1))
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
  const tails = new THREE.InstancedMesh(createTailGeometry(tailColor), tailMaterial, tailMatrices.length)
  tailMatrices.forEach((matrix, i) => tails.setMatrixAt(i, matrix))
  tails.castShadow = !options.low
  tails.receiveShadow = true
  tails.computeBoundingSphere()
  group.add(tails)

  // Hydrophobic core behind the tail rows, so nothing shows through between them.
  const coreMaterial = new THREE.MeshStandardMaterial({ color: tailColor.clone().multiplyScalar(0.4), roughness: 0.85 })
  patchMaterial(coreMaterial, options.media, { dim })
  const coreHeight = 2 * (headOffset - headRadius * 0.4)
  const core = new THREE.Mesh(new THREE.PlaneGeometry(patch.maxX - patch.minX, coreHeight), coreMaterial)
  core.position.set((patch.minX + patch.maxX) / 2, options.y, CUT_Z - edgeBand - 0.1)
  core.receiveShadow = true
  group.add(core)
  }

  // Continuation planes: one per leaflet face, sitting at the head centres.
  const holes = options.proteins
    .filter((protein) => protein.leaflets === 'both')
    .slice(0, HOLE_MAX)
    .map((protein) => new THREE.Vector4(protein.position.x, protein.position.z, protein.footprint, 1))
  while (holes.length < HOLE_MAX) holes.push(new THREE.Vector4(0, 0, 0, 0))
  for (const facing of [1, -1] as const) {
    // Rougher and less reflective than the instanced heads: at grazing angles, far away,
    // the studio's light strips would otherwise glare off the receding carpet.
    const material = new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.75, envMapIntensity: 0.08 })
    patchMaterial(material, options.media, { dim, extra: carpetShader(facing, holes, patch), cacheKey: `carpet${facing}:${patchKey}` })
    const width = 2 * extent
    const depth = extent + CUT_Z
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
    plane.rotation.x = facing === 1 ? -Math.PI / 2 : Math.PI / 2
    plane.position.set(0, options.y + facing * headOffset, CUT_Z - depth / 2)
    plane.receiveShadow = true
    group.add(plane)
  }

  // Section planes beyond the patch, flush with the cut.
  const sectionMaterial = new THREE.MeshStandardMaterial({ color: tailColor, roughness: 0.85, envMapIntensity: 0.15 })
  patchMaterial(sectionMaterial, options.media, { dim, extra: sectionShader(options.y, headColor), cacheKey: `section${options.y}` })
  for (const [from, to] of [
    [-extent, patch.minX],
    [patch.maxX, extent],
  ]) {
    const section = new THREE.Mesh(new THREE.PlaneGeometry(to - from, 2 * BILAYER_HALF), sectionMaterial)
    section.position.set((from + to) / 2, options.y, CUT_Z)
    section.receiveShadow = true
    group.add(section)
  }

  return { group, dim }
}
