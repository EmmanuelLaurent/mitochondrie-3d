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
