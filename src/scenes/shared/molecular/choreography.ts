import * as THREE from 'three'
import gsap from 'gsap'

/**
 * Pure-function choreography: every pose is a function of the timeline time, so
 * playing, pausing, stepping back, seeking and frame-by-frame video export all show
 * exactly the same picture for a given time. GSAP only provides the clock and labels.
 */

export type Ease = (u: number) => number

export const EASE = {
  linear: (u: number) => u,
  inOut: gsap.parseEase('power2.inOut') as Ease,
  out: gsap.parseEase('power2.out') as Ease,
  in: gsap.parseEase('power2.in') as Ease,
  gentle: gsap.parseEase('sine.inOut') as Ease,
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** 0 before t0, 1 after t1, eased in between. */
export function ramp(t: number, t0: number, t1: number, ease: Ease = EASE.inOut): number {
  if (t1 <= t0) return t >= t1 ? 1 : 0
  return ease(clamp01((t - t0) / (t1 - t0)))
}

/** Piecewise scalar keyframes [time, value, ease into this key]. */
export function scalarTrack(keys: [number, number, Ease?][]): (t: number) => number {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, ease] = keys[i]
      if (t <= t1) {
        const [t0, v0] = keys[i - 1]
        return THREE.MathUtils.lerp(v0, v1, ramp(t, t0, t1, ease ?? EASE.inOut))
      }
    }
    return keys[keys.length - 1][1]
  }
}

export interface Pose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

export const pose = (position: THREE.Vector3, quaternion = new THREE.Quaternion()): Pose => ({ position, quaternion })

export const euler = (x: number, y: number, z: number): THREE.Quaternion =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))

type PoseSource = Pose | ((t: number) => Pose)

interface Segment {
  t0: number
  t1: number
  kind: 'hold' | 'travel' | 'follow' | 'hidden'
  target?: PoseSource
  via?: THREE.Vector3[]
  ease?: Ease
  parent?: Actor
  local?: Pose
  /** Brownian-like jiggle amplitude (nm) while free in solution; 0 when bound. */
  jiggle: number
  curve?: { from: THREE.Vector3; to: THREE.Vector3; path: THREE.CatmullRomCurve3 }
}

/** Curves are rebuilt only when their end points move (e.g. a target that follows another actor). */
function curveFor(segment: Segment, from: THREE.Vector3, to: THREE.Vector3): THREE.CatmullRomCurve3 {
  const cached = segment.curve
  if (cached && cached.from.distanceToSquared(from) < 1e-10 && cached.to.distanceToSquared(to) < 1e-10) return cached.path
  const path = new THREE.CatmullRomCurve3([from.clone(), ...segment.via!, to.clone()], false, 'centripetal')
  segment.curve = { from: from.clone(), to: to.clone(), path }
  return path
}

let actorSeed = 0

/**
 * Each story calls this before creating its actors, so their jiggle phases (and every
 * frame of the video export) are the same whatever was visited before.
 */
export function resetActorSeeds(): void {
  actorSeed = 0
}

/** Liveliness of the thermal jiggle over time (0..1). */
export type Envelope = (t: number) => number

/**
 * The storyboard's liveliness: 0 during each step's arrêt (its still end state, the last
 * `arret` seconds of the step) and during the `quiet` steps, 1 otherwise, with short
 * fades. Nothing jitters while the student reads, and the progressive renderer can
 * refine the still picture.
 */
export function createLiveliness(starts: Record<string, number>, duration: number, arret: number, quiet: readonly number[] = []): Envelope {
  const begins = Object.values(starts)
  const ends = [...begins.slice(1), duration]
  return (t) => {
    let calm = 0
    begins.forEach((start, i) => {
      const end = ends[i]
      const quietFrom = quiet.includes(start) ? start : end - arret
      calm = Math.max(calm, ramp(t, quietFrom - 0.8, quietFrom) * (1 - ramp(t, end, end + 0.8)))
    })
    return 1 - calm
  }
}

/** Index of the step playing at time t (the last step whose start is ≤ t). */
export function stepIndexAt(starts: Record<string, number>, t: number): number {
  return Math.max(0, Object.values(starts).filter((start) => t >= start).length - 1)
}

/**
 * Something that moves: a molecule or one of its parts. Its life is a list of
 * segments: hold still, travel (along an optional curve) to a pose, follow another
 * actor (bonded/bound), or be hidden. Each travel starts where the previous segment ended.
 * Its thermal jiggle is scaled by the storyboard's liveliness `envelope`.
 */
export class Actor {
  private readonly segments: Segment[] = []
  private readonly phase = (actorSeed += 1) * 1.7319
  private readonly scratch = new THREE.Vector3()

  constructor(
    readonly object: THREE.Object3D,
    private readonly start: Pose,
    private readonly envelope: Envelope = () => 1,
  ) {}

  hold(t0: number, t1: number, jiggle = 0): this {
    this.segments.push({ t0, t1, kind: 'hold', jiggle })
    return this
  }

