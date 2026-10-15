import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { KREBS_BOX_COLOR } from '../../config/palette'
import { sdEllipsoid, smoothUnion, subtract, type Sdf } from '../shared/molecular/beads'
import { BILAYER_HALF, CUT_Z, v } from '../shared/molecular/frame'
import { patchMaterial, type MediaUniforms } from '../shared/molecular/media'
import { blobBeads, meshFromBeads, shadeOf, type MaterialFactory, type ProteinModel } from '../shared/molecular/proteinKit'
import { KREBS_BOX, PROTEINS } from './layout'

/**
 * Scene 3's enzymes: stylised bead models with the right topology (peripheral on the
 * matrix face, monotopic, soluble, transmembrane), not atomic structures. Local frames:
 * origin on the inner membrane's mid-plane at the footprint (−y toward the matrix), or
 * at the centre of soluble proteins. Proteins that reach the front cut are sliced by it,
 * so their pockets (and the FAD they hold) are seen in section.
 */

const BH = BILAYER_HALF

/** Keeps the beads behind the front cut (in the protein's local frame). */
const behindCut = (key: keyof typeof PROTEINS) => {
  const limit = CUT_Z - PROTEINS[key].position.z
  return (p: THREE.Vector3): boolean => p.z <= limit
}

const ellipsoidBounds = (center: THREE.Vector3, radii: THREE.Vector3, pad = 0.8): THREE.Box3 =>
  new THREE.Box3(center.clone().sub(radii).subScalar(pad), center.clone().add(radii).addScalar(pad))

const union = (...boxes: THREE.Box3[]): THREE.Box3 => boxes.reduce((a, b) => a.union(b), new THREE.Box3())

interface Lobe {
  center: THREE.Vector3
  radii: THREE.Vector3
}

function lobesSdf(lobes: Lobe[], k = 0.8): Sdf {
  return smoothUnion(
    lobes.map((lobe) => sdEllipsoid(lobe.center, lobe.radii)),
    k,
  )
}

function lobesBounds(lobes: Lobe[]): THREE.Box3 {
  return union(...lobes.map((lobe) => ellipsoidBounds(lobe.center, lobe.radii)))
}

const pocket = (center: THREE.Vector3, radii: THREE.Vector3): Sdf => sdEllipsoid(center, radii)

/**
 * VLCAD (very-long-chain acyl-CoA dehydrogenase): a homodimer on the matrix face of the
 * inner membrane. Its cleft holds the acyl chain over the bound FAD; the front cut opens
 * the pocket so the FAD is seen turning into FADH₂ and back.
 */
export function createVlcad(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(-2.1, -BH - 2.9, -0.2), radii: v(2.5, 2.6, 2.6) },
    { center: v(2.2, -BH - 3.1, -0.4), radii: v(2.4, 2.5, 2.6) },
    { center: v(0, -BH - 0.5, -0.4), radii: v(2.6, 0.8, 1.9) }, // membrane-binding plateau
  ]
  const groove = sdEllipsoid(v(0.9, -BH - 4.15, 2.4), v(3.1, 0.75, 1.3)) // chain groove
  const fadPocket = pocket(v(0.4, -BH - 5.1, 2.4), v(1.25, 0.65, 1.0))
  const beads = blobBeads({
    sdf: subtract(subtract(lobesSdf(lobes), groove), fadPocket),
    bounds: lobesBounds(lobes),
    seed: 701,
    color: shadeOf(1.0),
    keep: behindCut('vlcad'),
  })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  return {
    group,
    parts: {},
    sites: {
      // The chain's head (C1) when docked: C2–C3 lie over the FAD.
      chainHead: v(1.6, -BH - 4.1, 2.0),
      fad: v(0.4, -BH - 5.15, 2.45),
      etfDock: v(0.8, -BH - 8.1, 1.5),
      entry: v(-4.4, -BH - 5.2, 2.0),
    },
    dim,
    labelAnchor: v(-2.4, -BH - 4.7, 1.6),
  }
}

/** ETF (electron-transferring flavoprotein): a soluble two-lobed heterodimer that shuttles electrons. */
export function createEtf(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(-1.3, -0.1, 0), radii: v(1.9, 1.9, 1.9) },
    { center: v(1.5, 0.3, 0.2), radii: v(1.7, 1.8, 1.8) },
  ]
  const beads = blobBeads({ sdf: lobesSdf(lobes, 0.7), bounds: lobesBounds(lobes), seed: 711, color: shadeOf(0.95) })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  return {
    group,
    parts: {},
    sites: {
      // Where its two electrons ride (on top, toward the camera).
      cargoA: v(-0.25, 2.25, 1.0),
      cargoB: v(0.35, 2.35, 1.05),
      top: v(0, 2.1, 0.4),
    },
    dim,
    labelAnchor: v(-2.6, 0.2, 1.2),
  }
}

/** ETF-QO: monotopic on the matrix leaflet (a plateau pressed into it), reduces ubiquinone. */
export function createEtfQo(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(0, -BH - 2.4, 0), radii: v(2.6, 2.3, 2.5) },
    { center: v(0, -BH + 0.7, 0), radii: v(2.0, 0.95, 1.8) }, // hydrophobic plateau in the lower leaflet
  ]
  const beads = blobBeads({ sdf: lobesSdf(lobes), bounds: lobesBounds(lobes), seed: 721, color: shadeOf(0.97) })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  return {
    group,
    parts: {},
    sites: {
      etfDock: v(0.4, -BH - 6.9, 0.6),
      // Where the electrons end, in the membrane core on the section face (toward ubiquinone).
      membraneA: v(0.2, -0.75, CUT_Z - PROTEINS.etfQo.position.z + 0.12),
      membraneB: v(0.85, -0.55, CUT_Z - PROTEINS.etfQo.position.z + 0.12),
    },
    dim,
    labelAnchor: v(1.6, -BH - 3.6, 1.6),
  }
}

