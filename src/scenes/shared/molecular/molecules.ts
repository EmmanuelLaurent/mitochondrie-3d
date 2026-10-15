import * as THREE from 'three'
import { MOLECULE_COLORS } from '../../../config/palette'
import { BETA_OXIDATION } from '../../../config/science.config'
import { buildBeadGeometry, type Bead } from './beads'

/**
 * Small molecules, each with its own silhouette (colour is never the only cue).
 * Local frames put the attachment point at the origin:
 * - carbon chain: carboxyl carbon C1 at the origin, chain along -x;
 * - CoA: thiol sulfur at the origin, body along +x ("key": arm, then round head);
 * - carnitine: 3-OH oxygen at the origin, body along +x (trefoil head at the far end);
 * - adenosine: hexagon centre at the origin, phosphates along +x.
 * Sizes are close to real (palmitate ~2.3 nm long, carnitine < 1 nm, CoA ~2 nm).
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z)
const color = (hex: string, shade = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(shade)

export interface MoleculeMaterials {
  /** Glossy "actor" surface with vertex colours (bead models). */
  beads: THREE.Material
  /** Glossy, flat-shaded, for phosphate tetrahedra. */
  phosphate: THREE.Material
  /** Neutral grey covalent links between moieties. */
  link: THREE.Material
  adenosineCharged: THREE.Material
  adenosineDischarged: THREE.Material
}

function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.castShadow = true
    child.receiveShadow = true
  })
  return object
}

function beadMesh(beads: Bead[], material: THREE.Material): THREE.Mesh {
  return shadowed(new THREE.Mesh(buildBeadGeometry(beads, { detail: 2, occlusion: 0.5 }), material))
}

/** A covalent link drawn as a thin grey rod between two points. */
export function createLink(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material, radius = 0.045): THREE.Mesh {
  const length = from.distanceTo(to)
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - 2 * radius), 2, 8)
  const mesh = shadowed(new THREE.Mesh(geometry, material))
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
  return mesh
}

export interface CarbonChain {
  group: THREE.Group
  /** The second carboxylate oxygen: on free palmitate, gone once the acyl is esterified. */
  freeOxygen: THREE.Object3D
  /** Where a carrier's attachment atom sits once bonded (chain frame). */
  bondPoint: THREE.Vector3
}

/**
 * The followed carbon chain: one node per carbon (16, countable: scene 3 will shorten
 * it two by two), joined by short bonds in an extended zig-zag, carboxyl head at C1.
 */
export function createCarbonChain(materials: MoleculeMaterials): CarbonChain {
  const carbons = BETA_OXIDATION.chainCarbons
  const group = new THREE.Group()
  const nodes: Bead[] = []
  const points: THREE.Vector3[] = []
  for (let i = 0; i < carbons; i++) {
    const p = v(-i * 0.15, i % 2 ? -0.1 : 0.1, 0)
    points.push(p)
    nodes.push({ position: p, radius: i === carbons - 1 ? 0.135 : 0.12, color: color(MOLECULE_COLORS.carbonChain, i % 2 ? 0.94 : 1) })
  }
  // Bonds as slim beads between the nodes: one mesh, and the chain reads as linked segments.
  for (let i = 1; i < carbons; i++) {
    nodes.push({ position: points[i - 1].clone().add(points[i]).multiplyScalar(0.5), radius: 0.07, color: color(MOLECULE_COLORS.carbonChain, 0.8) })
  }
  const carbonyl = v(0.12, 0.33, 0)
  nodes.push({ position: carbonyl, radius: 0.11, color: color(MOLECULE_COLORS.carbonylOxygen) })
  nodes.push({ position: carbonyl.clone().multiplyScalar(0.5), radius: 0.055, color: color(MOLECULE_COLORS.carbonylOxygen, 0.8) })
  group.add(beadMesh(nodes, materials.beads))

  const oxygenPosition = v(0.27, -0.07, 0)
  const freeOxygen = beadMesh(
    [
      { position: oxygenPosition, radius: 0.11, color: color(MOLECULE_COLORS.carbonylOxygen) },
      { position: oxygenPosition.clone().multiplyScalar(0.5), radius: 0.055, color: color(MOLECULE_COLORS.carbonylOxygen, 0.8) },
    ],
    materials.beads,
  )
  group.add(freeOxygen)
  return { group, freeOxygen, bondPoint: v(0.36, -0.08, 0) }
}

