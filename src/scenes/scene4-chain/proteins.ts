import * as THREE from 'three'
import { sdCapsule, sdEllipsoid, smoothUnion, subtract, type Sdf } from '../shared/molecular/beads'
import { BILAYER_HALF, CUT_Z, v } from '../shared/molecular/frame'
import { blobBeads, meshFromBeads, shadeOf, type MaterialFactory, type ProteinModel } from '../shared/molecular/proteinKit'
import { PROTEINS } from './layout'

/**
 * The respiratory chain's complexes: stylised bead models with the right topology and
 * proportions (complex I's L, complex III's dimer, complex IV's compact block, complex
 * II's small anchor and matrix head), centred on the front cut and sliced by it (only
 * beads behind the section are kept), so the electron relays and H⁺ channels drawn on
 * the section face are seen inside them. Local frames: origin on the membrane mid-plane
 * at the complex's centre, +y toward the crista lumen (intermembrane space).
 */

const BH = BILAYER_HALF

/** A complex sliced by the front cut: bead centres stay a little behind the section. */
const behindSection = (p: THREE.Vector3): boolean => p.z <= -0.3

interface Lobe {
  center: THREE.Vector3
  radii: THREE.Vector3
}

const lobesSdf = (lobes: Lobe[], k = 0.9): Sdf => smoothUnion(lobes.map((lobe) => sdEllipsoid(lobe.center, lobe.radii)), k)

const lobesBounds = (lobes: Lobe[]): THREE.Box3 =>
  lobes.reduce((box, lobe) => box.union(new THREE.Box3(lobe.center.clone().sub(lobe.radii).subScalar(0.9), lobe.center.clone().add(lobe.radii).addScalar(0.9))), new THREE.Box3())

function slicedComplex(material: THREE.Material, sdf: Sdf, bounds: THREE.Box3, seed: number, shade: number): THREE.Mesh {
  // Slightly coarser beads: these complexes are large and seen from farther away.
  const beads = blobBeads({ sdf, bounds, seed, color: shadeOf(shade), keep: behindSection, spacing: 0.55, radius: [0.36, 0.48] })
  return meshFromBeads(beads, material)
}

/**
 * Complex I (NADH dehydrogenase): an L — a long membrane arm with four modules and a
 * peripheral arm reaching ~13 nm into the matrix. NADH docks at its tip (FMN); the
 * electrons go up a chain of iron–sulfur relays to the Q site near the membrane; four H⁺
 * channels cross the membrane arm.
 */
export function createComplexI(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(-0.5, 0, 0), radii: v(9.4, 2.7, 3.0) }, // membrane arm (x −48…−30 in the set)
    ...[-7, -3, 1, 5].map((x) => ({ center: v(x, -1.9, 0), radii: v(1.7, 1.2, 2.4) })), // four modules
    { center: v(8.2, -BH - 2.6, 0), radii: v(2.9, 3.4, 2.9) },
    { center: v(8.6, -BH - 7.6, 0), radii: v(3.0, 3.2, 3.0) },
    { center: v(9.0, -BH - 11.2, 0), radii: v(2.6, 2.4, 2.6) }, // peripheral arm, down to y ≈ −15
  ]
  const group = new THREE.Group()
  group.add(slicedComplex(material(dim), lobesSdf(lobes), lobesBounds(lobes), 801, 1.0))
  // Electron relays (FMN at the tip, then iron–sulfur clusters up to the Q site).
  const relays = [v(9.0, -14.0, 0), v(8.6, -12.2, 0), v(8.9, -10.4, 0), v(8.4, -8.6, 0), v(8.8, -6.8, 0), v(8.3, -5.0, 0), v(8.6, -3.3, 0)]
  return {
    group,
    parts: {},
    sites: {
      fmn: relays[0].clone(),
      nadhDock: v(9.6, -15.2, 0.9),
      q: v(8.0, -0.6, 0.35),
      ...Object.fromEntries(relays.map((relay, i) => [`relay${i}`, relay])),
      ...Object.fromEntries([5, 1, -3, -7].map((x, i) => [`channel${i}`, v(x, 0, 0)])),
    },
    dim,
    labelAnchor: v(-4, BH + 0.6, 0.2),
  }
}

/**
 * Complex III (cytochrome bc₁), a dimer: two mirrored monomers with a seam, matrix
 * domains below, the Rieske/cytochrome c₁ heads in the intermembrane space where the
 * cytochromes c dock. Qo sites near the lumen side of the membrane, Qi near the matrix side.
 */
export function createComplexIII(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [-1, 1].flatMap((side) => [
    { center: v(side * 2.6, 0, 0), radii: v(2.3, 2.9, 2.7) },
    { center: v(side * 2.8, -BH - 3.0, -0.2), radii: v(2.4, 2.8, 2.7) },
    { center: v(side * 2.6, BH + 1.7, 0), radii: v(1.9, 1.6, 2.0) },
  ])
  const seam = sdCapsule(v(0, -7.5, 1.5), v(0, 4.5, 1.5), 0.35)
  const group = new THREE.Group()
  group.add(slicedComplex(material(dim), subtract(lobesSdf(lobes), seam), lobesBounds(lobes), 811, 0.96))
  return {
    group,
    parts: {},
    sites: {
      qoLeft: v(-2.5, 0.6, 0.35),
      qoRight: v(2.5, 0.6, 0.35),
      qi: v(0, -0.6, 0.35),
      rieskeLeft: v(-2.0, 3.2, 0),
      rieskeRight: v(2.0, 3.2, 0),
      c1Left: v(-2.7, 4.6, 0),
      c1Right: v(2.7, 4.6, 0),
      padLeft: v(-2.6, BH + 4.4, 0.6),
      padRight: v(2.6, BH + 4.4, 0.6),
      matrixEntry: v(0.8, -BH - 5.4, 0.4),
      lumenExitLeft: v(-1.1, BH + 2.2, 0.5),
      lumenExitRight: v(1.1, BH + 2.2, 0.5),
    },
    dim,
    labelAnchor: v(0, -BH - 6.4, 0.2),
  }
}

