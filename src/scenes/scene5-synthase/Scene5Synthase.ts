import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NarrationControl, Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { COMPARTMENT_COLORS, MOLECULE_COLORS } from '../../config/palette'
import {
  ATP_SYNTHASE,
  BETA_OXIDATION,
  computePalmitateBalance,
  electricShareOfPmf,
  oxphosATP,
  PO_RATIOS,
  protonsThroughFoPerATP,
  TRANSPORT_COST,
  zoomFactor,
} from '../../config/science.config'
import { content } from '../../i18n/content'
import { createFill, formatNumber } from '../../i18n/fill'
import { REFERENCE_STATE, type Inhibitor, type LabState } from '../../labo/labModel'
import { LabPanel } from '../../ui/lab/LabPanel'
import { StepPlayer } from '../../ui/player/StepPlayer'
import { Quiz } from '../../ui/quiz/Quiz'
import { createCact } from '../scene2-shuttle/proteins'
import { createComplexI, createComplexIII, createComplexIV } from '../scene4-chain/proteins'
import { OrbitOffsets, placeCamera, type CameraShot } from '../shared/molecular/camera'
import { ramp, stepIndexAt } from '../shared/molecular/choreography'
import { createCurvedMembrane, type CurvedMembrane } from '../shared/molecular/curvedMembrane'
import { BILAYER_HALF, CUT_Z, v } from '../shared/molecular/frame'
import { FramingBand } from '../shared/molecular/framing'
import { createRecapCard } from '../shared/molecular/hud'
import { LabelSet } from '../shared/molecular/labels'
import { patchMaterial } from '../shared/molecular/media'
import { createNucleotide, createPhosphate, type MoleculeMaterials, type Nucleotide } from '../shared/molecular/molecules'
import { createStepTimeline, playerSteps } from '../shared/molecular/narration'
import type { MaterialFactory, ProteinModel } from '../shared/molecular/proteinKit'
import { MolecularStage } from '../shared/molecular/stage'
import { createCostCard, SynthaseGauge } from './hud'
import {
  ANT,
  cristaMedia,
  FLANK_COMPLEXES,
  HERO,
  lumenSlots,
  matrixSlots,
  MEMBRANE_DETAIL,
  membraneHoles,
  PARTNER,
  PHOSPHATE_CARRIER,
  PROFILE,
  ROW,
  TIP_RADIUS,
  type ComplexKey,
  type FlankPlacement,
  type MonomerPlacement,
} from './layout'
import { betaPocket, buildSynthaseGeometries, createSynthase, SYNTHASE_SITES, type Synthase, type SynthaseGeometries, type SynthaseMaterials } from './proteins'
import {
  antOpen,
  ATP_RELEASE,
  atpReleasedAt,
  countersAt,
  createCameraTrack,
  DURATION,
  formOf,
  HERO_OUT,
  heroAngle,
  heroCompartment,
  heroWorld,
  lanePoint,
  notchAngle,
  NOTCHES,
  otherAngle,
  phosphateCarrierOpen,
  reticleAt,
  RING_PROTONS,
  ringProtonWorld,
  STEP_STARTS,
  SynthaseStory,
  T,
  type Lane,
} from './story'

const text = content.scenes.scene5
const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const balance = computePalmitateBalance()
const PO = PO_RATIOS.current
const C = ATP_SYNTHASE.cRingSubunits

/** Every number of the texts comes from the science config. */
const VALUES = {
  protons: balance.protonsPumped,
  cSubunits: C,
  atpPerTurn: ATP_SYNTHASE.atpPerFullRotation,
  foPerAtp: formatNumber(protonsThroughFoPerATP()),
  totalPerAtp: formatNumber(protonsThroughFoPerATP() + TRANSPORT_COST.protonsPerATP),
  protonsPerAtp: formatNumber(balance.protonsPumped > 0 ? 10 / PO.nadh : 0),
  perNadh: 10,
  perFadh2: 6,
  poNadh: formatNumber(PO.nadh),
  poFadh2: formatNumber(PO.fadh2),
  poNadhLegacy: formatNumber(PO_RATIOS.legacy.nadh),
  poFadh2Legacy: formatNumber(PO_RATIOS.legacy.fadh2),
  nadh: balance.nadh,
  fadh2: balance.fadh2,
  gtp: balance.gtp,
  cost: BETA_OXIDATION.activationCostATP,
  atpNet: balance.atpNet,
  oxphos: oxphosATP(),
  zoomIn: zoomFactor('crista', 'molecular'),
  zoomOut: zoomFactor('crista', 'molecular'),
}
const fill = createFill(VALUES)

type CalloutKey = 'synthase' | 'fo' | 'f1' | 'rotor' | 'stator' | 'phosphateCarrier' | 'ant' | 'complexI' | 'complexIII' | 'complexIV'

const S = STEP_STARTS

/** When each callout names its structure. */
const WINDOWS: Record<CalloutKey, [number, number][]> = {
  synthase: [
    [T.glide[0], S.machine],
    [T.complexesLit[0], DURATION],
  ],
  fo: [[T.fo[0], T.f1Lit[0]]],
  f1: [[T.f1Lit[0], T.rotorLit[0]]],
  rotor: [[T.rotorLit[0], S.gradient]],
  stator: [[T.rotorLit[1] - 1.0, S.gradient]],
  phosphateCarrier: [
    [S.phosphate, S.ant],
    [T.complexesLit[0], DURATION],
  ],
  ant: [[S.ant, S.cost]],
  complexI: [[T.complexesLit[0], DURATION]],
  complexIII: [[T.complexesLit[0] + 1.0, DURATION]],
  complexIV: [[T.complexesLit[0] + 2.0, DURATION]],
}

const inWindow = (key: CalloutKey, t: number): boolean => WINDOWS[key].some(([a, b]) => t >= a && t < b)