/** Coenzyme A: ochre thiol tip, long pantetheine arm, round nucleotide head (never a hexagon: never read as ATP). */
export function createCoA(materials: MoleculeMaterials): THREE.Group {
  const beads: Bead[] = [{ position: v(0, 0, 0), radius: 0.16, color: color(MOLECULE_COLORS.thiol) }]
  const arm = [v(0.24, 0.06, 0), v(0.45, -0.04, 0.03), v(0.66, 0.06, 0), v(0.87, -0.03, -0.04), v(1.08, 0.08, -0.02), v(1.27, -0.02, 0.05), v(1.46, 0.07, 0.02)]
  arm.forEach((p, i) => beads.push({ position: p, radius: 0.14, color: color(MOLECULE_COLORS.coa, 0.9 + 0.06 * (i % 2)) }))
  // Gem-dimethyl of the pantoate: a small side bump that breaks the arm's symmetry.
  beads.push({ position: v(1.12, 0.26, 0.08), radius: 0.11, color: color(MOLECULE_COLORS.coa, 0.85) })
  // Round head (3'-phospho-ADP part), packed as a ball.
  const head = v(1.95, 0.04, 0)
  const offsets = [v(0, 0, 0), v(0.23, 0.12, 0.05), v(0.2, -0.16, -0.06), v(-0.05, 0.22, -0.12), v(0.04, -0.12, 0.22), v(0.25, 0.05, -0.2), v(0.02, 0.08, 0.24)]
  offsets.forEach((o, i) => beads.push({ position: head.clone().add(o), radius: 0.2, color: color(MOLECULE_COLORS.coa, 1.04 - 0.05 * (i % 3)) }))
  const group = new THREE.Group()
  group.add(beadMesh(beads, materials.beads))
  return group
}

/** Carnitine: small zwitterion with a trefoil head (trimethylammonium), clearly smaller than CoA. */
export function createCarnitine(materials: MoleculeMaterials): THREE.Group {
  const c = MOLECULE_COLORS.carnitine
  const nitrogen = v(0.64, 0.34, 0)
  const beads: Bead[] = [
    { position: v(0, 0, 0), radius: 0.12, color: color(MOLECULE_COLORS.carbonylOxygen, 0.95) }, // 3-OH oxygen
    { position: v(0.22, 0.06, 0), radius: 0.14, color: color(c) },
    { position: v(0.4, -0.08, 0.02), radius: 0.14, color: color(c, 0.95) },
    { position: v(0.44, -0.33, 0.04), radius: 0.13, color: color(c, 0.9) }, // carboxylate carbon
    { position: v(0.33, -0.52, 0.12), radius: 0.11, color: color(MOLECULE_COLORS.carbonylOxygen, 0.9) },
    { position: v(0.62, -0.44, -0.08), radius: 0.11, color: color(MOLECULE_COLORS.carbonylOxygen, 0.9) },
    { position: v(0.42, 0.24, -0.02), radius: 0.14, color: color(c, 0.95) },
    { position: nitrogen, radius: 0.16, color: color(c, 0.8) }, // N+
  ]
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2
    const dir = v(0.62, 0.42 * Math.cos(angle), 0.42 * Math.sin(angle)).normalize()
    beads.push({ position: nitrogen.clone().addScaledVector(dir, 0.27), radius: 0.15, color: color(c, 1.1) })
  }
  const group = new THREE.Group()
  group.add(beadMesh(beads, materials.beads))
  return group
}