  travel(t0: number, t1: number, target: PoseSource, options: { via?: THREE.Vector3[]; ease?: Ease; jiggle?: number } = {}): this {
    this.segments.push({ t0, t1, kind: 'travel', target, via: options.via, ease: options.ease, jiggle: options.jiggle ?? 0 })
    return this
  }

  follow(t0: number, t1: number, parent: Actor, local: Pose): this {
    this.segments.push({ t0, t1, kind: 'follow', parent, local, jiggle: 0 })
    return this
  }

  hide(t0: number, t1: number): this {
    this.segments.push({ t0, t1, kind: 'hidden', jiggle: 0 })
    return this
  }

  /**
   * Pose at time t (world frame of the set). `withJiggle: false` gives the smooth path
   * only (what a camera should follow).
   */
  poseAt(t: number, out: Pose = pose(new THREE.Vector3(), new THREE.Quaternion()), withJiggle = true): Pose {
    let index = -1
    for (let i = 0; i < this.segments.length; i++) {
      if (this.segments[i].t0 <= t) index = i
    }
    if (index < 0) {
      out.position.copy(this.start.position)
      out.quaternion.copy(this.start.quaternion)
      return out
    }
    const segment = this.segments[index]
    const local = Math.min(t, segment.t1)
    switch (segment.kind) {
      case 'hold':
      case 'hidden':
        this.endOf(index - 1, out)
        break
      case 'follow': {
        segment.parent!.poseAt(local, out)
        out.position.add(segment.local!.position.clone().applyQuaternion(out.quaternion))
        out.quaternion.multiply(segment.local!.quaternion)
        break
      }
      case 'travel': {
        const from = this.endOf(index - 1, pose(new THREE.Vector3(), new THREE.Quaternion()))
        const to = resolve(segment.target!, segment.t1)
        const u = ramp(local, segment.t0, segment.t1, segment.ease ?? EASE.inOut)
        if (segment.via && segment.via.length) {
          curveFor(segment, from.position, to.position).getPointAt(u, out.position)
        } else {
          out.position.lerpVectors(from.position, to.position, u)
        }
        out.quaternion.slerpQuaternions(from.quaternion, to.quaternion, u)
        break
      }
    }
    if (withJiggle) this.addJiggle(segment, t, out)
    return out
  }

  /** Visible at time t (hidden segments). */
  visibleAt(t: number): boolean {
    let visible = true
    for (const segment of this.segments) {
      if (segment.t0 <= t) visible = segment.kind !== 'hidden'
    }
    return visible
  }

  apply(t: number): void {
    const p = this.poseAt(t)
    this.object.position.copy(p.position)
    this.object.quaternion.copy(p.quaternion)
    this.object.visible = this.visibleAt(t)
  }

  private endOf(index: number, out: Pose): Pose {
    if (index < 0) {
      out.position.copy(this.start.position)
      out.quaternion.copy(this.start.quaternion)
      return out
    }
    const segment = this.segments[index]
    if (segment.kind === 'travel') {
      const to = resolve(segment.target!, segment.t1)
      out.position.copy(to.position)
      out.quaternion.copy(to.quaternion)
      return out
    }
    if (segment.kind === 'follow') {
      segment.parent!.poseAt(segment.t1, out)
      out.position.add(segment.local!.position.clone().applyQuaternion(out.quaternion))
      out.quaternion.multiply(segment.local!.quaternion)
      return out
    }
    return this.endOf(index - 1, out)
  }

  /** Smooth, deterministic thermal motion (sums of incommensurate sines), faded in/out at segment ends. */
  private addJiggle(segment: Segment, t: number, out: Pose): void {
    if (segment.jiggle <= 0) return
    const edge = Math.min(1, (t - segment.t0) / 0.6, (segment.t1 - t) / 0.6) * this.envelope(t)
    if (edge <= 0) return
    const a = segment.jiggle * Math.max(0, edge)
    const p = this.phase
    this.scratch.set(
      Math.sin(1.3 * t + p) + 0.5 * Math.sin(2.9 * t + 2.1 * p),
      Math.sin(1.1 * t + 1.7 * p) + 0.5 * Math.sin(3.3 * t + p),
      Math.sin(0.9 * t + 2.3 * p) + 0.5 * Math.sin(2.3 * t + 0.7 * p),
    )
    out.position.addScaledVector(this.scratch, a * 0.5)
    const wobble = euler(0.25 * a * Math.sin(1.7 * t + p), 0.25 * a * Math.sin(1.2 * t + 2 * p), 0.25 * a * Math.sin(1.5 * t + 3 * p))
    out.quaternion.multiply(wobble)
  }
}

function resolve(source: PoseSource, t: number): Pose {
  return typeof source === 'function' ? source(t) : source
}

/**
 * Pose that puts `child` (whose attachment point is at its local origin) onto
 * `parent`'s attachment point, at time t: used to dock a carrier onto the chain.
 */
export function attachedPose(parent: Actor, local: Pose): (t: number) => Pose {
  return (t) => {
    const p = parent.poseAt(t)
    p.position.add(local.position.clone().applyQuaternion(p.quaternion))
    p.quaternion.multiply(local.quaternion)
    return p
  }
}
