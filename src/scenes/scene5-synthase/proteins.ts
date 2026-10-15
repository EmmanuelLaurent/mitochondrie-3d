import * as THREE from 'three'
import { ATP_SYNTHASE } from '../../config/science.config'
import { buildBeadGeometry, helixBeads, sdCapsule, sdEllipsoid, smoothUnion, subtract, type Bead, type Sdf } from '../shared/molecular/beads'
import { BILAYER_HALF, v } from '../shared/molecular/frame'
import { blobBeads, shadeOf } from '../shared/molecular/proteinKit'

/**
 * The ATP synthase, a stylised bead model with the right topology (procedural, not a PDB
 * structure). Local frame of one monomer: origin at the c-ring's centre on the membrane
 * mid-plane, +y toward the crista lumen (intermembrane space), −y toward the matrix where
 * F1 sits; z = the scene's z (the camera looks from +z).
 *
 * - Rotor (mobile, one piece): the ring of 8 c subunits (hairpins of two helices, an H⁺
 *   site on each) and the central stalk γ (with its foot, δ + ε), bent and with a cam
 *   that deforms the β subunits as it turns.
 * - Stator (fixed): subunit a against the ring (two offset half-channels, drawn as
 *   grooves on its front face), the peripheral stalk and the OSCP cap on the head.
 * - Head α₃β₃ (fixed): three α and three β around γ; the lower domain of each β is a
 *   hinged « jaw » (open / loose / tight); the front α is cut away so γ shows.
 *
 * Angles: an azimuth is measured around the local y axis from +x toward +z, the sense in
 * which the rotor turns during synthesis (clockwise seen from the membrane side, the
 * reverse of the hydrolysis rotation observed by Noji et al. 1997; flagged in QUESTIONS).
 */

const C = ATP_SYNTHASE.cRingSubunits
const DEG = Math.PI / 180

/** c-ring radii (stave helices) and the H⁺ sites on its outer face. */
export const C_RING = { inner: 1.45, outer: 2.2, site: 2.95, halfHeight: 3.0 } as const

/**
 * Rest azimuth of site 0; sites every 360/8 degrees. Subunit a covers the ring around
 * azimuth 0: its lumen half-channel meets the ring at the front edge (CHANNEL_IN, where an
 * empty site waits at rest), its matrix half-channel half a notch earlier (CHANNEL_OUT, which
 * each site passes mid-way through a notch): an H⁺ rides 337.5°, almost a full turn.
 */
export const SITE_PHASE = 34
export const CHANNEL_IN = SITE_PHASE
export const CHANNEL_OUT = SITE_PHASE - 360 / C / 2

/** Azimuths of the head's subunits (degrees): β2 front-right, α in front (cut away), β3 front-left. */
export const BETA_AZIMUTHS = [270, 30, 150] as const
export const ALPHA_AZIMUTHS = [330, 90, 210] as const

/** Where the γ cam points at rotor angle 0: the open β (β3). */
export const CAM_AZIMUTH = 150

const HEAD = { y: -11.5, radius: 3.3, top: -15.6, hinge: -10.5 } as const

/** Jaw angles of a β (radians, outward): open, loose, tight. */
export const JAW = { open: 0.36, loose: 0.13, tight: 0 } as const

/** A point at azimuth `deg` (around local y), radius r, height y. */
export const around = (deg: number, r: number, y: number): THREE.Vector3 => v(r * Math.cos(deg * DEG), y, r * Math.sin(deg * DEG))

/** The H⁺ site of c subunit j at rotor angle θ (degrees), in the monomer's frame. */
export function cSite(j: number, theta: number): THREE.Vector3 {
  return around(SITE_PHASE + (360 / C) * j + theta, C_RING.site, 0)
}

/** The nucleotide pocket of β i, in the monomer's frame (on its outer face, at the hinge). */
export function betaPocket(i: number, outward = 0): THREE.Vector3 {
  return around(BETA_AZIMUTHS[i], 5.25 + outward, HEAD.hinge + 0.2)
}