/** The proton circuit's loops at the crista tier (closed paths through a complex and a synthase). */
function circuitLanes(): Lane[] {
  const R = TIP_RADIUS
  const loop = (points: THREE.Vector3[], beads: number): Lane => ({ curve: new THREE.CatmullRomCurve3(points, true, 'centripetal'), beads })
  const z = CUT_Z - 3
  const through = (side: -1 | 1, y: number, fo: THREE.Vector3, out: THREE.Vector3): THREE.Vector3[] => [
    v(side * (R + 7), y, z), // matrix, by the complex
    v(side * R, y, z), // through the complex (pumped)
    v(side * (R - 5.5), y - 2, z), // into the lumen
    v(side * 3.5, Math.max(4, y * 0.35), z),
    v(fo.x * 0.55, fo.y * 0.55 + 1.5, z), // down the lumen to the synthase
    v(fo.x, fo.y, z), // through Fo
    out.clone().setZ(z), // out into the matrix, under F1
    v(side * (R + 16), out.y + 10, z),
    v(side * (R + 15), y * 0.6, z),
  ]
  const heroOut = HERO.fo.clone().addScaledVector(HERO.axis, 6)
  const partnerOut = PARTNER.fo.clone().addScaledVector(PARTNER.axis, 6)
  const picY = PHOSPHATE_CARRIER.position.y
  return [
    loop(through(-1, 92, PARTNER.fo, partnerOut), 16),
    loop(through(-1, 34, PARTNER.fo, partnerOut), 10),
    loop(through(1, 44, HERO.fo, heroOut), 12),
    loop(through(1, 98, HERO.fo, heroOut), 16),
    // The H⁺ that comes back with the Pi: lumen → phosphate carrier → matrix → around.
    loop([v(R - 5, picY + 1, z), v(R, picY, z), v(R + 6, picY - 1, z), v(R + 12, picY + 14, z), v(R + 7, 26, z), v(R - 4, 18, z)], 6),
  ]
}

/**
 * The Labo's lanes, at the crista tier: H⁺ pumped out through each complex (matrix →
 * lumen), back in through the synthases (lumen → matrix), and the leak (lumen → straight
 * through the bilayer → matrix: the uncoupler, or the small basal leak).
 */
function labLanes(): { pump: Lane[]; back: Lane[]; leak: Lane[] } {
  const R = TIP_RADIUS
  const z = CUT_Z - 3
  const open = (points: THREE.Vector3[], beads: number): Lane => ({ curve: new THREE.CatmullRomCurve3(points, false, 'centripetal'), beads })
  const pump = FLANK_COMPLEXES.map(({ placement }) => {
    const side = placement.position.x < 0 ? -1 : 1
    const y = placement.position.y
    return open([v(side * (R + 12), y - 3, z), v(side * (R + 4), y, z), v(side * R, y, z), v(side * (R - 4), y - 1, z), v(side * 2.5, y - 6, z)], 7)
  })
  const back = [HERO, PARTNER].map((m) => {
    const side = m.fo.x < 0 ? -1 : 1
    return open(
      [
        v(side * 2.5, 16, z),
        v(side * 3.5, 4, z),
        m.fo.clone().multiplyScalar(0.6).setZ(z),
        m.fo.clone().setZ(z),
        m.fo.clone().addScaledVector(m.axis, 7).setZ(z),
        m.fo.clone().addScaledVector(m.axis, 13).add(v(side * 4, 0, 0)).setZ(z),
      ],
      9,
    )
  })
  const leak = [-1, 1].flatMap((side) =>
    [26, 78].map((y) => open([v(side * 2.5, y + 4, z), v(side * (R - 3.5), y, z), v(side * R, y, z), v(side * (R + 4), y, z), v(side * (R + 14), y - 4, z)], 5)),
  )
  return { pump, back, leak }
}