/**
 * Complex II (succinate dehydrogenase): a small anchor through the membrane, nothing on
 * the intermembrane side, and a two-lobed head in the matrix holding the bound FAD;
 * three iron–sulfur relays lead to its Q site.
 */
export function createComplexII(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(0, -0.2, 0), radii: v(2.0, BH + 0.2, 1.9) },
    { center: v(-1.3, -BH - 3.4, 0), radii: v(2.2, 2.6, 2.4) },
    { center: v(1.4, -BH - 4.2, 0.1), radii: v(2.0, 2.5, 2.3) },
  ]
  const group = new THREE.Group()
  group.add(slicedComplex(material(dim), lobesSdf(lobes), lobesBounds(lobes), 821, 0.98))
  return {
    group,
    parts: {},
    sites: {
      fad: v(0.2, -8.0, 0.2),
      relay0: v(0.4, -6.2, 0),
      relay1: v(0.25, -4.6, 0),
      relay2: v(0.15, -3.0, 0),
      q: v(0, -0.6, 0.35),
      matrixEntry: v(1.6, -BH - 6.8, 0.6),
    },
    dim,
    labelAnchor: v(-2.4, -BH - 5.2, 0.2),
  }
}

/**
 * Complex IV (cytochrome c oxidase): a compact block; the CuA head in the intermembrane
 * space receives the cytochromes c; the electrons go CuA → heme a → the active site
 * (heme a₃ + CuB), drawn near the matrix side with its pocket open toward the matrix.
 */
export function createComplexIV(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(0, 0, 0), radii: v(3.6, 3.0, 3.1) },
    { center: v(0.7, BH + 1.6, 0), radii: v(2.0, 1.6, 2.0) },
    { center: v(-0.4, -BH - 1.4, 0), radii: v(3.0, 1.6, 2.8) },
  ]
  const pocket = sdCapsule(v(-0.2, -0.6, 0), v(-0.2, -BH - 4.2, 0), 1.05)
  const group = new THREE.Group()
  group.add(slicedComplex(material(dim), subtract(lobesSdf(lobes), pocket), lobesBounds(lobes), 831, 1.02))
  return {
    group,
    parts: {},
    sites: {
      pad: v(0.8, BH + 4.0, 0.6),
      cuA: v(0.7, 3.7, 0),
      hemeA: v(0.4, 1.4, 0),
      site: v(-0.2, -0.6, 0.35),
      channel: v(2.3, 0, 0),
      matrixEntry: v(-0.2, -BH - 4.6, 0.5),
    },
    dim,
    labelAnchor: v(2.4, -BH - 2.4, 0.2),
  }
}

/** A soluble acyl-CoA dehydrogenase (the β-oxidation FADH₂ stays bound in it). */
export function createAcad(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(-1.4, 0, 0), radii: v(2.2, 2.0, 2.0) },
    { center: v(1.5, 0.3, -0.2), radii: v(2.1, 2.1, 2.0) },
  ]
  const fadPocket = sdEllipsoid(v(0.2, -0.7, 1.9), v(1.2, 0.6, 0.8))
  const beads = blobBeads({ sdf: subtract(lobesSdf(lobes, 0.7), fadPocket), bounds: lobesBounds(lobes), seed: 841, color: shadeOf(0.98) })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  return {
    group,
    parts: {},
    sites: { fad: v(0.2, -0.75, 1.95), etfDock: v(4.4, -0.4, 0.3) },
    dim,
    labelAnchor: v(-2.4, -1.4, 1.4),
  }
}

/**
 * Cytochrome c: a small soluble protein of the intermembrane space (~3 nm) with its heme
 * (a dark plate) toward the front; it carries one electron at a time.
 */
export function createCytochromeC(material: MaterialFactory, hemeMaterial: THREE.Material, seed: number): ProteinModel {
  const dim = { value: 0 }
  const beads = blobBeads({
    sdf: sdEllipsoid(v(0, 0, 0), v(1.45, 1.35, 1.35)),
    bounds: new THREE.Box3(v(-2.3, -2.2, -2.2), v(2.3, 2.2, 2.2)),
    seed,
    color: shadeOf(0.92),
    spacing: 0.45,
    radius: [0.3, 0.38],
  })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  const heme = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.12), hemeMaterial)
  heme.position.set(0, -0.15, 1.42)
  heme.castShadow = true
  group.add(heme)
  return { group, parts: { heme }, sites: { electron: v(0.1, 0.25, 1.75), dock: v(0, -1.25, 0) }, dim, labelAnchor: v(0, 1.5, 0.4) }
}

/** World position of a site of a placed complex. */
export function siteWorld(key: keyof typeof PROTEINS, model: ProteinModel, name: string): THREE.Vector3 {
  return PROTEINS[key].position.clone().add(model.sites[name])
}

/** z of the section face, in a complex's local frame (complexes are centred on the cut). */
export const SECTION_LOCAL_Z = CUT_Z - PROTEINS.complexIII.position.z + 0.05
