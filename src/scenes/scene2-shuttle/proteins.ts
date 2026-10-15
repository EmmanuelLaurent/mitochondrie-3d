import * as THREE from 'three'
import { helixBeads, sdEllipsoid, smoothUnion, type Bead } from '../shared/molecular/beads'
import { BILAYER_HALF, v } from '../shared/molecular/frame'
import { blobBeads, boundsOf, meshFromBeads, shadeOf, type MaterialFactory, type ProteinModel } from '../shared/molecular/proteinKit'

/**
 * Scene 2's proteins (shared building blocks in shared/molecular/proteinKit.ts). Local
 * frames: origin on the membrane mid-plane at the protein's footprint, +y toward the
 * cytosol for the outer membrane and toward the intermembrane space for the inner one.
 */

export type { MaterialFactory, ProteinModel }

/**
 * Acyl-CoA synthetase (long-chain, ACSL) on the cytosolic face of the outer membrane,
 * anchored by an N-terminal helix. Two domains around a cleft; the small C-terminal
 * domain swings between the two half-reactions (adenylation, then thioester transfer).
 */
export function createAcsl(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const mat = material(dim)
  const color = shadeOf(1.0)
  const group = new THREE.Group()

  const nCenter = v(0.9, BILAYER_HALF + 3.2, 0)
  const nRadii = v(2.8, 2.25, 2.4)
  const nDomain = blobBeads({
    sdf: smoothUnion([sdEllipsoid(nCenter, nRadii), sdEllipsoid(v(2.4, BILAYER_HALF + 2.0, -0.6), v(1.4, 1.2, 1.3))]),
    bounds: boundsOf(nCenter, nRadii.clone().addScalar(1.2)),
    seed: 101,
    color,
  })
  const anchor = helixBeads(v(0.2, 0.2, 0.1), v(0.7, BILAYER_HALF + 1.0, 0.2), 0.42, new THREE.Color(color), 102)
  group.add(meshFromBeads([...nDomain, ...anchor], mat))

  // C-terminal domain on a hinge (pivot at the hinge, so rotating the pivot swings it).
  const hinge = new THREE.Group()
  hinge.position.copy(v(-1.2, BILAYER_HALF + 4.6, 0.4))
  const cCenter = v(-1.5, 1.3, 0.2)
  const cRadii = v(1.55, 1.35, 1.45)
  const cDomain = blobBeads({
    sdf: sdEllipsoid(cCenter, cRadii),
    bounds: boundsOf(cCenter, cRadii),
    seed: 103,
    color,
  })
  hinge.add(meshFromBeads(cDomain, mat))
  group.add(hinge)

  return {
    group,
    parts: { cDomain: hinge },
    sites: {
      // The fatty acid lies in the cleft between the domains, carboxylate toward the ATP.
      fattyAcid: v(-0.6, BILAYER_HALF + 3.9, 2.5),
      atp: v(0.9, BILAYER_HALF + 5.4, 2.4),
      coa: v(-2.4, BILAYER_HALF + 5.2, 2.2),
      exit: v(-1.0, BILAYER_HALF + 7.5, 3.4),
    },
    dim,
    labelAnchor: v(1.8, BILAYER_HALF + 5.6, 0.5),
  }
}

/**
 * CPT1 (carnitine palmitoyltransferase 1), integral to the outer membrane: two
 * transmembrane helices joined by a short loop in the intermembrane space; the
 * catalytic domain and the small N-terminal regulatory domain (malonyl-CoA sensing)
 * face the cytosol.
 */