/** A phosphate group: a small faceted tetrahedron (spheres stay reserved for H⁺ and O₂). */
export function createPhosphate(materials: MoleculeMaterials, seed = 0): THREE.Mesh {
  const mesh = shadowed(new THREE.Mesh(new THREE.TetrahedronGeometry(0.2), materials.phosphate))
  mesh.rotation.set(0.6 + seed, 0.3 + seed * 1.7, 0.2 + seed * 0.9)
  return mesh
}

/** Phosphate positions along +x from the adenosine centre (α, β, γ). */
export const PHOSPHATE_X = [0.68, 1.06, 1.44] as const

export interface Adenosine {
  group: THREE.Group
  /** Filled hexagon while it is ATP, ring once it is AMP (charged vs discharged, as the legend). */
  setCharged(charged: boolean): void
}

function hexagonShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    if (i === 0) shape.moveTo(radius * Math.cos(a), radius * Math.sin(a))
    else shape.lineTo(radius * Math.cos(a), radius * Math.sin(a))
  }
  shape.closePath()
  return shape
}

/** The adenosine part of ATP/AMP with its α-phosphate (what remains as AMP). */
export function createAdenosine(materials: MoleculeMaterials): Adenosine {
  const extrude = { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }
  const filled = new THREE.ExtrudeGeometry(hexagonShape(0.4), extrude)
  filled.translate(0, 0, -0.09)
  const ringShape = hexagonShape(0.4)
  ringShape.holes.push(hexagonShape(0.22))
  const ring = new THREE.ExtrudeGeometry(ringShape, extrude)
  ring.translate(0, 0, -0.09)

  const charged = shadowed(new THREE.Mesh(filled, materials.adenosineCharged))
  const discharged = shadowed(new THREE.Mesh(ring, materials.adenosineDischarged))
  discharged.visible = false
  const alpha = createPhosphate(materials, 0.3)
  alpha.position.set(PHOSPHATE_X[0], 0, 0)
  const group = new THREE.Group()
  group.add(charged, discharged, alpha, createLink(v(0.42, 0, 0), v(PHOSPHATE_X[0], 0, 0), materials.link, 0.035))
  return {
    group,
    setCharged(isCharged) {
      charged.visible = isCharged
      discharged.visible = !isCharged
    },
  }
}

export interface Nucleotide {
  group: THREE.Group
  /** ATP: filled hexagon and 3 phosphates; ADP: hollow hexagon and 2 (the legend's code). */
  setForm(form: 'atp' | 'adp'): void
}

/**
 * ATP / ADP for the ATP synthase: give `materials.adenosineDischarged` the ADP colour.
 * Hexagon centre at the origin, phosphates along +x (the third one only on ATP).
 */
export function createNucleotide(materials: MoleculeMaterials): Nucleotide {
  const adenosine = createAdenosine(materials)
  const beta = createPhosphate(materials, 1.1)
  beta.position.set(PHOSPHATE_X[1], 0, 0)
  const gamma = createPhosphate(materials, 2.3)
  gamma.position.set(PHOSPHATE_X[2], 0, 0)
  const linkAlphaBeta = createLink(v(PHOSPHATE_X[0], 0, 0), v(PHOSPHATE_X[1], 0, 0), materials.link, 0.035)
  const linkBetaGamma = createLink(v(PHOSPHATE_X[1], 0, 0), v(PHOSPHATE_X[2], 0, 0), materials.link, 0.035)
  adenosine.group.add(beta, gamma, linkAlphaBeta, linkBetaGamma)
  return {
    group: adenosine.group,
    setForm(form) {
      adenosine.setCharged(form === 'atp')
      gamma.visible = form === 'atp'
      linkBetaGamma.visible = form === 'atp'
    },
  }
}

// ---------------------------------------------------------------- scene 3 onward

/** A glossy material of one colour, patched with the scene's media (created by the scene). */
export type ColorMaterial = (color: string, options?: { flat?: boolean; roughness?: number }) => THREE.Material

/** The chemical state of the β-carbon (C3) during one turn of β-oxidation. */
export type BetaMark = 'none' | 'enoyl' | 'hydroxy' | 'keto'