/**
 * The trifunctional protein (TFP): an arch on the matrix face with three activities in a
 * row — hydratase, 3-hydroxyacyl-CoA dehydrogenase, thiolase — drawn as three pockets
 * on its front face, numbered like the reactions (2, 3, 4). No subunit count is shown.
 */
export function createTfp(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(0, -BH - 3.4, 0), radii: v(6.6, 2.6, 2.8) },
    { center: v(-3.6, -BH - 0.6, -0.4), radii: v(2.1, 1.0, 1.8) },
    { center: v(3.6, -BH - 0.6, -0.4), radii: v(2.1, 1.0, 1.8) },
  ]
  const pockets = [-4.5, -0.5, 3.5].map((x) => pocket(v(x, -BH - 3.95, 2.75), v(1.45, 0.95, 1.25)))
  const beads = blobBeads({
    sdf: pockets.reduce((sdf, cut) => subtract(sdf, cut), lobesSdf(lobes)),
    bounds: lobesBounds(lobes),
    seed: 731,
    color: shadeOf(1.02),
  })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  return {
    group,
    parts: {},
    sites: {
      hydratase: v(-4.5, -BH - 4.0, 2.6),
      dehydrogenase: v(-0.5, -BH - 4.2, 2.6),
      thiolase: v(3.5, -BH - 4.0, 2.6),
    },
    dim,
    labelAnchor: v(-0.5, -BH - 5.9, 2.2),
  }
}

/** Medium- and short-chain enzymes, soluble in the matrix: a loose group of four globules, named together. */
export function createSolubleEnzymes(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const group = new THREE.Group()
  const mat = material(dim)
  const globules: Lobe[] = [
    { center: v(-2.7, 0.4, 0), radii: v(2.1, 2.0, 2.0) },
    { center: v(2.5, 0.8, -0.8), radii: v(2.0, 2.1, 2.0) },
    { center: v(-0.2, -2.4, 0.2), radii: v(2.1, 1.9, 2.0) },
    { center: v(0.4, 2.8, -2.2), radii: v(1.9, 1.8, 1.9) },
  ]
  globules.forEach((globule, i) => {
    const beads = blobBeads({
      sdf: sdEllipsoid(globule.center, globule.radii),
      bounds: ellipsoidBounds(globule.center, globule.radii),
      seed: 741 + i,
      color: shadeOf(0.94 + 0.03 * (i % 2)),
    })
    group.add(meshFromBeads(beads, mat))
  })
  return {
    group,
    parts: {},
    sites: { chainHead: v(1.3, 2.05, 2.75), front: v(0, 0.2, 2.6) },
    dim,
    // Front-right of the right globule: the callout points right, over the Krebs box,
    // clear of the narration panel.
    labelAnchor: v(3.9, 0.6, 0.7),
  }
}

/**
 * Complex II (succinate dehydrogenase): a small membrane anchor through both leaflets
 * and a two-lobed head in the matrix, which plugs into the Krebs black box. Its bound
 * FAD sits in a pocket of the head's front face.
 */
export function createComplexII(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const lobes: Lobe[] = [
    { center: v(0, 0, 0), radii: v(2.0, BH + 0.3, 1.8) }, // membrane anchor
    { center: v(-1.2, -BH - 2.6, 0), radii: v(2.0, 2.2, 2.1) },
    { center: v(1.5, -BH - 3.0, 0.3), radii: v(1.9, 2.0, 2.0) },
  ]
  const fadPocket = pocket(v(0.3, -BH - 2.25, 2.2), v(1.2, 0.6, 0.9))
  const beads = blobBeads({ sdf: subtract(lobesSdf(lobes), fadPocket), bounds: lobesBounds(lobes), seed: 751, color: shadeOf(0.96) })
  const group = new THREE.Group()
  group.add(meshFromBeads(beads, material(dim)))
  return {
    group,
    parts: {},
    sites: { fad: v(0.3, -BH - 2.3, 2.15) },
    dim,
    labelAnchor: v(-2.1, -BH - 1.4, 1.4),
  }
}

export interface KrebsBox {
  group: THREE.Group
  dim: THREE.IUniform<number>
}

/**
 * The Krebs cycle as a black box: a matte charcoal rounded block (not protein sage: it
 * is a symbol, not a structure) with an entry slot on the left face and an exit slot on
 * the front face. No internal animation.
 */
export function createKrebsBox(media: MediaUniforms): KrebsBox {
  const dim = { value: 0 }
  const group = new THREE.Group()
  const { size } = KREBS_BOX
  const body = new THREE.MeshStandardMaterial({ color: KREBS_BOX_COLOR, roughness: 0.82, metalness: 0, envMapIntensity: 0.25 })
  patchMaterial(body, media, { dim })
  const box = new THREE.Mesh(new RoundedBoxGeometry(size.x, size.y, size.z, 4, 0.9), body)
  box.castShadow = true
  box.receiveShadow = true
  const slotMaterial = new THREE.MeshStandardMaterial({ color: '#0d1014', roughness: 0.95 })
  patchMaterial(slotMaterial, media, { dim })
  const entry = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.8), slotMaterial)
  entry.position.set(-size.x / 2 - 0.01, 0, 1.2)
  entry.rotation.y = -Math.PI / 2
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), slotMaterial)
  exit.position.set(-1.5, -1.2, size.z / 2 + 0.01)
  group.add(box, entry, exit)
  group.position.copy(KREBS_BOX.center)
  return { group, dim }
}
