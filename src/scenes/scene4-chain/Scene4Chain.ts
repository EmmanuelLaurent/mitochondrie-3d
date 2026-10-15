import * as THREE from 'three'
import type { NarrationControl, Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { COMPARTMENT_COLORS, MOLECULE_COLORS } from '../../config/palette'
import { BETA_OXIDATION, computePalmitateBalance, electricShareOfPmf, ELECTRON_TRANSPORT_PUMPING, PROTON_MOTIVE_FORCE, zoomFactor } from '../../config/science.config'
import { content } from '../../i18n/content'
import { createFill, formatNumber } from '../../i18n/fill'
import { StepPlayer } from '../../ui/player/StepPlayer'
import { Quiz } from '../../ui/quiz/Quiz'
import type { MitochondrionSdf } from '../scene1-exterior/mitochondrionSdf'
import { createEtf, createEtfQo } from '../scene3-betaox/proteins'
import { OrbitOffsets, placeCamera, shot, type CameraShot } from '../shared/molecular/camera'
import { EASE, ramp, stepIndexAt } from '../shared/molecular/choreography'
import { BILAYER_HALF, CUT_Z, v } from '../shared/molecular/frame'
import { FramingBand } from '../shared/molecular/framing'
import { createRecapCard, DepthGauge } from '../shared/molecular/hud'
import { LabelSet } from '../shared/molecular/labels'
import { patchMaterial } from '../shared/molecular/media'
import { createMembrane } from '../shared/molecular/membrane'
import { createElectron, createOxygen, createPill, createUbiquinone, createWater, type ColorMaterial, type Pill, type Ubiquinone } from '../shared/molecular/molecules'
import { createStepTimeline, playerSteps } from '../shared/molecular/narration'
import { createNanoOrganelle, NM_PER_UNIT } from '../shared/molecular/organelle'
import { findCristaWall } from '../shared/molecular/organelleField'
import type { MaterialFactory, ProteinModel } from '../shared/molecular/proteinKit'
import { MolecularStage } from '../shared/molecular/stage'
import { ChainGauge } from './hud'
import { chainMedia, IMM_Y, LUMEN, MEMBRANE_HOLES, PATCH, PROTEINS, WALL_Y, type ProteinKey } from './layout'
import { createAcad, createComplexI, createComplexII, createComplexIII, createComplexIV, createCytochromeC } from './proteins'
import {
  ChainStory,
  compartmentAt,
  countersAt,
  createCameraTrack,
  DURATION,
  ESTABLISHING,
  FLUX_POOL,
  fluxAmount,
  PUMP_EVENTS,
  reoxidizedAt,
  STEP_STARTS,
  subjectAt,
  T,
  type Compartment,
} from './story'

const text = content.scenes.scene4
const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const balance = computePalmitateBalance()
const PUMP = ELECTRON_TRANSPORT_PUMPING
const PMF = PROTON_MOTIVE_FORCE

/** Every number of the texts comes from the science config. */
const VALUES = {
  pumpI: PUMP.complexI,
  pumpIII: PUMP.complexIII,
  pumpIV: PUMP.complexIV,
  perNADH: PUMP.perNADH,
  perFADH2: PUMP.perFADH2,
  nadh: balance.nadh,
  fadh2: balance.fadh2,
  protons: balance.protonsPumped,
  pairs: balance.electronPairs,
  oxygen: balance.o2Consumed,
  water: balance.water,
  atp: balance.gtp - BETA_OXIDATION.activationCostATP,
  psiMin: PMF.deltaPsiMv.min,
  psiMax: PMF.deltaPsiMv.max,
  dphMin: formatNumber(PMF.deltaPh.min, 2),
  dphMax: formatNumber(PMF.deltaPh.max, 2),
  mvPerPh: formatNumber(PMF.mvPerPhUnit),
  pumpII: PUMP.complexII,
  pumpEtfQo: PUMP.etfQO,
  zoomIn: zoomFactor('crista', 'molecular'),
  zoomOut: zoomFactor('crista', 'molecular'),
} as const
const fill = createFill(VALUES)

// The ×10 dive lands on the wall of a crista on the organelle's matrix cut face: the
// organelle is turned so that this wall lies like the molecular set's membrane (lumen up).
const WALL = findCristaWall(0.1, 0.36)
const ORGANELLE_ROTATION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(WALL.normal.x, WALL.normal.y))
const LANDING = v(-6, IMM_Y, CUT_Z)
const ORGANELLE_POSITION = LANDING.clone().sub(WALL.point.clone().multiplyScalar(NM_PER_UNIT).applyQuaternion(ORGANELLE_ROTATION))
const CRISTA_SHOT: CameraShot = shot(LANDING.clone().add(v(30, 55, 0)), 760, 0.14, 0.16)