export function createCpt1(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const mat = material(dim)
  const color = shadeOf(0.97)
  const c = new THREE.Color(color)
  const group = new THREE.Group()

  const catCenter = v(0.5, BILAYER_HALF + 3.6, 0.2)
  const catRadii = v(2.9, 2.35, 2.6)
  const catalytic = blobBeads({
    sdf: sdEllipsoid(catCenter, catRadii),
    bounds: boundsOf(catCenter, catRadii),
    seed: 201,
    color,
  })
  const regCenter = v(-2.6, BILAYER_HALF + 1.4, -1.2)
  const regRadii = v(1.15, 0.95, 1.05)
  const regulatory = blobBeads({
    sdf: sdEllipsoid(regCenter, regRadii),
    bounds: boundsOf(regCenter, regRadii),
    seed: 202,
    color: shadeOf(0.9),
  })
  const tm1 = helixBeads(v(-1.0, -BILAYER_HALF - 0.6, 0.5), v(-1.1, BILAYER_HALF + 1.4, 0.3), 0.44, c, 203)
  const tm2 = helixBeads(v(1.0, BILAYER_HALF + 1.4, -0.4), v(0.9, -BILAYER_HALF - 0.6, -0.5), 0.44, c, 204)
  const loop = helixBeads(v(-1.0, -BILAYER_HALF - 1.0, 0.4), v(0.9, -BILAYER_HALF - 1.0, -0.4), 0.42, c, 205)
  group.add(meshFromBeads([...catalytic, ...regulatory, ...tm1, ...tm2, ...loop], mat))

  return {
    group,
    parts: {},
    sites: {
      acylCoA: v(-0.4, BILAYER_HALF + 3.4, 2.9),
      carnitine: v(1.4, BILAYER_HALF + 4.2, 2.8),
      exit: v(1.6, BILAYER_HALF + 2.2, 3.0),
    },
    dim,
    labelAnchor: v(0.6, BILAYER_HALF + 6.0, 0.4),
  }
}

/**
 * Porin (VDAC): a 19-stranded β-barrel through the outer membrane, sliced open by the
 * front cut so its pore can be seen. Small molecules such as acylcarnitines cross the
 * outer membrane through it.
 */
export function createPorin(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const mat = material(dim)
  const color = new THREE.Color(shadeOf(0.93))
  const group = new THREE.Group()

  const strands = 19
  const radius = 2.05
  const halfHeight = BILAYER_HALF - 0.2
  const beads: Bead[] = []
  for (let s = 0; s < strands; s++) {
    for (let y = -halfHeight; y <= halfHeight + 1e-6; y += 0.34) {
      // β-strands are tilted ~40° to the barrel axis: each row slides around the barrel.
      const angle = (s / strands) * Math.PI * 2 + (y * Math.tan(0.7)) / radius
      const p = v(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
      if (p.z > 0.35) continue // cut away: the front half of the barrel is open
      const shade = 0.92 + 0.12 * ((s * 7 + Math.round(y * 3)) % 5) / 4
      beads.push({ position: p, radius: 0.33, color: color.clone().multiplyScalar(shade) })
    }
  }
  // N-terminal helix lying against the inside of the barrel wall.
  beads.push(...helixBeads(v(-1.15, -0.2, -1.05), v(1.0, 0.6, -1.25), 0.3, color.clone().multiplyScalar(0.85), 301))
  group.add(meshFromBeads(beads, mat))

  return {
    group,
    parts: {},
    sites: {
      top: v(0, BILAYER_HALF + 1.2, -0.2),
      bottom: v(0, -BILAYER_HALF - 1.4, -0.2),
    },
    dim,
    labelAnchor: v(-1.6, BILAYER_HALF + 0.4, 0.3),
  }
}

/**
 * CACT (carnitine–acylcarnitine translocase, SLC25 family) in the inner membrane:
 * three pairs of transmembrane helices around a central cavity. Alternating access:
 * the domains rock like a rocker switch, opening the cavity to one side at a time
 * (`setOpenTo`: +1 intermembrane space, -1 matrix). Front of the barrel cut away.
 */
export function createCact(material: MaterialFactory): ProteinModel & { setOpenTo(side: number): void } {
  const dim = { value: 0 }
  const mat = material(dim)
  const color = new THREE.Color(shadeOf(1.03))
  const group = new THREE.Group()
  const domains: THREE.Group[] = []
  const halfHeight = BILAYER_HALF + 0.3

  // Three repeats at the back and sides of the cavity (the front one is cut away).
  for (const [index, deg] of [200, 270, 340].entries()) {
    const angle = THREE.MathUtils.degToRad(deg)
    const pivot = new THREE.Group()
    pivot.position.set(Math.cos(angle) * 1.55, 0, Math.sin(angle) * 1.55)
    pivot.rotation.y = -angle // local +x points radially outward
    const beads: Bead[] = [
      ...helixBeads(v(-0.05, -halfHeight, -0.6), v(0.15, halfHeight, -0.55), 0.46, color, 400 + index * 3),
      ...helixBeads(v(0.55, halfHeight, 0.55), v(0.35, -halfHeight, 0.6), 0.46, color, 401 + index * 3),
      // Short amphipathic helix on the matrix side, typical of the carrier family.
      ...helixBeads(v(0.9, -halfHeight - 0.7, 0.9), v(0.0, -halfHeight - 0.8, -0.7), 0.4, color.clone().multiplyScalar(0.9), 402 + index * 3),
    ].filter((bead) => {
      const world = bead.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle).add(pivot.position)
      return world.z < 0.4
    })
    pivot.add(meshFromBeads(beads, mat))
    group.add(pivot)
    domains.push(pivot)
  }

  const setOpenTo = (side: number): void => {
    // Positive: the IMS-side ends splay outward (cavity open toward the IMS), the matrix-side gate closes.
    for (const domain of domains) domain.rotation.z = -0.2 * side
  }
  setOpenTo(1)

  return {
    group,
    parts: Object.fromEntries(domains.map((d, i) => [`domain${i}`, d])),
    sites: {
      imsMouth: v(0, BILAYER_HALF + 1.0, 0.0),
      cavity: v(0, 0, -0.1),
      matrixMouth: v(0, -BILAYER_HALF - 1.2, 0.0),
    },
    dim,
    labelAnchor: v(0, BILAYER_HALF + 0.8, -1.6),
    setOpenTo,
  }
}