export interface AcylChain {
  group: THREE.Group
  /** Where a CoA's thiol sits once bonded (thioester), in the chain frame. */
  bondPoint: THREE.Vector3
  /**
   * Shows `carbons` carbons and the mark of the current C3. The frame is the original
   * (full-length) chain's: carbons cut off at the head simply disappear, the others stay
   * in place, and the head (C1, carbonyl, CoA bond) moves to the old C3.
   */
  setState(carbons: number, mark: BetaMark): void
}

const CARBON_STEP = 0.15
const carbonAt = (i: number, out = new THREE.Vector3()): THREE.Vector3 => out.set(-i * CARBON_STEP, i % 2 ? -0.1 : 0.1, 0)

/**
 * The acyl chain of β-oxidation: a zig-zag of countable carbons (instanced, so it can
 * shorten two by two at the head), the thioester carbonyl oxygen on C1, and the marks
 * of the β-carbon: a second rod for C2=C3, an ivory –OH, or an ivory C=O.
 */
export function createAcylChain(colorMaterial: ColorMaterial, maxCarbons: number): AcylChain {
  const group = new THREE.Group()
  const sphere = new THREE.IcosahedronGeometry(1, 2)
  const graphite = new THREE.Color(MOLECULE_COLORS.carbonChain)
  const carbons = new THREE.InstancedMesh(sphere, colorMaterial('#ffffff'), maxCarbons)
  const bonds = new THREE.InstancedMesh(sphere, colorMaterial('#ffffff'), maxCarbons - 1)
  for (let i = 0; i < maxCarbons; i++) carbons.setColorAt(i, graphite.clone().multiplyScalar(i % 2 ? 0.94 : 1))
  for (let i = 0; i < maxCarbons - 1; i++) bonds.setColorAt(i, graphite.clone().multiplyScalar(0.8))
  const ivory = colorMaterial(MOLECULE_COLORS.carbonylOxygen)
  const oxygen = (radius: number): THREE.Mesh => new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), ivory)
  // Thioester carbonyl on C1, with its short link.
  const carbonyl = new THREE.Group()
  const carbonylO = oxygen(0.11)
  carbonylO.position.set(0.12, 0.33, 0)
  carbonyl.add(carbonylO, createLink(v(0, 0.1, 0), v(0.12, 0.33, 0), ivory, 0.04))
  // β-carbon (C3) marks.
  const c2 = carbonAt(1)
  const c3 = carbonAt(2)
  const side = new THREE.Vector3(0.2, 0.15, 0).normalize().multiplyScalar(0.075) // perpendicular to C2–C3, in the zig-zag plane
  const doubleBond = new THREE.Group()
  doubleBond.add(createLink(c2.clone().add(side), c3.clone().add(side), colorMaterial(MOLECULE_COLORS.carbonChain), 0.035))
  const hydroxy = new THREE.Group()
  const hydroxyO = oxygen(0.1)
  hydroxyO.position.set(c3.x, c3.y + 0.27, 0)
  hydroxy.add(hydroxyO, createLink(c3, hydroxyO.position, ivory, 0.035))
  const keto = new THREE.Group()
  const ketoO = oxygen(0.11)
  ketoO.position.set(c3.x, c3.y + 0.26, 0)
  for (const dx of [-0.03, 0.03]) keto.add(createLink(c3.clone().add(v(dx, 0, 0)), ketoO.position.clone().add(v(dx, 0, 0)), ivory, 0.028))
  keto.add(ketoO)
  group.add(carbons, bonds, carbonyl, doubleBond, hydroxy, keto)
  shadowed(group)

  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Vector3()
  const setState = (count: number, mark: BetaMark): void => {
    const n = Math.max(0, Math.min(maxCarbons, count))
    const removed = maxCarbons - n
    carbons.count = n
    bonds.count = Math.max(0, n - 1)
    for (let i = 0; i < n; i++) {
      const r = i === n - 1 ? 0.135 : 0.12
      m.makeScale(r, r, r).setPosition(carbonAt(i + removed, p))
      carbons.setMatrixAt(i, m)
      if (i > 0) {
        carbonAt(i - 1 + removed, q).add(p).multiplyScalar(0.5)
        m.makeScale(0.07, 0.07, 0.07).setPosition(q)
        bonds.setMatrixAt(i - 1, m)
      }
    }
    // Head groups follow the head (an even number of carbons is removed: same zig-zag phase).
    for (const head of [carbonyl, doubleBond, hydroxy, keto]) head.position.x = -removed * CARBON_STEP
    carbons.instanceMatrix.needsUpdate = true
    bonds.instanceMatrix.needsUpdate = true
    carbons.computeBoundingSphere()
    bonds.computeBoundingSphere()
    carbonyl.visible = n > 0
    doubleBond.visible = n >= 3 && mark === 'enoyl'
    hydroxy.visible = n >= 3 && mark === 'hydroxy'
    keto.visible = n >= 3 && mark === 'keto'
  }
  setState(maxCarbons, 'none')
  return { group, bondPoint: v(0.36, -0.08, 0), setState }
}