/** Fixed points of the stator (monomer frame): the two half-channels and their mouths. */
export const SYNTHASE_SITES = {
  lumenMouth: v(3.45, BILAYER_HALF + 1.0, 1.9),
  lumenChannelEnd: v(2.8, 0.4, 1.85),
  matrixChannelStart: v(3.2, -0.45, 1.9),
  matrixMouth: v(3.55, -BILAYER_HALF - 1.0, 1.9),
  f1: v(0, HEAD.y, 0),
  foLabel: v(-2.2, -BILAYER_HALF - 0.6, 1.6),
  f1Label: around(200, 5.2, HEAD.y - 1.5),
  rotorLabel: v(-1.0, -5.6, 1.2),
  statorLabel: v(5.9, -8.0, 0.4),
  pmfFront: v(0, 0, 3.4),
} as const

export interface SynthaseGeometries {
  rotor: THREE.BufferGeometry
  stator: THREE.BufferGeometry
  head: THREE.BufferGeometry
  /** One per β, in its pivot's frame (see `jawHinge`). */
  jaws: THREE.BufferGeometry[]
  channels: THREE.BufferGeometry
  dispose(): void
}

/** Hinge of β i's jaw: point and axis (tangential), in the monomer's frame. */
export function jawHinge(i: number): { point: THREE.Vector3; axis: THREE.Vector3 } {
  const deg = BETA_AZIMUTHS[i]
  const point = around(deg, HEAD.radius + 0.4, HEAD.hinge)
  // Turning about ŷ × r̂ swings the jaw's free end (+y) outward (+r̂).
  const radial = around(deg, 1, 0)
  return { point, axis: new THREE.Vector3(0, 1, 0).cross(radial).normalize() }
}

const lobe = (center: THREE.Vector3, radii: THREE.Vector3): Sdf => sdEllipsoid(center, radii)
const boundsAround = (center: THREE.Vector3, radii: THREE.Vector3, pad = 0.9): THREE.Box3 =>
  new THREE.Box3(center.clone().sub(radii).subScalar(pad), center.clone().add(radii).addScalar(pad))

/**
 * Builds the shared geometries (one set for every monomer of the scene). `detail` is the
 * bead icosphere subdivision (1 for the hero dimer, 0 for the rows behind).
 */