/**
 * CPT2 on the matrix face of the inner membrane (peripheral, held by a hydrophobic
 * insert), next to CACT: transfers the acyl group back from carnitine to a matrix CoA.
 */
export function createCpt2(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const mat = material(dim)
  const color = shadeOf(0.97)
  const group = new THREE.Group()

  const catCenter = v(0.2, -BILAYER_HALF - 3.4, 0)
  const catRadii = v(2.85, 2.3, 2.55)
  const insertCenter = v(0.4, -BILAYER_HALF - 0.2, -0.2)
  const insertRadii = v(1.3, 0.75, 1.0)
  const beads = blobBeads({
    sdf: smoothUnion([sdEllipsoid(catCenter, catRadii), sdEllipsoid(insertCenter, insertRadii)], 0.8),
    bounds: new THREE.Box3(v(-3.8, -BILAYER_HALF - 6.6, -3.5), v(3.8, -BILAYER_HALF + 1.2, 3.5)),
    seed: 501,
    color,
  })
  group.add(meshFromBeads(beads, mat))

  return {
    group,
    parts: {},
    sites: {
      acylCarnitine: v(-2.3, -BILAYER_HALF - 2.4, 2.2),
      coa: v(-1.0, -BILAYER_HALF - 5.2, 2.6),
      exit: v(-1.4, -BILAYER_HALF - 6.4, 3.4),
    },
    dim,
    labelAnchor: v(1.2, -BILAYER_HALF - 5.8, 0.4),
  }
}

/**
 * Inorganic pyrophosphatase, free in the cytosol (a dimer): splits PPi into 2 Pi,
 * which makes the activation practically irreversible. Local origin = its centre.
 */
export function createPyrophosphatase(material: MaterialFactory): ProteinModel {
  const dim = { value: 0 }
  const mat = material(dim)
  const color = shadeOf(0.95)
  const group = new THREE.Group()
  const left = v(-1.15, 0, 0)
  const right = v(1.2, 0.15, -0.2)
  const radii = v(1.7, 1.55, 1.6)
  const beads = blobBeads({
    sdf: smoothUnion([sdEllipsoid(left, radii), sdEllipsoid(right, radii)], 0.7),
    bounds: new THREE.Box3(v(-3.6, -2.4, -2.4), v(3.6, 2.4, 2.4)),
    seed: 601,
    color,
  })
  group.add(meshFromBeads(beads, mat))
  return {
    group,
    parts: {},
    sites: { substrate: v(0.1, 0.9, 1.9) },
    dim,
    labelAnchor: v(0, 1.9, 0),
  }
}