export interface AcetylGroup {
  /** Attach to a CoA: its origin is the CoA's thiol. */
  group: THREE.Group
  /** 0: still two carbon beads (just cut off the chain); 1: the acetyl « losange ». */
  setMorph(u: number): void
}

/**
 * The acetyl group on a CoA: right after the thiolase cut it is still the two carbons of
 * the chain (and the carbonyl oxygen), which then turn into the orange bipyramid of the
 * legend (acetyl-CoA = losange on a CoA key).
 */
export function createAcetylGroup(colorMaterial: ColorMaterial): AcetylGroup {
  const group = new THREE.Group()
  // The chain's C1/C2 as seen from the thiol (the inverse of the chain's bond point).
  const c1 = v(-0.36, 0.08, 0)
  const c2 = c1.clone().add(v(-CARBON_STEP, -0.2, 0))
  const beads = new THREE.Group()
  const graphite = colorMaterial(MOLECULE_COLORS.carbonChain)
  for (const [position, radius] of [
    [c1, 0.12],
    [c2, 0.135],
  ] as const) {
    const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), graphite)
    bead.position.copy(position)
    beads.add(bead)
  }
  beads.add(createLink(c1, c2, graphite, 0.06))
  const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 2), colorMaterial(MOLECULE_COLORS.carbonylOxygen))
  o.position.copy(c1).add(v(0.12, 0.33, 0))
  beads.add(o)
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), colorMaterial(MOLECULE_COLORS.acetyl, { flat: true, roughness: 0.3 }))
  diamond.position.set(-0.42, 0, 0)
  group.add(beads, diamond)
  shadowed(group)
  const setMorph = (u: number): void => {
    const k = THREE.MathUtils.clamp(u, 0, 1)
    beads.visible = k < 1
    beads.scale.setScalar(Math.max(1e-3, 1 - k))
    beads.position.copy(c1).multiplyScalar(k * 0.6)
    diamond.visible = k > 0
    diamond.scale.set(1.25 * k, k, k)
  }
  setMorph(1)
  return { group, setMorph }
}

function stadiumShape(length: number, height: number): THREE.Shape {
  const r = height / 2
  const half = length / 2 - r
  const shape = new THREE.Shape()
  shape.moveTo(-half, -r)
  shape.lineTo(half, -r)
  shape.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-half, r)
  shape.absarc(-half, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false)
  return shape
}

const PILL_EXTRUDE = { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12 }

export interface Pill {
  group: THREE.Group
  /** Filled when reduced (NADH, FADH₂), a hollow ring when oxidized (NAD⁺, FAD). */
  setReduced(reduced: boolean): void
}

/**
 * The electron carriers as flat pills (the legend's ⬭): NAD⁺/NADH or FAD/FADH₂. Hollow =
 * oxidized, filled = reduced; FAD and FADH₂ both carry an ivory band across the pill, so
 * FAD and NAD never differ by colour alone. ~1.4 × 0.6 nm, oversized like every symbol.
 */