export function buildSynthaseGeometries(detail: number): SynthaseGeometries {
  const spacing = detail > 0 ? 0.52 : 0.62
  const radius: [number, number] = detail > 0 ? [0.34, 0.45] : [0.4, 0.52]
  const geometry = (beads: Bead[]): THREE.BufferGeometry => buildBeadGeometry(beads, { detail, occlusion: 0.85 })

  // ---- rotor: c-ring (8 hairpins) + γ with its foot and cam
  const rotorBeads: Bead[] = []
  for (let j = 0; j < C; j++) {
    const deg = SITE_PHASE + (360 / C) * j
    const color = new THREE.Color(shadeOf(j % 2 ? 1.08 : 1.14))
    const h = C_RING.halfHeight
    rotorBeads.push(...helixBeads(around(deg + 8, C_RING.inner, h), around(deg + 8, C_RING.inner, -h), 0.42, color, 900 + j))
    rotorBeads.push(...helixBeads(around(deg, C_RING.outer, -h), around(deg, C_RING.outer, h), 0.44, color, 920 + j))
    // Loop of the hairpin on the matrix side.
    rotorBeads.push({ position: around(deg + 4, (C_RING.inner + C_RING.outer) / 2, -h - 0.35), radius: 0.42, color })
  }
  const gammaColor = shadeOf(1.18)
  const cam = (y: number): THREE.Vector3 => around(CAM_AZIMUTH, 0.55 * THREE.MathUtils.smoothstep(-y, 4, 9.5), y)
  const gammaSdf = smoothUnion(
    [
      sdCapsule(cam(-2.6), cam(-6.5), 0.85),
      sdCapsule(cam(-6.5), cam(-10.5), 0.85),
      sdCapsule(cam(-10.5), cam(-15.0), 0.75),
      // The cam: a bulge on one side, at the β jaws' level.
      lobe(around(CAM_AZIMUTH, 0.7, -9.6), v(0.8, 1.4, 0.8)),
      // The foot (δ + ε) seated on the ring.
      lobe(v(0.2, -4.2, 0), v(1.8, 1.0, 1.7)),
    ],
    0.6,
  )
  rotorBeads.push(...blobBeads({ sdf: gammaSdf, bounds: new THREE.Box3(v(-2.6, -16, -2.6), v(2.6, -2.2, 2.6)), seed: 940, color: gammaColor, spacing, radius }))
  const rotor = geometry(rotorBeads)

  // ---- stator: subunit a, peripheral stalk, OSCP
  const ringHole = (p: THREE.Vector3): number => Math.hypot(p.x, p.z) - (C_RING.site + 0.2)
  const statorSdf = smoothUnion(
    [
      subtract(lobe(v(3.65, 0, 0), v(1.35, BILAYER_HALF + 0.5, 2.1)), ringHole),
      sdCapsule(v(4.4, -2.4, -0.5), v(5.8, -15.0, -0.9), 0.6),
      lobe(v(2.6, HEAD.top - 0.9, -0.4), v(1.7, 1.15, 1.7)),
    ],
    0.7,
  )
  const stator = geometry(blobBeads({ sdf: statorSdf, bounds: new THREE.Box3(v(1.5, -18, -3), v(7.2, 3.6, 3)), seed: 950, color: shadeOf(0.9), spacing, radius }))

  // ---- head: three α (the front one cut away) and the bodies of the three β
  const cavity = (p: THREE.Vector3): number => Math.hypot(p.x, p.z) - 1.65
  const headBeads: Bead[] = []
  ALPHA_AZIMUTHS.forEach((deg, i) => {
    const center = around(deg, HEAD.radius, HEAD.y)
    const radii = v(2.25, 3.9, 2.25)
    const front = deg === 90
    headBeads.push(
      ...blobBeads({
        sdf: subtract(lobe(center, radii), cavity),
        bounds: boundsAround(center, radii),
        seed: 960 + i,
        color: shadeOf(0.98),
        spacing,
        radius,
        // The front α is cut away (stepped cut) except its crown: γ shows through.
        keep: front ? (p) => p.y < HEAD.top + 1.6 : undefined,
      }),
    )
  })
  const jawBeads: Bead[][] = [[], [], []]
  BETA_AZIMUTHS.forEach((deg, i) => {
    const body = { center: around(deg, HEAD.radius, HEAD.y - 1.1), radii: v(2.3, 3.0, 2.3) }
    const jaw = { center: around(deg, HEAD.radius - 0.2, HEAD.hinge + 1.7), radii: v(2.05, 1.9, 2.05) }
    const sdf = subtract(smoothUnion([lobe(body.center, body.radii), lobe(jaw.center, jaw.radii)], 0.5), cavity)
    const beads = blobBeads({
      sdf,
      bounds: boundsAround(body.center, v(2.4, 5.2, 2.4)),
      seed: 970 + i,
      color: shadeOf(1.06),
      spacing,
      radius,
    })
    for (const bead of beads) (bead.position.y > HEAD.hinge ? jawBeads[i] : headBeads).push(bead)
  })
  const head = geometry(headBeads)
  const jaws = jawBeads.map((beads, i) => {
    const g = geometry(beads)
    const hinge = jawHinge(i).point
    g.translate(-hinge.x, -hinge.y, -hinge.z)
    return g
  })

  // ---- the two half-channels: dark grooves on subunit a's front face (they do not meet)
  const groove = (from: THREE.Vector3, to: THREE.Vector3): THREE.BufferGeometry => {
    const length = from.distanceTo(to)
    const capsule = new THREE.CapsuleGeometry(0.24, Math.max(0.01, length - 0.48), 2, 8)
    capsule.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), to.clone().sub(from).normalize()))
    capsule.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
    return capsule.toNonIndexed()
  }
  const parts = [groove(SYNTHASE_SITES.lumenMouth, SYNTHASE_SITES.lumenChannelEnd), groove(SYNTHASE_SITES.matrixChannelStart, SYNTHASE_SITES.matrixMouth)]
  const channels = new THREE.BufferGeometry()
  channels.setAttribute('position', new THREE.Float32BufferAttribute(parts.flatMap((g) => Array.from(g.getAttribute('position').array as Float32Array)), 3))
  channels.setAttribute('normal', new THREE.Float32BufferAttribute(parts.flatMap((g) => Array.from(g.getAttribute('normal').array as Float32Array)), 3))
  parts.forEach((g) => g.dispose())

  return {
    rotor,
    stator,
    head,
    jaws,
    channels,
    dispose() {
      for (const g of [rotor, stator, head, channels, ...jaws]) g.dispose()
    },
  }
}