type CalloutKey = 'complexI' | 'complexIII' | 'etfQo' | 'complexII' | 'complexIV' | 'acad' | 'etf'
const S = STEP_STARTS

const WINDOWS: Record<CalloutKey, [number, number][]> = {
  complexI: [
    [T.callouts, S.complexI],
    [S.complexI, S.quinone],
  ],
  complexIII: [
    [T.callouts + 0.6, S.complexI],
    [S.quinone + 6.5, S.cytochromeC],
    [S.oxygen, S.oxygen + 5.0],
  ],
  etfQo: [
    [T.callouts + 1.2, S.complexI],
    [T.etfToQo[0], S.oxygen],
    [S.complexII + 8.0, S.flux],
  ],
  complexII: [
    [T.callouts + 1.8, S.complexI],
    [S.complexII, S.flux],
  ],
  complexIV: [
    [T.callouts + 2.4, S.complexI],
    [S.cytochromeC + 6.5, S.etf],
    [S.oxygen + 5.0, S.complexII],
  ],
  acad: [[S.etf, T.fadToEtf[1]]],
  etf: [[T.fadToEtf[0], S.oxygen]],
}
const atWork = (key: CalloutKey, t: number): boolean => WINDOWS[key].some(([a, b]) => t >= a && t < b)

export class Scene4Chain implements Scene {
  readonly id = 'scene4-chain'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 9000)
  readonly multisampling = 4

  private context: SceneContext | null = null
  private readonly root = new THREE.Group()
  private readonly molecularSet = new THREE.Group()
  private stage: MolecularStage | null = null
  private sdf: MitochondrionSdf | null = null
  private story: ChainStory | null = null
  private cameraTrack: ((t: number, out: CameraShot) => CameraShot) | null = null
  private readonly shot: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  private timeline: gsap.core.Timeline | null = null
  private player: StepPlayer | null = null
  private offsets: OrbitOffsets | null = null
  private band: FramingBand | null = null
  private proteins: Partial<Record<ProteinKey, ProteinModel>> = {}
  private cytcModels: ProteinModel[] = []
  private qs: Ubiquinone[] = []
  private nadhPill: Pill | null = null
  private fluxNadh: Pill[] = []
  private acadFad: Pill | null = null
  private complexIIFad: Pill | null = null
  private fluxOxygen: THREE.Object3D[] = []
  private water: THREE.Object3D[] = []
  private fluxWater: THREE.Object3D[] = []
  private beads: THREE.InstancedMesh | null = null
  private consumedBeads: THREE.InstancedMesh | null = null
  private charges: THREE.InstancedMesh[] = []
  private chargeMaterial: THREE.MeshStandardMaterial | null = null
  private wallDim: THREE.IUniform<number> | null = null
  private readonly labels = new LabelSet<CalloutKey>()
  private gauge: DepthGauge<Compartment> | null = null
  private chainGauge: ChainGauge | null = null
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
  private reticleSize = 2

  constructor() {
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

    this.stage = new MolecularStage(context.renderer, this.threeScene, this.root, chainMedia(), {
      halfSize: 52,
      near: 20,
      far: 340,
      target: v(-6, -2, 12),
    })
    this.stage.configureShadows(low)

    this.sdf = createNanoOrganelle(context.quality.current)
    this.sdf.setCut(1)
    this.sdf.mesh.quaternion.copy(ORGANELLE_ROTATION)
    this.sdf.mesh.position.copy(ORGANELLE_POSITION)
    this.root.add(this.sdf.mesh)

    this.buildMolecularSet(low)
    this.root.add(this.molecularSet)

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
    this.gauge = new DepthGauge<Compartment>(context.container, [
      { key: 'intermembraneSpace', label: text.compartments.lumen, badge: '2', color: COMPARTMENT_COLORS.intermembraneSpace.fluid, texture: 'fluid' },
      { key: 'innerMembrane', label: text.compartments.innerMembrane, badge: '3', color: COMPARTMENT_COLORS.innerMembrane.section, texture: 'bilayer' },
      { key: 'matrix', label: text.compartments.matrix, badge: '4', color: COMPARTMENT_COLORS.matrix.section, texture: 'granular' },
    ])
    this.chainGauge = new ChainGauge(context.container, { nadh: balance.nadh, fadh2: balance.fadh2, protons: balance.protonsPumped }, electricShareOfPmf())
    this.recapCard = createRecapCard({
      title: text.recap.title,
      keyMessage: fill(text.recap.keyMessage),
      net: fill(text.recap.net),
      bridge: fill(text.recap.bridge),
      nextChapter: content.chapters.items.scene5,
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
    context.container.append(this.recapCard)

    context.journey.set(countersAt(0, BETA_OXIDATION.activationCostATP))
    context.legend.setHighlighted([])
    context.sceneCaption.textContent = ''
    context.scaleBar.setTier('crista')
    this.lastTier = 'crista'

    this.unsubscribeQuality = context.quality.onChange((level) => {
      this.sdf?.setQuality(level)
      this.stage?.configureShadows(level === 'low')
      this.forceDirty = true
    })

    this.applyTime(0)
    this.molecularSet.visible = true
    await context.renderer.compileAsync(this.threeScene, this.camera)
    if (this.context !== context) return
    this.applyTime(0)

    this.timeline = createStepTimeline(STEP_STARTS, DURATION)
    const tooltips = text.tooltips as Record<string, string>
    const titles = text.tooltipTitles as Record<string, string>
    this.player = new StepPlayer(context.playerRoot, {
      timeline: this.timeline,
      steps: playerSteps(text.steps, fill, (key) => ({ title: titles[key], text: tooltips[key] }), (title, body) => context.tooltipLayer.show(title, body)),
      reducedMotion: prefersReducedMotion(),
      autoplay: context.visit.guided,
      onUpdate: () => {},
      onComplete: () => context.visit.onComplete(),
      onStepChange: () => context.tooltipLayer.clear(),
    })
  }

  update(deltaSeconds: number): void {
    if (!this.story) return
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
    this.sdf?.setFrame(frame, accumulating)
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
    this.chainGauge?.dispose()
    this.chainGauge = null
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
    this.root.clear()
    this.story = null
    this.sdf = null
  }

  // ------------------------------------------------------------------- build

  private buildMolecularSet(low: boolean): void {
    const media = this.stage!.media

    const inner = createMembrane({
      y: IMM_Y,
      headColor: COMPARTMENT_COLORS.innerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.innerMembrane.section,
      proteins: MEMBRANE_HOLES,
      seed: 4014,
      media,
      low,
      patch: PATCH,
    })
    // The opposite wall of the crista: context only (procedural planes, dimmed, no shadow).
    const wall = createMembrane({
      y: WALL_Y,
      headColor: COMPARTMENT_COLORS.innerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.innerMembrane.section,
      proteins: [],
      seed: 4024,
      media,
      low,
      patch: PATCH,
      planesOnly: true,
    })
    wall.dim.value = 0.6
    this.wallDim = wall.dim
    this.molecularSet.add(inner.group, wall.group)

    const proteinMaterial: MaterialFactory = (dim) => {
      const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.62,
        sheen: 0.25,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(0xffffff),
        envMapIntensity: 0.35,
      })
      patchMaterial(material, media, { dim })
      return material
    }
    this.proteins = {
      complexI: createComplexI(proteinMaterial),
      complexIII: createComplexIII(proteinMaterial),
      etfQo: createEtfQo(proteinMaterial),
      complexII: createComplexII(proteinMaterial),
      complexIV: createComplexIV(proteinMaterial),
      acad: createAcad(proteinMaterial),
      etf: createEtf(proteinMaterial),
    }
    for (const [key, model] of Object.entries(this.proteins) as [ProteinKey, ProteinModel][]) {
      model.group.position.copy(PROTEINS[key].position)
      this.molecularSet.add(model.group)
    }

    // Molecules and symbols: glossy « actors ».
    const cache = new Map<string, THREE.Material>()
    const glossy = (options: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial => {
      const material = new THREE.MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.8, ...options })
      patchMaterial(material, media)
      return material
    }
    const colorMaterial: ColorMaterial = (color, options = {}) => {
      const key = `${color}|${options.flat ? 1 : 0}|${options.roughness ?? ''}`
      let material = cache.get(key)
      if (!material) {
        material = glossy({ color, flatShading: options.flat ?? false, roughness: options.roughness ?? 0.34 })
        cache.set(key, material)
      }
      return material
    }

    // Electron relays and H⁺ channels, drawn on the section face of the complexes.
    const relayMaterial = new THREE.MeshStandardMaterial({ color: '#2a2f37', roughness: 0.45, metalness: 0.1 })
    patchMaterial(relayMaterial, media)
    const channelMaterial = new THREE.MeshStandardMaterial({ color: '#3a3f48', roughness: 0.8, transparent: true, opacity: 0.75 })
    patchMaterial(channelMaterial, media)
    const relay = new THREE.IcosahedronGeometry(0.3, 2)
    const relaySites: [ProteinKey, string[]][] = [
      ['complexI', ['relay0', 'relay1', 'relay2', 'relay3', 'relay4', 'relay5', 'relay6']],
      ['complexIII', ['rieskeLeft', 'rieskeRight', 'c1Left', 'c1Right']],
      ['complexII', ['relay0', 'relay1', 'relay2']],
      ['complexIV', ['cuA', 'hemeA', 'site']],
    ]
    for (const [key, names] of relaySites) {
      const model = this.proteins[key]!
      for (const name of names) {
        const stud = new THREE.Mesh(relay, relayMaterial)
        stud.position.copy(model.sites[name]).setZ(0.25)
        model.group.add(stud)
      }
    }
    const channel = new THREE.CapsuleGeometry(0.17, 2 * BILAYER_HALF + 0.4, 2, 8)
    const channelSites: [ProteinKey, string[]][] = [
      ['complexI', ['channel0', 'channel1', 'channel2', 'channel3']],
      ['complexIV', ['channel']],
    ]
    for (const [key, names] of channelSites) {
      const model = this.proteins[key]!
      for (const name of names) {
        const groove = new THREE.Mesh(channel, channelMaterial)
        groove.position.copy(model.sites[name]).setZ(0.2)
        model.group.add(groove)
      }
    }

    // Carriers.
    const hemeMaterial = new THREE.MeshStandardMaterial({ color: '#5a2a24', roughness: 0.45 })
    patchMaterial(hemeMaterial, media)
    this.cytcModels = [0, 1, 2, 3].map((i) => createCytochromeC(proteinMaterial, hemeMaterial, 851 + i))
    this.qs = Array.from({ length: 8 }, () => createUbiquinone(colorMaterial))
    this.nadhPill = createPill(colorMaterial, 'nad')
    this.fluxNadh = [0, 1, 2].map(() => createPill(colorMaterial, 'nad'))
    const electrons = Array.from({ length: 6 }, () => createElectron(colorMaterial))
    const oxygen = createOxygen(colorMaterial)
    const water = [createWater(colorMaterial), createWater(colorMaterial)]
    this.water = water
    // The chevrons are symbols: enlarged so they read at the chain's wide framings.
    for (const molecule of water) molecule.scale.setScalar(1.7)
    this.fluxOxygen = Array.from({ length: FLUX_POOL }, () => createOxygen(colorMaterial))
    this.fluxWater = Array.from({ length: FLUX_POOL * 2 }, () => {
      const molecule = createWater(colorMaterial)
      molecule.scale.setScalar(1.7)
      return molecule
    })
    this.molecularSet.add(
      ...this.cytcModels.map((model) => model.group),
      ...this.qs.map((q) => q.group),
      this.nadhPill.group,
      ...this.fluxNadh.map((pill) => pill.group),
      ...electrons,
      oxygen,
      ...water,
      ...this.fluxOxygen,
      ...this.fluxWater,
    )
    // The bound FAD of the β-oxidation ACAD and of complex II.
    this.acadFad = createPill(colorMaterial, 'fad')
    this.acadFad.group.position.copy(PROTEINS.acad.position).add(this.proteins.acad!.sites.fad)
    this.complexIIFad = createPill(colorMaterial, 'fad')
    this.complexIIFad.group.position.copy(PROTEINS.complexII.position).add(this.proteins.complexII!.sites.fad).setZ(CUT_Z + 0.2)
    this.molecularSet.add(this.acadFad.group, this.complexIIFad.group)

    // One bead per pumped H⁺ (and the few matrix H⁺ taken up, in the detailed steps).
    const protonGeometry = new THREE.IcosahedronGeometry(0.3, 2)
    const protonMaterial = colorMaterial(MOLECULE_COLORS.proton, { roughness: 0.28 })
    this.beads = new THREE.InstancedMesh(protonGeometry, protonMaterial, PUMP_EVENTS.length)
    this.beads.frustumCulled = false
    this.beads.castShadow = true
    this.consumedBeads = new THREE.InstancedMesh(protonGeometry, protonMaterial, 10)
    this.consumedBeads.frustumCulled = false
    this.molecularSet.add(this.beads, this.consumedBeads)

    // « + » on the lumen faces, « − » on the matrix faces (symbols, not particles).
    this.chargeMaterial = new THREE.MeshStandardMaterial({ color: '#ece7dc', roughness: 0.6, transparent: true, opacity: 0, depthWrite: false })
    const plus = new THREE.BufferGeometry()
    {
      const a = new THREE.BoxGeometry(0.75, 0.17, 0.06)
      const b = new THREE.BoxGeometry(0.17, 0.75, 0.06)
      const merged = [a, b].map((g) => g.toNonIndexed())
      const positions = merged.flatMap((g) => Array.from(g.getAttribute('position').array as Float32Array))
      const normals = merged.flatMap((g) => Array.from(g.getAttribute('normal').array as Float32Array))
      plus.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      plus.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      a.dispose()
      b.dispose()
      merged.forEach((g) => g.dispose())
    }
    const minus = new THREE.BoxGeometry(0.75, 0.17, 0.06)
    const xs = Array.from({ length: 27 }, (_, i) => -58 + i * 4)
    const rows: [THREE.BufferGeometry, number[]][] = [
      [plus, [LUMEN.bottom + 0.7, LUMEN.top - 0.7]],
      [minus, [IMM_Y - BILAYER_HALF - 0.7, WALL_Y + BILAYER_HALF + 0.7]],
    ]
    const m = new THREE.Matrix4()
    for (const [geometry, ys] of rows) {
      const mesh = new THREE.InstancedMesh(geometry, this.chargeMaterial, xs.length * ys.length)
      let i = 0
      for (const y of ys) for (const x of xs) mesh.setMatrixAt(i++, m.makeTranslation(x, y, CUT_Z - 0.25))
      mesh.visible = false
      this.charges.push(mesh)
      this.molecularSet.add(mesh)
    }

    const sites = Object.fromEntries(
      (Object.entries(this.proteins) as [ProteinKey, ProteinModel][]).map(([key, model]) => [key, model.sites]),
    ) as Record<ProteinKey, Record<string, THREE.Vector3>>
    this.story = new ChainStory({
      sites,
      nadh: this.nadhPill.group,
      qs: this.qs.map((q) => q.group),
      cytc: this.cytcModels.map((model) => model.group),
      etf: this.proteins.etf!.group,
      electrons,
      oxygen,
      water,
    })
    this.cameraTrack = createCameraTrack(this.story, CRISTA_SHOT, ESTABLISHING)

    // Name tags.
    const tags = text.tags
    const q0 = this.qs[0].group
    this.labels.addTag(q0, v(0, 0.75, 0), [[T.callouts + 3.0, S.complexI, tags.q]])
    this.labels.addTag(this.cytcModels[0].group, v(0, 1.7, 0.4), [
      [T.callouts + 3.6, S.complexI, tags.cytc],
      [T.toCytc[0][1], T.toSite1[0], tags.cytcLoaded],
    ])
    this.labels.addTag(this.cytcModels[1].group, v(0, 1.7, 0.4), [[T.toCytc[1][1], T.toSite2[0], tags.cytcLoaded]])
    // (While it is the followed molecule, the reticle names the NADH.)
    this.labels.addTag(this.nadhPill.group, v(0, 0.55, 0), [[T.nadhOxidized, S.quinone, tags.nad]])
    this.labels.addTag(this.acadFad.group, v(0, -0.55, 0.3), [
      [S.etf, T.fadToEtf[0], tags.fadh2],
      [T.fadToEtf[0], S.oxygen, tags.fad],
    ])
    this.labels.addTag(this.complexIIFad.group, v(0, -0.55, 0.3), [
      [S.complexII, T.fadOxidizedII, tags.fadh2],
      [T.fadOxidizedII, S.flux, tags.fad],
    ])
    this.labels.addTag(oxygen, v(0, -0.5, 0.3), [[T.oxygenIn[0], T.water, tags.oxygen]])
    // Above the narration panel, clear of the dimer.
    this.labels.addTag(this.proteins.complexIII!.group, v(-7.5, -BILAYER_HALF - 1.2, 0.6), [[S.complexIII + 5.0, S.cytochromeC, tags.qCycle]])
    this.labels.addTag(this.proteins.complexIV!.group, v(-2.6, -BILAYER_HALF - 4.6, 0.6), [[T.halfway, S.etf, tags.halfway]])
    this.labels.addTag(this.proteins.complexIV!.group, v(3.2, BILAYER_HALF + 5.4, 0.6), [[T.halfway, S.etf, fill(tags.perNadh)]])
    this.labels.addTag(this.proteins.etfQo!.group, v(0, -BILAYER_HALF - 6.2, 2.4), [
      [T.zeroPumpedEtf, S.oxygen, fill(tags.pumpedEtfQo)],
      [T.zeroPumpedII, S.flux, fill(tags.pumpedEtfQo)],
    ])
    this.labels.addTag(this.proteins.complexII!.group, v(2.6, -BILAYER_HALF - 6.6, 0.6), [
      [S.complexII + 0.5, T.zeroPumpedII, tags.succinate],
      [T.zeroPumpedII, S.flux, fill(tags.pumpedII)],
    ])
    this.labels.addTag(this.qs[3].group, v(0, -0.7, 0), [[T.qToIIIb[0], S.oxygen + 5.0, tags.samePath]])
    // Gradient captions: what the « + » and « − » rows mean.
    this.labels.addTag(this.molecularSet, v(-20, LUMEN.bottom + 3.4, CUT_Z - 0.5), [[T.captions, DURATION, tags.moreProtons]])
    this.labels.addTag(this.molecularSet, v(-20, IMM_Y - BILAYER_HALF - 2.4, CUT_Z - 0.5), [[T.captions, DURATION, tags.fewerProtons]])
    this.labels.createReticle(this.root)

    // Layer names (establishing shot) and the gradient captions.
    const layers: { label: string; y: number; badge?: { text: string; swatch: string } }[] = [
      { label: text.compartments.oppositeWall, y: WALL_Y },
      { label: text.compartments.lumen, y: (LUMEN.bottom + LUMEN.top) / 2, badge: { text: '2', swatch: COMPARTMENT_COLORS.intermembraneSpace.fluid } },
      { label: text.compartments.innerMembrane, y: IMM_Y, badge: { text: '3', swatch: COMPARTMENT_COLORS.innerMembrane.section } },
      { label: text.compartments.matrix, y: IMM_Y - 14, badge: { text: '4', swatch: COMPARTMENT_COLORS.matrix.section } },
    ]
    for (const layer of layers) this.labels.addLayerLabel(this.molecularSet, layer.label, v(-62, layer.y, CUT_Z + 0.5), layer.badge)
  }

  private buildCallouts(context: SceneContext): void {
    const order: { key: CalloutKey; tooltip: keyof typeof text.tooltips; direction: 'up' | 'down' | 'left' | 'right' }[] = [
      { key: 'complexI', tooltip: 'complexI', direction: 'up' },
      { key: 'complexIII', tooltip: 'complexIII', direction: 'down' },
      { key: 'etfQo', tooltip: 'etfRoute', direction: 'down' },
      { key: 'complexII', tooltip: 'complexII', direction: 'down' },
      { key: 'complexIV', tooltip: 'complexIV', direction: 'right' },
      { key: 'acad', tooltip: 'etfRoute', direction: 'left' },
      { key: 'etf', tooltip: 'etfRoute', direction: 'right' },
    ]
    for (const { key, tooltip, direction } of order) {
      const model = this.proteins[key]!
      this.labels.addCallout(key, {
        parent: model.group,
        anchor: model.labelAnchor,
        label: text.proteins[key],
        direction,
        onOpen: () => {
          this.player?.pause()
          context.tooltipLayer.show(fill(text.tooltipTitles[tooltip]), fill(text.tooltips[tooltip]))
        },
        onFocus: (focused) => {
          this.hovered = focused ? key : null
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

    // Carrier states (reduced or oxidized).
    const reducedQ = [
      t >= T.qReducedI && t < T.qOxidizedIII,
      false,
      false,
      t >= T.qReducedEtfQo && t < T.qOxidizedIIIb,
      t >= T.qReducedII,
      false,
      false,
      false,
    ]
    this.nadhPill?.setReduced(t < T.nadhOxidized)
    this.acadFad?.setReduced(t < T.fadToEtf[0])
    this.complexIIFad?.setReduced(t < T.fadOxidizedII)

    // The accelerated flux: carriers cycle (pure periodic motions), blended in and out.
    const amount = fluxAmount(t)
    const p = new THREE.Vector3()
    this.qs.forEach((q, i) => {
      let reduced = reducedQ[i]
      if (amount > 0) {
        reduced = story.flux.q(i, t, p)
        q.group.position.lerp(p, amount)
      }
      q.setReduced(reduced)
    })
    this.cytcModels.forEach((model, i) => {
      if (amount > 0) {
        story.flux.cytc(i, t, p)
        model.group.position.lerp(p, amount)
      }
    })
    if (amount > 0) {
      story.flux.etf(t, p)
      this.proteins.etf?.group.position.lerp(p, amount)
    }
    this.fluxNadh.forEach((pill, i) => {
      const state = amount > 0 ? story.flux.nadh(i, t, pill.group.position) : null
      pill.group.visible = state !== null && amount > 0.05
      if (state) pill.setReduced(state.reduced)
    })
    this.fluxOxygen.forEach((o2, slot) => (o2.visible = amount > 0 && story.flux.oxygen(slot, t, o2.position)))
    this.fluxWater.forEach((h2o, i) => (h2o.visible = amount > 0 && story.flux.water(i >> 1, i & 1, t, h2o.position)))

    // One bead per pumped H⁺.
    if (this.beads) {
      const m = new THREE.Matrix4()
      let count = 0
      for (let i = 0; i < PUMP_EVENTS.length; i++) {
        const position = story.beads.positionAt(i, t, p)
        if (!position) continue
        this.beads.setMatrixAt(count++, m.makeTranslation(position.x, position.y, position.z))
      }
      this.beads.count = count
      this.beads.instanceMatrix.needsUpdate = true
    }
    if (this.consumedBeads) {
      const m = new THREE.Matrix4()
      let count = 0
      for (const proton of story.consumed) {
        if (t < proton.window[0] - 0.3 || t >= proton.until) continue
        p.lerpVectors(proton.from, proton.to, ramp(t, proton.window[0], proton.window[1], EASE.inOut))
        this.consumedBeads.setMatrixAt(count++, m.makeTranslation(p.x, p.y, p.z))
      }
      this.consumedBeads.count = count
      this.consumedBeads.instanceMatrix.needsUpdate = true
    }

    // Charges of the proton-motive force.
    const charges = ramp(t, T.charges[0], T.charges[1])
    if (this.chargeMaterial) this.chargeMaterial.opacity = 0.85 * charges
    for (const mesh of this.charges) mesh.visible = charges > 0

    // ×10: the organelle dissolves into the molecular set at the crista wall.
    const dissolve = ramp(t, T.dissolve[0], T.dissolve[1], EASE.inOut)
    // ÷ 10 at the end: the set dissolves back into the organelle (where it came from).
    const outro = ramp(t, T.cristaDissolve[0], T.cristaDissolve[1], EASE.inOut)
    this.sdf?.setOpacity(t >= S.gradient ? outro : 1 - dissolve)
    this.molecularSet.visible = t >= T.dissolve[0] - 0.2 && outro < 1
    this.stage.media.uMediaAmount.value = dissolve * (1 - outro)

    const free = t >= T.glide[1]
    if (this.offsets) this.offsets.enabled = free
    this.cameraTrack?.(t, this.shot)
    // Framed for the free band from the first frame, as chapter 3 ended.
    this.shot.distance *= this.band?.fit ?? 1
    placeCamera(this.camera, this.shot, free ? this.offsets : null, 6500, this.band?.lift ?? 0)

    this.applyFocus(t)
    this.applyLabels(t)
    this.applyHud(t, context)
  }

  private applyFocus(t: number): void {
    const inSteps = t >= S.complexI && t < S.flux
    const working = new Set<ProteinKey>()
    for (const key of Object.keys(WINDOWS) as CalloutKey[]) if (atWork(key, t)) working.add(key)
    for (const [key, model] of Object.entries(this.proteins) as [ProteinKey, ProteinModel][]) {
      if (this.hovered) model.dim.value = key === this.hovered ? 0 : 0.85
      else model.dim.value = inSteps && !working.has(key) ? 0.7 : 0
    }
    if (this.wallDim) this.wallDim.value = this.hovered ? 0.85 : 0.6
  }

  private applyLabels(t: number): void {
    const story = this.story!
    // Names inside the set disappear with it at the ÷ 10.
    const molecular = t < T.cristaDissolve[0]
    for (const key of this.labels.calloutKeys) this.labels.showCallout(key, molecular && (atWork(key, t) || this.hovered === key))
    this.labels.showLayerLabels(t >= T.layerLabels && t < S.overview + 1)
    this.labels.applyTags(t, t >= T.dissolve[1] && molecular)

    const subject = subjectAt(t)
    const position = new THREE.Vector3()
    const tags = text.tags
    let name = ''
    let visible = true
    const mid = (a: number, b: number): THREE.Vector3 =>
      story.electrons[a].poseAt(t, undefined, false).position.clone().add(story.electrons[b].poseAt(t, undefined, false).position).multiplyScalar(0.5)
    switch (subject) {
      case 'nadh':
        position.copy(story.nadh.poseAt(t, undefined, false).position)
        name = tags.nadh
        this.reticleSize = 2.2
        break
      case 'pair1':
        position.copy(mid(0, 1))
        name = t >= T.qReducedI && t < T.toCytc[0][0] ? tags.qh2 : tags.electrons
        this.reticleSize = 2.2
        break
      case 'acadFadh2':
        position.copy(this.acadFad!.group.position)
        name = tags.fadh2
        this.reticleSize = 2.4
        break
      case 'pair2':
        position.copy(mid(2, 3))
        name = t >= T.qReducedEtfQo && t < T.toCytcB[0] ? tags.qh2 : tags.electrons
        this.reticleSize = 2.2
        break
      case 'water':
        position.copy(this.water[0].position).add(this.water[1].position).multiplyScalar(0.5)
        name = tags.water
        this.reticleSize = 3
        break
      case 'fadh2II':
        position.copy(this.complexIIFad!.group.position)
        name = tags.fadh2
        this.reticleSize = 2.4
        break
      case 'pair3':
        position.copy(mid(4, 5))
        name = t >= T.qReducedII ? tags.qh2 : tags.electrons
        this.reticleSize = 2.2
        break
      default:
        visible = false
    }
    this.labels.setReticle(position, name, visible && t >= T.dissolve[1])
    if (this.gauge) this.gauge.set(compartmentAt(position.y))
  }

  private applyHud(t: number, context: SceneContext): void {
    context.journey.set(countersAt(t, BETA_OXIDATION.activationCostATP))
    const fluxing = t >= S.flux
    if (this.gauge) this.gauge.element.hidden = t < S.complexI || fluxing
    if (this.chainGauge) {
      this.chainGauge.element.hidden = !fluxing
      const done = reoxidizedAt(t)
      this.chainGauge.set({ nadh: done.nadh, fadh2: done.fadh2, protons: countersAt(t, BETA_OXIDATION.activationCostATP).protonsPumped, pmf: ramp(t, T.pmfSplit[0], T.pmfSplit[1]) })
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
    const introducing = t >= S.overview && t < S.complexI
    if (introducing !== this.legendHighlighted) {
      this.legendHighlighted = introducing
      context.legend.setHighlighted(introducing ? ['electron', 'proton', 'oxygen', 'water', 'nadh', 'fadh2'] : [])
    }
  }

  private signature(): number {
    let s = 0
    const c = this.camera
    s += c.position.x * 1.37 + c.position.y * 2.41 + c.position.z * 3.29
    s += c.quaternion.x * 5.3 + c.quaternion.y * 6.1 + c.quaternion.z * 7.7 + c.quaternion.w * 8.9
    const objects: THREE.Object3D[] = [
      ...(this.story?.actors.map((actor) => actor.object) ?? []),
      ...this.fluxNadh.map((pill) => pill.group),
      ...this.fluxOxygen,
      ...this.fluxWater,
    ]
    objects.forEach((o, index) => {
      const w = index + 2.17
      s += w * (o.position.x * 1.3 + o.position.y * 1.7 + o.position.z * 2.3)
      s += w * (o.quaternion.x * 3.1 + o.quaternion.y * 3.7 + o.quaternion.z * 4.1 + o.quaternion.w * 4.3)
      s += o.visible ? w * 5.3 : 0
    })
    const t = this.lastTime
    s += countersAt(t, BETA_OXIDATION.activationCostATP).protonsPumped * 29.3 + (this.beads?.count ?? 0) * 31.1
    // Beads in motion: their positions change while the counter does not.
    const moving = PUMP_EVENTS.reduce((sum, event) => sum + (t > event.time - 0.8 && t < event.time + 1.2 ? event.time : 0), 0)
    s += ramp(t, 0, DURATION) * moving * 0.37
    s += (this.consumedBeads?.count ?? 0) * 37.7 + (this.chargeMaterial?.opacity ?? 0) * 41.3
    this.qs.forEach((q, i) => (s += (q.group.children[0].visible ? 1 : 0) * (43.1 + i)))
    for (const model of Object.values(this.proteins)) s += (model?.dim.value ?? 0) * 7.1
    s += (this.stage?.media.uMediaAmount.value ?? 0) * 17.3
    s += this.camera.projectionMatrix.elements[0] * 19.1 + this.camera.projectionMatrix.elements[5] * 23.3
    return s
  }
}