export function createPill(colorMaterial: ColorMaterial, kind: 'nad' | 'fad'): Pill {
  const color = kind === 'nad' ? MOLECULE_COLORS.nad : MOLECULE_COLORS.fad
  const material = colorMaterial(color, { roughness: 0.3 })
  const filledGeometry = new THREE.ExtrudeGeometry(stadiumShape(1.4, 0.6), PILL_EXTRUDE)
  filledGeometry.translate(0, 0, -PILL_EXTRUDE.depth / 2)
  const ringShape = stadiumShape(1.4, 0.6)
  ringShape.holes.push(stadiumShape(1.02, 0.26))
  const ringGeometry = new THREE.ExtrudeGeometry(ringShape, PILL_EXTRUDE)
  ringGeometry.translate(0, 0, -PILL_EXTRUDE.depth / 2)
  const filled = new THREE.Mesh(filledGeometry, material)
  const ring = new THREE.Mesh(ringGeometry, material)
  const group = new THREE.Group()
  group.add(filled, ring)
  let band: THREE.Mesh | null = null
  if (kind === 'fad') {
    band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, PILL_EXTRUDE.depth + 0.14), colorMaterial(MOLECULE_COLORS.fadBand, { roughness: 0.4 }))
    group.add(band)
  }
  shadowed(group)
  const setReduced = (reduced: boolean): void => {
    filled.visible = reduced
    ring.visible = !reduced
  }
  setReduced(false)
  return { group, setReduced }
}

/** An electron: a small flat lightning bolt (~0.7 nm, a greatly enlarged symbol). */
export function createElectron(colorMaterial: ColorMaterial): THREE.Mesh {
  const shape = new THREE.Shape()
  const points: [number, number][] = [
    [-0.06, 0.36],
    [0.15, 0.36],
    [0.04, 0.07],
    [0.18, 0.07],
    [-0.12, -0.36],
    [-0.02, -0.04],
    [-0.17, -0.04],
  ]
  shape.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 })
  geometry.translate(0, 0, -0.04)
  return shadowed(new THREE.Mesh(geometry, colorMaterial(MOLECULE_COLORS.electron, { roughness: 0.35 })))
}

/** Water: a chevron of two rounded rods at 104.5° (never a lone sphere: spheres are H⁺ and O₂). */
export function createWater(colorMaterial: ColorMaterial): THREE.Group {
  const material = colorMaterial(MOLECULE_COLORS.water, { roughness: 0.3 })
  const group = new THREE.Group()
  const half = THREE.MathUtils.degToRad(104.5 / 2)
  for (const sign of [-1, 1]) {
    const end = v(sign * Math.sin(half) * 0.36, -Math.cos(half) * 0.36, 0)
    group.add(createLink(v(0, 0, 0), end, material, 0.085))
  }
  return shadowed(group)
}

/** CO₂: a straight O–C–O rod (ivory, graphite, ivory). */
export function createCarbonDioxide(colorMaterial: ColorMaterial): THREE.Group {
  const group = new THREE.Group()
  const ivory = colorMaterial(MOLECULE_COLORS.carbonylOxygen)
  const carbon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), colorMaterial(MOLECULE_COLORS.carbonChain))
  group.add(carbon)
  for (const sign of [-1, 1]) {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 2), ivory)
    o.position.set(sign * 0.27, 0, 0)
    group.add(o, createLink(v(sign * 0.05, 0, 0), v(sign * 0.22, 0, 0), ivory, 0.04))
  }
  return shadowed(group)
}

function polygonShape(sides: number, radius: number, rotation: number): THREE.Shape {
  const shape = new THREE.Shape()
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    if (i === 0) shape.moveTo(radius * Math.cos(a), radius * Math.sin(a))
    else shape.lineTo(radius * Math.cos(a), radius * Math.sin(a))
  }
  shape.closePath()
  return shape
}