export interface SynthaseMaterials {
  rotor: THREE.Material
  stator: THREE.Material
  head: THREE.Material
  channels: THREE.Material
}

export interface Synthase {
  group: THREE.Group
  rotor: THREE.Group
  /** One pivot per β; its rotation is set by `setRotor`. */
  jaws: THREE.Group[]
  /** Sets the rotor angle (degrees) and the β jaws that follow it. */
  setRotor(theta: number): void
}

/**
 * The open / loose / tight cycle of β i at rotor angle θ (degrees): every 120° each β
 * moves one state on (tight → open: the ATP is released; loose → tight: it forms;
 * open → loose: ADP + Pi bind), the change happening in the last 30° before the boundary.
 * At θ = 0: β1 tight, β2 loose, β3 open.
 */
export function betaPhase(i: number, theta: number): number {
  const start = [2, 1, 0][i]
  return start + theta / 120
}

const JAW_STATES = [JAW.open, JAW.loose, JAW.tight]

export function jawAngle(i: number, theta: number): number {
  const phase = betaPhase(i, theta)
  const n = Math.floor(phase)
  const f = phase - n
  const from = JAW_STATES[((n % 3) + 3) % 3]
  const to = JAW_STATES[(((n + 1) % 3) + 3) % 3]
  return THREE.MathUtils.lerp(from, to, THREE.MathUtils.smoothstep(f, 0.75, 1))
}

/** One monomer from the shared geometries (`mirror`: the partner, its stator on its other side). */
export function createSynthase(geometries: SynthaseGeometries, materials: SynthaseMaterials, castShadow: boolean): Synthase {
  const group = new THREE.Group()
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(geometry, material)
    m.castShadow = castShadow
    m.receiveShadow = true
    return m
  }
  const rotor = new THREE.Group()
  rotor.add(mesh(geometries.rotor, materials.rotor))
  group.add(rotor, mesh(geometries.stator, materials.stator), mesh(geometries.head, materials.head))
  const channels = new THREE.Mesh(geometries.channels, materials.channels)
  group.add(channels)
  const jaws = geometries.jaws.map((geometry, i) => {
    const pivot = new THREE.Group()
    pivot.position.copy(jawHinge(i).point)
    pivot.add(mesh(geometry, materials.head))
    group.add(pivot)
    return pivot
  })
  const setRotor = (theta: number): void => {
    // rotation.y = −θ carries +x toward +z: the azimuths above grow with θ.
    rotor.rotation.y = -theta * DEG
    jaws.forEach((pivot, i) => pivot.quaternion.setFromAxisAngle(jawHinge(i).axis, jawAngle(i, theta)))
  }
  setRotor(0)
  return { group, rotor, jaws, setRotor }
}