export class Scene5Synthase implements Scene {
  readonly id = 'scene5-synthase'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 9000)
  readonly multisampling = 4

  private context: SceneContext | null = null
  private readonly root = new THREE.Group()
  private readonly set = new THREE.Group()
  private stage: MolecularStage | null = null
  private story: SynthaseStory | null = null
  private cameraTrack: ((t: number, out: CameraShot) => CameraShot) | null = null
  private readonly shot: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  private timeline: gsap.core.Timeline | null = null
  private player: StepPlayer | null = null
  private offsets: OrbitOffsets | null = null
  private band: FramingBand | null = null
  private membrane: CurvedMembrane | null = null
  private geometries: SynthaseGeometries[] = []
  private hero: Synthase | null = null
  private partner: Synthase | null = null
  private row: Synthase[] = []
  private heroDims: { rotor: THREE.IUniform<number>; stator: THREE.IUniform<number>; head: THREE.IUniform<number> } | null = null
  private contextDim: THREE.IUniform<number> = { value: 0 }
  private carriers: { phosphate: ProteinModel & { setOpenTo(side: number): void }; ant: ProteinModel & { setOpenTo(side: number): void } } | null = null
  private complexes: { key: ComplexKey; model: ProteinModel }[] = []
  private nucleotides: Nucleotide[] = []
  private ringBeads: THREE.InstancedMesh | null = null
  private crowd: THREE.InstancedMesh | null = null
  private crowdSlots: THREE.Vector3[] = []
  private laneBeads: THREE.InstancedMesh | null = null
  private lanes: Lane[] = []
  private charges: THREE.InstancedMesh[] = []
  private chargeMaterial: THREE.MeshStandardMaterial | null = null
  private readonly labels = new LabelSet<CalloutKey>()
  private gauge: SynthaseGauge | null = null
  private costCard: { element: HTMLElement; lines: HTMLElement[] } | null = null
  private recapCard: HTMLElement | null = null
  private recenterButton: HTMLButtonElement | null = null
  private quiz: Quiz | null = null
  private unsubscribeQuality: (() => void) | null = null
  private lastSignature = Number.NaN
  private forceDirty = true
  private lastTier: 'molecular' | 'crista' | null = null
  private lastTime = -1
  private hovered: CalloutKey | null = null
  private legendHighlighted = false
  private labelledStep = -1
  private reticleSize = 2.4
  private readonly matrix = new THREE.Matrix4()
  private readonly scratch = new THREE.Vector3()
  // Labo mode: the crista tier, flows driven by the qualitative model.
  private lab: LabState = REFERENCE_STATE
  private labInhibitors: ReadonlySet<Inhibitor> = new Set()
  private labPanel: LabPanel | null = null
  private labLanes: { pump: Lane[]; back: Lane[]; leak: Lane[] } | null = null
  private labBeads: THREE.InstancedMesh | null = null
  private readonly labPhases = { pump: 0, back: 0, leak: 0, rotor: 0 }
  private labBlocked: { tag: HTMLElement; object: CSS2DObject; key: Inhibitor }[] = []

  /** `lab`: the Labo mode (no narration; inhibitors and ADP drive the flows at the crista tier). */
  constructor(private readonly mode: 'story' | 'lab' = 'story') {
    this.threeScene.add(this.root)
  }

  readonly narration: NarrationControl = {
    duration: DURATION,
    seek: (seconds: number): void => {
      this.player?.pause()
      this.timeline?.seek(seconds, false)
    },
  }

  async enter(context: SceneContext): Promise<void> {
    this.context = context
    const { clientWidth, clientHeight } = context.container
    this.camera.aspect = clientWidth / Math.max(1, clientHeight)
    this.camera.updateProjectionMatrix()
    const low = context.quality.current === 'low'

    this.stage = new MolecularStage(context.renderer, this.threeScene, this.root, cristaMedia(), {
      halfSize: 42,
      near: 20,
      far: 340,
      target: v(6, -6, 12),
    })
    this.stage.configureShadows(low)

    this.buildSet(low)
    this.root.add(this.set)

    this.offsets = new OrbitOffsets(context.renderer.domElement)
    this.band = new FramingBand(context.container, context.playerRoot, () => {
      this.forceDirty = true
    })
    const recenter = document.createElement('button')
    recenter.type = 'button'
    recenter.className = 'recenter-button'
    recenter.textContent = `⟲ ${content.player.recenter}`
    recenter.hidden = true
    recenter.addEventListener('click', () => this.offsets?.reset())
    context.container.append(recenter)
    this.recenterButton = recenter
    this.buildCallouts(context)
    if (this.mode === 'lab') {
      await this.enterLab(context)
      return
    }
    this.gauge = new SynthaseGauge(context.container, VALUES, electricShareOfPmf())
    this.costCard = createCostCard(VALUES)
    this.costCard.element.hidden = true
    this.recapCard = createRecapCard({
      title: text.recap.title,
      keyMessage: fill(text.recap.keyMessage),
      net: fill(text.recap.net),
      bridge: fill(text.recap.bridge),
      nextChapter: content.chapters.items.scene6,
      onNext: context.visit.goNext,
      onQuiz: () => {
        this.player?.pause()
        this.quiz?.close()
        const questions = text.questions.map((question) => ({
          ...question,
          question: fill(question.question),
          choices: question.choices.map(fill),
          explanation: fill(question.explanation),
        }))
        this.quiz = new Quiz(context.container, `${content.quiz.open} — ${text.title}`, questions, text.needsTeacherReview)
      },
    })
    this.recapCard.hidden = true
    context.container.append(this.costCard.element, this.recapCard)

    context.journey.set(countersAt(0))
    context.legend.setHighlighted([])
    context.sceneCaption.textContent = ''
    context.scaleBar.setTier('crista')
    this.lastTier = 'crista'

    this.unsubscribeQuality = context.quality.onChange((level) => {
      this.stage?.configureShadows(level === 'low')
      this.forceDirty = true
    })

    this.applyTime(0)
    await context.renderer.compileAsync(this.threeScene, this.camera)
    if (this.context !== context) return
    this.applyTime(0)

    this.timeline = createStepTimeline(STEP_STARTS, DURATION)
    const tooltips = text.tooltips as Record<string, string>
    const titles = text.tooltipTitles as Record<string, string>
    this.player = new StepPlayer(context.playerRoot, {
      timeline: this.timeline,
      steps: playerSteps(text.steps, fill, (key) => ({ title: fill(titles[key]), text: tooltips[key] }), (title, body) => context.tooltipLayer.show(title, body)),
      reducedMotion: prefersReducedMotion(),
      autoplay: context.visit.guided,
      onUpdate: () => {},
      onComplete: () => context.visit.onComplete(),
      onStepChange: () => context.tooltipLayer.clear(),
    })
  }

  update(deltaSeconds: number): void {
    if (!this.story) return
    if (this.mode === 'lab') {
      this.updateLab(deltaSeconds)
      return
    }
    const offsetsMoving = this.offsets?.update(deltaSeconds) ?? false
    const t = this.timeline?.time() ?? 0
    if (t !== this.lastTime || offsetsMoving || this.forceDirty) this.applyTime(t)
  }

  needsRender(): boolean {
    const signature = this.signature()
    const changed = this.forceDirty || signature !== this.lastSignature
    this.lastSignature = signature
    this.forceDirty = false
    return changed
  }

  setFrame(frame: number, accumulating: boolean): void {
    this.stage?.setFrame(frame, accumulating)
  }

  afterRender(): void {
    if (!this.context) return
    const distance = this.shot.distance * (this.offsets?.zoom ?? 1)
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    this.context.scaleBar.setPixelsPerMeter((this.context.container.clientHeight / viewHeight) * 1e9)
    this.labels.sizeReticle(this.camera, this.context.container.clientHeight, this.reticleSize)
  }

  exit(): void {
    this.player?.dispose()
    this.player = null
    this.timeline?.kill()
    this.timeline = null
    this.offsets?.dispose()
    this.offsets = null
    this.band?.dispose()
    this.band = null
    this.unsubscribeQuality?.()
    this.unsubscribeQuality = null
    this.gauge?.dispose()
    this.gauge = null
    this.labPanel?.dispose()
    this.labPanel = null
    for (const blocked of this.labBlocked) blocked.tag.remove()
    this.labBlocked = []
    this.costCard?.element.remove()
    this.costCard = null
    this.recapCard?.remove()
    this.recapCard = null
    this.recenterButton?.remove()
    this.recenterButton = null
    this.quiz?.close()
    this.quiz = null
    this.labels.dispose()
    if (this.context) {
      this.context.renderer.domElement.removeAttribute('role')
      this.context.renderer.domElement.removeAttribute('aria-label')
      this.context.tooltipLayer.clear()
      this.context.legend.setHighlighted([])
    }
    this.context = null
    this.stage?.dispose()
    this.stage = null
    disposeObject3D(this.root)
    for (const geometries of this.geometries) geometries.dispose()
    this.geometries = []
    this.root.clear()
    this.story = null
  }

  // ------------------------------------------------------------------- build

  private buildSet(low: boolean): void {
    const media = this.stage!.media

    this.membrane = createCurvedMembrane({
      profile: PROFILE,
      detail: MEMBRANE_DETAIL,
      cutZ: CUT_Z,
      depth: 3000,
      headColor: COMPARTMENT_COLORS.innerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.innerMembrane.section,
      holes: membraneHoles(),
      media,
      low,
      seed: 5014,
    })
    this.set.add(this.membrane.group)

    const proteinMaterial = (dim: THREE.IUniform<number>, shade = 1): THREE.MeshPhysicalMaterial => {
      const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        color: new THREE.Color(shade, shade, shade),
        roughness: 0.62,
        sheen: 0.25,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(0xffffff),
        envMapIntensity: 0.35,
      })
      patchMaterial(material, media, { dim })
      return material
    }
    const factory: MaterialFactory = (dim) => proteinMaterial(dim)

    // ATP synthases: the hero dimer in detail, the rows behind simplified.
    const channelMaterial = new THREE.MeshStandardMaterial({ color: '#30353d', roughness: 0.8 })
    patchMaterial(channelMaterial, media)
    const heroGeometries = buildSynthaseGeometries(1)
    const rowGeometries = buildSynthaseGeometries(low ? 0 : 1, true)
    this.geometries = [heroGeometries, rowGeometries]
    this.heroDims = { rotor: { value: 0 }, stator: { value: 0 }, head: { value: 0 } }
    const heroMaterials: SynthaseMaterials = {
      rotor: proteinMaterial(this.heroDims.rotor, 1.04),
      stator: proteinMaterial(this.heroDims.stator, 0.94),
      head: proteinMaterial(this.heroDims.head),
      channels: channelMaterial,
    }
    const contextMaterials: SynthaseMaterials = {
      rotor: proteinMaterial(this.contextDim, 1.04),
      stator: proteinMaterial(this.contextDim, 0.94),
      head: proteinMaterial(this.contextDim),
      channels: channelMaterial,
    }
    const place = (synthase: Synthase, placement: MonomerPlacement): Synthase => {
      synthase.group.position.copy(placement.fo)
      synthase.group.quaternion.copy(placement.quaternion)
      if (placement.mirror) synthase.group.scale.set(-1, 1, 1)
      this.set.add(synthase.group)
      return synthase
    }
    this.hero = place(createSynthase(heroGeometries, heroMaterials, !low), HERO)
    this.partner = place(createSynthase(heroGeometries, contextMaterials, !low), PARTNER)
    this.row = ROW.slice(0, low ? 2 : ROW.length).map((placement) => place(createSynthase(rowGeometries, contextMaterials, false), placement))

    // Phosphate carrier and ANT (the carrier family of chapter 2's CACT), sliced by the cut.
    const placeOnFlank = <M extends ProteinModel>(model: M, placement: FlankPlacement, scale = 1): M => {
      model.group.position.copy(placement.position)
      model.group.quaternion.copy(placement.quaternion)
      model.group.scale.setScalar(scale)
      this.set.add(model.group)
      return model
    }
    this.carriers = {
      phosphate: placeOnFlank(createCact(factory), PHOSPHATE_CARRIER),
      ant: placeOnFlank(createCact(factory), ANT, 1.08),
    }

    // Respiratory complexes up the flanks (context until the circuit).
    const builders: Record<ComplexKey, (material: MaterialFactory) => ProteinModel> = {
      complexI: createComplexI,
      complexIII: createComplexIII,
      complexIV: createComplexIV,
    }
    this.complexes = FLANK_COMPLEXES.map(({ key, placement }) => {
      const model = placeOnFlank(builders[key](factory), placement)
      model.group.traverse((child) => (child.castShadow = false))
      return { key, model }
    })

    // Molecules: glossy « actors ».
    const glossy = (options: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial => {
      const material = new THREE.MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.8, ...options })
      patchMaterial(material, media)
      return material
    }
    const materials: MoleculeMaterials = {
      beads: glossy({ vertexColors: true }),
      phosphate: glossy({ color: MOLECULE_COLORS.phosphate, flatShading: true, roughness: 0.28 }),
      link: glossy({ color: '#8e97a3', roughness: 0.45, clearcoat: 0 }),
      adenosineCharged: glossy({ color: MOLECULE_COLORS.atp }),
      adenosineDischarged: glossy({ color: MOLECULE_COLORS.adp }),
    }
    this.nucleotides = Array.from({ length: 5 }, () => createNucleotide(materials))
    const phosphates = Array.from({ length: 4 }, (_, i) => {
      const group = new THREE.Group()
      group.add(createPhosphate(materials, 0.4 + i))
      return group
    })
    const protonMaterial = glossy({ color: MOLECULE_COLORS.proton, roughness: 0.26 })
    const protonGeometry = new THREE.IcosahedronGeometry(0.34, 2)
    const symport = new THREE.Mesh(protonGeometry, protonMaterial)
    symport.castShadow = true
    this.set.add(...this.nucleotides.map((n) => n.group), ...phosphates, symport)

    const carrierSites = { phosphate: this.carriers.phosphate.sites, ant: this.carriers.ant.sites }
    this.story = new SynthaseStory({ nucleotides: this.nucleotides.map((n) => n.group), phosphates, symportProton: symport, carrierSites })
    this.cameraTrack = createCameraTrack(this.story)

    // H⁺: the ring's (one bead per H⁺ of the detailed turn), the crowd, the circuit lanes.
    this.ringBeads = new THREE.InstancedMesh(protonGeometry, protonMaterial, RING_PROTONS)
    this.ringBeads.frustumCulled = false
    this.ringBeads.castShadow = true
    this.crowdSlots = [...lumenSlots(low ? 120 : 200), ...matrixSlots(low ? 12 : 22)]
    this.crowd = new THREE.InstancedMesh(protonGeometry, protonMaterial, this.crowdSlots.length)
    this.crowd.frustumCulled = false
    this.lanes = circuitLanes()
    const laneCount = this.lanes.reduce((sum, lane) => sum + lane.beads, 0)
    this.laneBeads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 2), protonMaterial, laneCount)
    this.laneBeads.frustumCulled = false
    this.laneBeads.visible = false
    this.set.add(this.ringBeads, this.crowd, this.laneBeads)

    // « + » on the lumen face, « − » on the matrix face of the tip (symbols, not particles).
    this.chargeMaterial = new THREE.MeshStandardMaterial({ color: '#ece7dc', roughness: 0.6, transparent: true, opacity: 0, depthWrite: false })
    const plus = (() => {
      const a = new THREE.BoxGeometry(0.75, 0.17, 0.06).toNonIndexed()
      const b = new THREE.BoxGeometry(0.17, 0.75, 0.06).toNonIndexed()
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)], 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute([...(a.getAttribute('normal').array as Float32Array), ...(b.getAttribute('normal').array as Float32Array)], 3))
      a.dispose()
      b.dispose()
      return g
    })()
    const minus = new THREE.BoxGeometry(0.75, 0.17, 0.06)
    const sMin = MEMBRANE_DETAIL.sMin
    const sMax = MEMBRANE_DETAIL.sMax
    const marks: number[] = []
    for (let s = sMin + 1.5; s < sMax - 1.5; s += 3.2) marks.push(s)
    for (const [geometry, side] of [
      [plus, -1],
      [minus, 1],
    ] as const) {
      const mesh = new THREE.InstancedMesh(geometry, this.chargeMaterial, marks.length)
      marks.forEach((s, i) => {
        const sample = PROFILE.at(s)
        // The profile's normal points into the lumen: −1 = lumen face, +1 = matrix face.
        const p = sample.p.clone().addScaledVector(sample.n, -side * (BILAYER_HALF + 0.8))
        mesh.setMatrixAt(i, this.matrix.makeTranslation(p.x, p.y, CUT_Z - 0.25))
      })
      mesh.visible = false
      this.charges.push(mesh)
      this.set.add(mesh)
    }

    this.buildTags(phosphates, symport)
  }

  private buildTags(phosphates: THREE.Object3D[], symport: THREE.Object3D): void {
    const tags = text.tags
    const story = this.story!
    const [, n2, n3, , n5] = this.nucleotides
    // Our H⁺ out in the matrix, and the first one out at notch 1.
    const heroMarker = new THREE.Object3D()
    const firstOut = new THREE.Object3D()
    this.set.add(heroMarker, firstOut)
    this.heroMarker = heroMarker
    this.firstOutMarker = firstOut
    this.labels.addTag(firstOut, v(0, 0.55, 0), [[(NOTCHES[0][0] + NOTCHES[0][1]) / 2 + 1.6, S.f1, tags.toMatrix]])
    this.labels.addTag(heroMarker, v(0, 0.55, 0), [[HERO_OUT, S.phosphate, tags.sameProton]])
    // F1 at the end of its step: the three β, three states.
    const betaTag = (i: number, label: string): void => {
      const anchor = new THREE.Object3D()
      anchor.position.copy(heroWorld(betaPocket(i, 1.6)))
      this.set.add(anchor)
      this.labels.addTag(anchor, v(0, 0.4, 0), [[ATP_RELEASE[0] + 1.0, S.turn, label]])
    }
    // β2 is named by the reticle (« ATP formé · β serrée »); β3, at the back, by the narration
    // only (a tag would float over the head).
    betaTag(0, tags.open)
    this.labels.addTag(n2.group, v(0.4, 0.55, 0), [
      [ATP_RELEASE[1] + 1.0, S.phosphate, tags.ourAtp],
      [T.atpOut[1], S.cost, tags.atpToCytosol],
    ])
    this.labels.addTag(n3.group, v(0.4, 0.55, 0), [[T.pairIntoBeta3[0], T.pairIntoBeta3[1] + 1.5, tags.adpPi]])
    this.labels.addTag(n5.group, v(0.4, 0.55, 0), [[T.adpOut[1], S.cost, tags.adpToF1]])
    this.labels.addTag(phosphates[3], v(0, 0.45, 0), [
      [T.piIn[0], T.piOut[0], tags.pi],
      [T.piOut[1], S.ant, tags.piToF1],
    ])
    this.labels.addTag(symport, v(0, 0.5, 0), [[T.piIn[0], S.ant, tags.hero]])
    // The proton-motive force: which side has more H⁺.
    const lumenCaption = new THREE.Object3D()
    lumenCaption.position.set(0, TIP_RADIUS * 0.15, CUT_Z - 0.4)
    const matrixCaption = new THREE.Object3D()
    matrixCaption.position.set(-TIP_RADIUS - 6.5, -TIP_RADIUS - 2, CUT_Z - 0.4)
    this.set.add(lumenCaption, matrixCaption)
    this.labels.addTag(lumenCaption, v(0, 0, 0), [[T.charges[1], S.proton, tags.lowerPh]])
    this.labels.addTag(matrixCaption, v(0, 0, 0), [[T.charges[1], S.proton, tags.higherPh]])
    // The price of an ATP: on Fo, and over the two carriers.
    const foAnchor = new THREE.Object3D()
    foAnchor.position.copy(heroWorld(SYNTHASE_SITES.foLabel))
    const transportAnchor = new THREE.Object3D()
    transportAnchor.position.copy(PHOSPHATE_CARRIER.position).lerp(ANT.position, 0.5).add(v(4.5, 0, 0.5))
    const oxphosAnchor = new THREE.Object3D()
    oxphosAnchor.position.copy(HERO.f1).add(v(6, -4, 0))
    this.set.add(foAnchor, transportAnchor, oxphosAnchor)
    this.labels.addTag(foAnchor, v(0, 0, 0), [[T.costFo, S.circuit, fill(tags.foCost)]], true)
    this.labels.addTag(transportAnchor, v(0, 0, 0), [[T.costTransport, S.circuit, fill(tags.transportCost)]])
    this.labels.addTag(oxphosAnchor, v(0, 0, 0), [[T.counterRamp[0], DURATION, fill(tags.oxphos)]])
    void story
    this.labels.createReticle(this.root)

    // Layer names during the establishing shot (scene 1's numbered badges).
    const layers: { key: keyof typeof text.compartments; badge: string; swatch: string; position: THREE.Vector3 }[] = [
      { key: 'lumen', badge: '2', swatch: COMPARTMENT_COLORS.intermembraneSpace.fluid, position: v(-3.6, 1.5, CUT_Z + 0.5) },
      { key: 'innerMembrane', badge: '3', swatch: COMPARTMENT_COLORS.innerMembrane.section, position: v(-TIP_RADIUS - 0.4, 6, CUT_Z + 0.5) },
      { key: 'matrix', badge: '4', swatch: COMPARTMENT_COLORS.matrix.section, position: v(-TIP_RADIUS - 12, -4, CUT_Z + 0.5) },
    ]
    for (const layer of layers) this.labels.addLayerLabel(this.set, text.compartments[layer.key], layer.position, { text: layer.badge, swatch: layer.swatch })
  }

  private heroMarker: THREE.Object3D | null = null
  private firstOutMarker: THREE.Object3D | null = null

  private buildCallouts(context: SceneContext): void {
    const local = (point: THREE.Vector3): THREE.Vector3 => heroWorld(point)
    const anchorOf = (point: THREE.Vector3): THREE.Object3D => {
      const anchor = new THREE.Object3D()
      anchor.position.copy(point)
      this.set.add(anchor)
      return anchor
    }
    const leftComplex = (key: ComplexKey): ProteinModel => this.complexes.find((c) => c.key === key && c.model.group.position.x < 0)!.model
    const order: { key: CalloutKey; label: string; tooltip: keyof typeof text.tooltips; direction: 'up' | 'down' | 'left' | 'right'; parent: THREE.Object3D; anchor: THREE.Vector3 }[] = [
      { key: 'synthase', label: text.proteins.synthase, tooltip: 'dimersCristae', direction: 'right', parent: anchorOf(local(v(6.0, -13.5, 2.5))), anchor: v(0, 0, 0) },
      { key: 'fo', label: text.proteins.fo, tooltip: 'cRing', direction: 'left', parent: anchorOf(local(SYNTHASE_SITES.foLabel)), anchor: v(0, 0, 0) },
      { key: 'f1', label: text.proteins.f1, tooltip: 'atpSynthase', direction: 'left', parent: anchorOf(local(SYNTHASE_SITES.f1Label)), anchor: v(0, 0, 0) },
      { key: 'rotor', label: text.proteins.rotor, tooltip: 'cRing', direction: 'left', parent: anchorOf(local(SYNTHASE_SITES.rotorLabel)), anchor: v(0, 0, 0) },
      { key: 'stator', label: text.proteins.stator, tooltip: 'atpSynthase', direction: 'right', parent: anchorOf(local(SYNTHASE_SITES.statorLabel)), anchor: v(0, 0, 0) },
      { key: 'phosphateCarrier', label: text.proteins.phosphateCarrier, tooltip: 'phosphateCarrier', direction: 'right', parent: this.carriers!.phosphate.group, anchor: v(-0.6, -BILAYER_HALF - 1.2, 0.4) },
      { key: 'ant', label: text.proteins.ant, tooltip: 'ant', direction: 'right', parent: this.carriers!.ant.group, anchor: v(0.6, -BILAYER_HALF - 1.2, 0.4) },
      { key: 'complexI', label: text.proteins.complexI, tooltip: 'protonCircuit', direction: 'left', parent: leftComplex('complexI').group, anchor: v(8.6, -BILAYER_HALF - 9, 0.4) },
      { key: 'complexIII', label: text.proteins.complexIII, tooltip: 'protonCircuit', direction: 'left', parent: leftComplex('complexIII').group, anchor: v(0, -BILAYER_HALF - 5, 0.4) },
      { key: 'complexIV', label: text.proteins.complexIV, tooltip: 'protonCircuit', direction: 'left', parent: leftComplex('complexIV').group, anchor: v(0, -BILAYER_HALF - 2.5, 0.4) },
    ]
    for (const callout of order) {
      this.labels.addCallout(callout.key, {
        parent: callout.parent,
        anchor: callout.anchor,
        label: callout.label,
        direction: callout.direction,
        onOpen: () => {
          this.player?.pause()
          context.tooltipLayer.show(fill(text.tooltipTitles[callout.tooltip]), fill(text.tooltips[callout.tooltip]))
        },
        onFocus: (focused) => {
          this.hovered = focused ? callout.key : null
          this.forceDirty = true
        },
      })
    }
  }

  // -------------------------------------------------------------------- time

  private applyTime(t: number): void {
    const story = this.story
    const context = this.context
    if (!story || !context || !this.stage) return
    this.lastTime = t

    for (const actor of story.actors) actor.apply(t)
    this.nucleotides.forEach((n, i) => n.setForm(formOf(i, t)))
    this.carriers?.phosphate.setOpenTo(phosphateCarrierOpen(t))
    this.carriers?.ant.setOpenTo(antOpen(t))
    this.hero?.setRotor(heroAngle(t))
    this.partner?.setRotor(otherAngle(0, t))
    this.row.forEach((synthase, i) => synthase.setRotor(otherAngle(i + 1, t)))

    // The ring's H⁺, the crowd (thermal jiggle, still during the arrêts), the circuit lanes.
    if (this.ringBeads) {
      for (let k = 0; k < RING_PROTONS; k++) this.ringBeads.setMatrixAt(k, this.matrix.makeTranslation(ringProtonWorld(k, t)))
      this.ringBeads.instanceMatrix.needsUpdate = true
    }
    if (this.crowd) {
      const live = 0.18 * (1 - ramp(t, T.flux[0], T.flux[1])) * this.livelinessAt(t)
      this.crowdSlots.forEach((slot, i) => {
        this.scratch.set(Math.sin(1.3 * t + i * 1.7), Math.sin(1.1 * t + i * 2.3), Math.sin(0.9 * t + i * 0.7)).multiplyScalar(live).add(slot)
        this.crowd!.setMatrixAt(i, this.matrix.makeTranslation(this.scratch))
      })
      this.crowd.instanceMatrix.needsUpdate = true
    }
    if (this.laneBeads) {
      let index = 0
      let any = false
      for (const lane of this.lanes) {
        for (let b = 0; b < lane.beads; b++) {
          const p = lanePoint(lane, b, t)
          if (p) any = true
          this.laneBeads.setMatrixAt(index++, p ? this.matrix.makeTranslation(p) : this.matrix.makeScale(0, 0, 0))
        }
      }
      this.laneBeads.visible = any
      this.laneBeads.instanceMatrix.needsUpdate = true
    }
    this.heroMarker?.position.copy(ringProtonWorld(0, t))
    this.firstOutMarker?.position.copy(ringProtonWorld(8, t))

    // Charges of the proton-motive force.
    const charges = ramp(t, T.charges[0], T.charges[1]) * (1 - ramp(t, S.proton, S.proton + 1.0))
    if (this.chargeMaterial) this.chargeMaterial.opacity = 0.85 * charges
    for (const mesh of this.charges) mesh.visible = charges > 0

    const free = t >= T.glide[1]
    if (this.offsets) this.offsets.enabled = free
    this.cameraTrack?.(t, this.shot)
    this.shot.distance *= this.band?.fit ?? 1
    placeCamera(this.camera, this.shot, free ? this.offsets : null, 6500, this.band?.lift ?? 0)

    this.applyFocus(t)
    this.applyLabels(t)
    this.applyHud(t, context)
  }

  private livelinessAt(t: number): number {
    // The arrêts are still (the same envelope as the actors).
    return this.story ? (this.story.actors[0] ? 1 - this.calmAt(t) : 1) : 1
  }

  private calmAt(t: number): number {
    const begins = Object.values(STEP_STARTS)
    const ends = [...begins.slice(1), DURATION]
    let calm = 0
    begins.forEach((_, i) => {
      const end = ends[i]
      calm = Math.max(calm, ramp(t, end - 3.5 - 0.8, end - 3.5) * (1 - ramp(t, end, end + 0.8)))
    })
    return calm
  }

  private applyFocus(t: number): void {
    const dims = this.heroDims
    const hovered = this.hovered
    const machine = t >= S.machine && t < S.gradient
    if (dims) {
      const foLit = t >= T.fo[0] && t < T.f1Lit[0]
      const f1Lit = t >= T.f1Lit[0] && t < T.rotorLit[0]
      const rotorLit = t >= T.rotorLit[0] && t < T.rotorLit[1] - 1.0
      let rotor = 0
      let stator = 0
      let head = 0
      if (machine) {
        if (foLit) head = 0.7
        if (f1Lit) stator = 0.7
        if (rotorLit) {
          stator = 0.7
          head = 0.7
        }
      }
      if (hovered === 'rotor') [rotor, stator, head] = [0, 0.85, 0.85]
      else if (hovered === 'stator') [rotor, stator, head] = [0.85, 0, 0]
      else if (hovered === 'fo') head = 0.85
      else if (hovered === 'f1') [rotor, stator] = [0.85, 0.85]
      else if (hovered && hovered !== 'synthase') [rotor, stator, head] = [0.85, 0.85, 0.85]
      dims.rotor.value = rotor
      dims.stator.value = stator
      dims.head.value = head
    }
    // The partner and the rows recede once the hero is introduced.
    this.contextDim.value = hovered && hovered !== 'synthase' ? 0.85 : t >= S.machine && t < S.circuit ? 0.6 : 0
    const carrierLit = (key: 'phosphateCarrier' | 'ant'): boolean => inWindow(key, t) || hovered === key
    if (this.carriers) {
      this.carriers.phosphate.dim.value = carrierLit('phosphateCarrier') || (t >= S.cost && t < S.circuit) ? 0 : 0.6
      this.carriers.ant.dim.value = carrierLit('ant') || (t >= S.cost && t < S.circuit) ? 0 : 0.6
    }
    const circuit = ramp(t, T.complexesLit[0], T.complexesLit[1])
    for (const { key, model } of this.complexes) model.dim.value = hovered === key ? 0 : hovered ? 0.85 : 0.75 * (1 - circuit)
  }

  private applyLabels(t: number): void {
    const story = this.story!
    for (const key of this.labels.calloutKeys) this.labels.showCallout(key, inWindow(key, t) || this.hovered === key)
    this.labels.showLayerLabels(t >= T.glide[0] && t < S.machine)
    this.labels.applyTags(t, true)

    const subject = reticleAt(t)
    const names = text.names
    let position: THREE.Vector3 | null = null
    let name = ''
    if (subject.kind === 'hero') {
      position = ringProtonWorld(0, t)
      const where = heroCompartment(t)
      name = where === 'ring' ? names.heroRing : where === 'matrix' ? names.heroMatrix : where === 'innerMembrane' ? names.heroChannel : names.hero
      this.reticleSize = 1.6
    } else if (subject.kind === 'nucleotide') {
      position = story.nucleotides[subject.index].poseAt(t).position.clone().add(v(0.6, 0, 0))
      name = names[subject.label]
      this.reticleSize = 2.4
    } else if (subject.kind === 'phosphate') {
      position = story.phosphates[subject.index].poseAt(t).position.clone()
      name = names.pi
      this.reticleSize = 1.6
    }
    this.labels.setReticle(position ?? new THREE.Vector3(), name, position !== null)
  }

  private applyHud(t: number, context: SceneContext): void {
    context.journey.set(countersAt(t))
    const notches = NOTCHES.filter(([, end]) => t >= end).length
    const dial = ramp(t, T.dial, T.dial + 0.8) * (1 - ramp(t, S.gradient, S.gradient + 0.6)) + ramp(t, S.proton, S.proton + 0.8) * (1 - ramp(t, S.phosphate, S.phosphate + 0.6))
    this.gauge?.set({
      theta: notchAngle(t),
      notches,
      atp: atpReleasedAt(t),
      dial: Math.min(1, dial),
      pmf: ramp(t, T.pmf[0], T.pmf[1]) * (1 - ramp(t, S.proton, S.proton + 0.6)),
    })
    if (this.costCard) {
      this.costCard.element.hidden = !(t >= T.costTotal - 0.4 && t < S.circuit)
      const times = [T.costFo, T.costTransport, T.costTotal, T.costPo]
      this.costCard.lines.forEach((line, i) => (line.hidden = t < times[i]))
    }

    const tier = t >= T.tier && t < T.cristaTier ? 'molecular' : 'crista'
    if (tier !== this.lastTier) {
      const crossing = tier === 'molecular' ? Math.abs(t - T.tier) < 0.5 : Math.abs(t - T.cristaTier) < 0.5
      context.scaleBar.setTier(tier, crossing ? (tier === 'molecular' ? VALUES.zoomIn : 1 / VALUES.zoomOut) : undefined)
      this.lastTier = tier
    }
    const stepIndex = stepIndexAt(STEP_STARTS, t)
    if (stepIndex !== this.labelledStep) {
      this.labelledStep = stepIndex
      context.renderer.domElement.setAttribute('role', 'img')
      context.renderer.domElement.setAttribute('aria-label', `${text.title} — ${fill(text.steps[stepIndex].title)}`)
    }
    if (this.recenterButton) this.recenterButton.hidden = !(this.offsets?.isOffset ?? false)
    if (this.recapCard) this.recapCard.hidden = t < T.recap
    const introducing = t >= T.glide[0] && t < S.gradient
    if (introducing !== this.legendHighlighted) {
      this.legendHighlighted = introducing
      context.legend.setHighlighted(introducing ? ['proton', 'adp', 'atp', 'pyrophosphate'] : [])
    }
  }

  // --------------------------------------------------------------------- lab

  private async enterLab(context: SceneContext): Promise<void> {
    const lanes = labLanes()
    this.labLanes = lanes
    const count = [...lanes.pump, ...lanes.back, ...lanes.leak].reduce((sum, lane) => sum + lane.beads, 0)
    this.labBeads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 2), this.ringBeads!.material, count)
    this.labBeads.frustumCulled = false
    this.set.add(this.labBeads)

    // « bloqué » marks on what an inhibitor blocks.
    const inhibitorOf: Record<ComplexKey, Inhibitor> = { complexI: 'rotenone', complexIII: 'antimycinA', complexIV: 'cyanide' }
    const marks: { key: Inhibitor; at: THREE.Vector3 }[] = [
      ...this.complexes.filter(({ model }) => model.group.position.x < 0).map(({ key, model }) => ({ key: inhibitorOf[key], at: model.group.position.clone().add(v(6.5, 3.5, 1)) })),
      { key: 'oligomycin', at: HERO.fo.clone().add(v(5, -3, 2)) },
    ]
    for (const mark of marks) {
      const tag = document.createElement('span')
      tag.className = 'molecule-tag lab-blocked'
      tag.textContent = `✕ ${content.lab.blocked}`
      const object = new CSS2DObject(tag)
      object.position.copy(mark.at)
      object.visible = false
      this.set.add(object)
      this.labBlocked.push({ tag, object, key: mark.key })
    }

    this.labPanel = new LabPanel(context.container, context.tooltipLayer, (state, inhibitors) => {
      this.lab = state
      this.labInhibitors = new Set(inhibitors)
      this.forceDirty = true
    })
    context.journey.set(countersAt(DURATION))
    context.scaleBar.setTier('crista')
    this.lastTier = 'crista'
    // The story's final state (everything in place), then the lab's own flows.
    this.applyTime(DURATION)
    this.labels.showLayerLabels(false)
    this.labels.setReticle(new THREE.Vector3(), '', false)
    this.labels.applyTags(-1, false)
    this.costCard?.element.remove()
    this.costCard = null
    this.recapCard?.remove()
    this.recapCard = null
    if (this.laneBeads) this.laneBeads.visible = false
    this.applyLab(0)
    await context.renderer.compileAsync(this.threeScene, this.camera)
  }

  private updateLab(deltaSeconds: number): void {
    const offsetsMoving = this.offsets?.update(deltaSeconds) ?? false
    const moving = this.lab.electronFlux > 0.01 || this.lab.atpProduction > 0.01 || this.lab.protonLeak > 0.3
    if (moving || offsetsMoving || this.forceDirty) this.applyLab(deltaSeconds)
  }

  private applyLab(dt: number): void {
    const lab = this.lab
    const step = Math.min(dt, 0.1)
    // H⁺ out through the complexes ∝ electron flux; back through the synthases ∝ ATP made; leak.
    this.labPhases.pump += step * 0.35 * lab.electronFlux
    this.labPhases.back += step * 0.35 * lab.atpProduction
    this.labPhases.leak += step * 0.35 * Math.min(3, lab.protonLeak)
    this.labPhases.rotor += step * 240 * lab.atpProduction
    const theta = this.labPhases.rotor
    this.hero?.setRotor(theta)
    this.partner?.setRotor(theta + 17)
    this.row.forEach((synthase, i) => synthase.setRotor(theta + 31 * (i + 1)))

    if (this.labBeads && this.labLanes) {
      let index = 0
      const place = (lanes: Lane[], phase: number, amount: number): void => {
        for (const lane of lanes) {
          for (let b = 0; b < lane.beads; b++) {
            const shown = amount > 0.02 && (b + 0.5) / lane.beads <= Math.min(1, amount)
            const u = ((((b + 0.5) / lane.beads + phase) % 1) + 1) % 1
            this.labBeads!.setMatrixAt(index++, shown ? this.matrix.makeTranslation(lane.curve.getPointAt(u)) : this.matrix.makeScale(0, 0, 0))
          }
        }
      }
      place(this.labLanes.pump, this.labPhases.pump, lab.electronFlux)
      place(this.labLanes.back, this.labPhases.back, lab.atpProduction)
      place(this.labLanes.leak, this.labPhases.leak, lab.protonLeak > 0.3 ? Math.min(1, lab.protonLeak / 3) : 0)
      this.labBeads.instanceMatrix.needsUpdate = true
    }
    // The lumen's H⁺ crowd follows the gradient.
    if (this.crowd) {
      const shown = Math.round(this.crowdSlots.length * THREE.MathUtils.clamp(lab.protonGradient / 1.4, 0, 1))
      this.crowdSlots.forEach((slot, i) => this.crowd!.setMatrixAt(i, i < shown ? this.matrix.makeTranslation(slot) : this.matrix.makeScale(0, 0, 0)))
      this.crowd.instanceMatrix.needsUpdate = true
    }
    if (this.ringBeads) this.ringBeads.visible = false
    const blocked = (key: ComplexKey): boolean =>
      (key === 'complexI' && this.labInhibitors.has('rotenone')) ||
      (key === 'complexIII' && this.labInhibitors.has('antimycinA')) ||
      (key === 'complexIV' && this.labInhibitors.has('cyanide'))
    for (const { key, model } of this.complexes) model.dim.value = this.hovered === key ? 0 : blocked(key) ? 0.9 : 0
    const synthaseOff = this.labInhibitors.has('oligomycin') ? 0.75 : 0
    if (this.heroDims) {
      this.heroDims.rotor.value = synthaseOff
      this.heroDims.stator.value = synthaseOff
      this.heroDims.head.value = synthaseOff
    }
    this.contextDim.value = synthaseOff
    if (this.carriers) {
      this.carriers.phosphate.dim.value = 0
      this.carriers.ant.dim.value = 0
    }
    for (const mark of this.labBlocked) mark.object.visible = this.labInhibitors.has(mark.key)
    for (const key of this.labels.calloutKeys) {
      const always = key === 'synthase' || key === 'complexI' || key === 'complexIII' || key === 'complexIV' || key === 'phosphateCarrier'
      this.labels.showCallout(key, always || this.hovered === key)
    }

    if (this.offsets) this.offsets.enabled = true
    this.shot.target.set(0, 28, CUT_Z - 10)
    this.shot.distance = 290 * (this.band?.fit ?? 1)
    this.shot.azimuth = 0.25
    this.shot.elevation = 0.1
    placeCamera(this.camera, this.shot, this.offsets, 6500, this.band?.lift ?? 0)
    if (this.recenterButton) this.recenterButton.hidden = !(this.offsets?.isOffset ?? false)
    this.forceDirty = true
  }

  private signature(): number {
    let s = 0
    const c = this.camera
    s += c.position.x * 1.37 + c.position.y * 2.41 + c.position.z * 3.29
    s += c.quaternion.x * 5.3 + c.quaternion.y * 6.1 + c.quaternion.z * 7.7 + c.quaternion.w * 8.9
    if (this.story) {
      for (const [index, actor] of this.story.actors.entries()) {
        const o = actor.object
        const w = index + 2.17
        s += w * (o.position.x * 1.3 + o.position.y * 1.7 + o.position.z * 2.3)
        s += w * (o.quaternion.x * 3.1 + o.quaternion.y * 3.7 + o.quaternion.z * 4.1 + o.quaternion.w * 4.3)
        s += o.visible ? w * 5.3 : 0
      }
    }
    const t = this.lastTime
    s += heroAngle(t) * 0.731 + otherAngle(1, t) * 0.517
    for (let k = 0; k < RING_PROTONS; k++) {
      const p = ringProtonWorld(k, t)
      s += (k + 1.3) * (p.x * 0.37 + p.y * 0.41 + p.z * 0.43)
    }
    this.nucleotides.forEach((_, i) => (s += formOf(i, t) === 'atp' ? 29.3 * (i + 1) : 0))
    s += phosphateCarrierOpen(t) * 31.7 + antOpen(t) * 37.1 + this.calmAt(t) * 41.9 + (this.chargeMaterial?.opacity ?? 0) * 43.3
    if (this.heroDims) s += this.heroDims.rotor.value * 7.1 + this.heroDims.stator.value * 7.9 + this.heroDims.head.value * 8.3
    s += this.contextDim.value * 9.7
    for (const { model } of this.complexes) s += model.dim.value * 11.3
    if (this.carriers) s += this.carriers.phosphate.dim.value * 13.1 + this.carriers.ant.dim.value * 13.7
    s += this.camera.projectionMatrix.elements[0] * 19.1 + this.camera.projectionMatrix.elements[5] * 23.3
    return s
  }
}