/** GTP: a filled pentagon (guanosine) and three phosphate tetrahedra — ATP's grammar, another polygon. */
export function createGtp(colorMaterial: ColorMaterial, phosphate: THREE.Material, link: THREE.Material): THREE.Group {
  const extrude = { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }
  const body = new THREE.ExtrudeGeometry(polygonShape(5, 0.42, Math.PI / 2), extrude)
  body.translate(0, 0, -0.09)
  const group = new THREE.Group()
  group.add(new THREE.Mesh(body, colorMaterial(MOLECULE_COLORS.gtp)))
  group.add(createLink(v(0.38, 0, 0), v(PHOSPHATE_X[2], 0, 0), link, 0.035))
  PHOSPHATE_X.forEach((x, i) => {
    const tetra = new THREE.Mesh(new THREE.TetrahedronGeometry(0.2), phosphate)
    tetra.position.set(x, 0, 0)
    tetra.rotation.set(0.6 + i, 0.3 + i * 1.7, 0.2 + i * 0.9)
    group.add(tetra)
  })
  return shadowed(group)
}

// ---------------------------------------------------------------- scene 4 onward

export interface Ubiquinone {
  group: THREE.Group
  /** QH₂: a filled disc; Q: a hollow ring (the legend's code for reduced vs oxidized). */
  setReduced(reduced: boolean): void
}

/**
 * Ubiquinone (coenzyme Q): a flat head (disc, never a hexagon — that is the nucleotides'
 * shape) on a long zig-zag isoprenoid tail that keeps it in the membrane. Head at the
 * origin, facing +z; tail along −x.
 */
export function createUbiquinone(colorMaterial: ColorMaterial): Ubiquinone {
  const material = colorMaterial(MOLECULE_COLORS.ubiquinone, { roughness: 0.32 })
  const extrude = { depth: 0.12, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 20 }
  const disc = new THREE.Shape()
  disc.absarc(0, 0, 0.36, 0, Math.PI * 2, false)
  const filledGeometry = new THREE.ExtrudeGeometry(disc, extrude)
  filledGeometry.translate(0, 0, -0.06)
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, 0.36, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, 0.19, 0, Math.PI * 2, true)
  ringShape.holes.push(hole)
  const ringGeometry = new THREE.ExtrudeGeometry(ringShape, extrude)
  ringGeometry.translate(0, 0, -0.06)
  const filled = new THREE.Mesh(filledGeometry, material)
  const ring = new THREE.Mesh(ringGeometry, material)
  const tail = new THREE.Group()
  const tailMaterial = colorMaterial(MOLECULE_COLORS.ubiquinone, { roughness: 0.5 })
  const bead = new THREE.IcosahedronGeometry(0.085, 1)
  for (let i = 0; i < 10; i++) {
    const node = new THREE.Mesh(bead, tailMaterial)
    node.position.set(-0.42 - i * 0.16, i % 2 ? -0.06 : 0.06, 0)
    tail.add(node)
  }
  // QH₂ also carries the two H⁺ it took from the matrix (small vermillion beads under its head).
  const protons = new THREE.Group()
  const protonMaterial = colorMaterial(MOLECULE_COLORS.proton, { roughness: 0.28 })
  for (const sign of [-1, 1]) {
    const proton = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 2), protonMaterial)
    proton.position.set(sign * 0.22, -0.43, 0.08)
    protons.add(proton)
  }
  const group = new THREE.Group()
  group.add(filled, ring, tail, protons)
  shadowed(group)
  const setReduced = (reduced: boolean): void => {
    filled.visible = reduced
    ring.visible = !reduced
    protons.visible = reduced
  }
  setReduced(false)
  return { group, setReduced }
}

/** O₂: two fused spheres (spheres are reserved for H⁺ and O₂; the pair tells them apart). */
export function createOxygen(colorMaterial: ColorMaterial): THREE.Group {
  const material = colorMaterial(MOLECULE_COLORS.oxygen, { roughness: 0.3 })
  const group = new THREE.Group()
  for (const sign of [-1, 1]) {
    const atom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), material)
    atom.position.set(sign * 0.15, 0, 0)
    group.add(atom)
  }
  return shadowed(group)
}
