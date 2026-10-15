import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NarrationControl, Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { COMPARTMENT_COLORS, MOLECULE_COLORS } from '../../config/palette'
import { BETA_OXIDATION, computePalmitateBalance, KREBS_EQUATION, KREBS_PER_ACETYL_COA, SOLUBLE_ENZYMES_FROM_CARBONS, zoomFactor } from '../../config/science.config'
import { content } from '../../i18n/content'
import { createFill, fillTemplate } from '../../i18n/fill'
import { StepPlayer } from '../../ui/player/StepPlayer'
import { Quiz } from '../../ui/quiz/Quiz'
import type { MitochondrionSdf } from '../scene1-exterior/mitochondrionSdf'
import { createCpt2 } from '../scene2-shuttle/proteins'
import { OrbitOffsets, placeCamera, type CameraShot } from '../shared/molecular/camera'
import { EASE, ramp, stepIndexAt } from '../shared/molecular/choreography'
import { MATRIX_REST } from '../shared/molecular/continuity'
import { CUT_Z, frameMedia, v } from '../shared/molecular/frame'
import { FramingBand } from '../shared/molecular/framing'
import { createRecapCard } from '../shared/molecular/hud'
import { LabelSet } from '../shared/molecular/labels'
import { patchMaterial } from '../shared/molecular/media'
import { createMembrane } from '../shared/molecular/membrane'
import {
  createAcetylGroup,
  createAcylChain,
  createCarbonDioxide,
  createCoA,
  createElectron,
  createGtp,
  createPill,
  createWater,
  type AcetylGroup,
  type AcylChain,
  type ColorMaterial,
  type MoleculeMaterials,
  type Pill,
} from '../shared/molecular/molecules'
import { createStepTimeline, playerSteps } from '../shared/molecular/narration'
import { createNanoOrganelle, MATRIX_VIEWPOINT, organellePosition } from '../shared/molecular/organelle'
import type { MaterialFactory, ProteinModel } from '../shared/molecular/proteinKit'
import { MolecularStage } from '../shared/molecular/stage'
import { createBoxLabel, LynenGauge } from './hud'
import { KREBS_BOX, MATRIX_FACE, PROTEINS, SET, TFP_POCKETS, type ProteinKey } from './layout'
import { createComplexII, createEtf, createEtfQo, createKrebsBox, createSolubleEnzymes, createTfp, createVlcad, type KrebsBox } from './proteins'
import {
  acetylMorphAt,
  BetaOxStory,
  carbonsAt,
  chainMiddle,
  coaBond,
  complexIIReduced,
  countersAt,
  createCameraTrack,
  DURATION,
  enteredAt,
  hasAcetyl,
  KREBS,
  lynenAt,
  markAt,
  nadReduced,
  reticleAt,
  STEP_STARTS,
  T,
  TURNS,
  vlcadFadReduced,
} from './story'

const text = content.scenes.scene3
const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const balance = computePalmitateBalance()
const BETA_FADH2 = BETA_OXIDATION.cyclesForPalmitate * BETA_OXIDATION.fadh2PerCycle
const BETA_NADH = BETA_OXIDATION.cyclesForPalmitate * BETA_OXIDATION.nadhPerCycle

/** Every number of the texts comes from the science config. */
const VALUES = {
  carbons: BETA_OXIDATION.chainCarbons,
  carbonsAfterFirst: BETA_OXIDATION.chainCarbons - 2,
  carbonsAfterSecond: BETA_OXIDATION.chainCarbons - 4,
  turns: BETA_OXIDATION.cyclesForPalmitate,
  acetylCoA: balance.acetylCoA,
  betaFadh2: BETA_FADH2,
  betaNadh: BETA_NADH,
  fadh2PerCycle: BETA_OXIDATION.fadh2PerCycle,
  nadhPerCycle: BETA_OXIDATION.nadhPerCycle,
  solubleFrom: SOLUBLE_ENZYMES_FROM_CARBONS,
  kNadh: KREBS_PER_ACETYL_COA.nadh,
  kFadh2: KREBS_PER_ACETYL_COA.fadh2,
  kGtp: KREBS_PER_ACETYL_COA.gtp,
  kCo2: KREBS_PER_ACETYL_COA.co2,
  kWater: KREBS_EQUATION.waterIn,
  kProtons: KREBS_EQUATION.protonsOut,
  nadh: balance.nadh,
  fadh2: balance.fadh2,
  co2: balance.co2,
  gtp: balance.gtp,
  krebsFadh2: balance.acetylCoA * KREBS_PER_ACETYL_COA.fadh2,
  lastCycleAcetylCoA: BETA_OXIDATION.lastCycleAcetylCoA,
  // The two detailed turns, then the fast ones at the soluble enzymes, then the last turn.
  lastFastTurn: BETA_OXIDATION.cyclesForPalmitate - 1,
  fastSequence: Array.from({ length: (SOLUBLE_ENZYMES_FROM_CARBONS - 4) / 2 + 1 }, (_, i) => `C${SOLUBLE_ENZYMES_FROM_CARBONS - 2 * i}`).join(' → '),
  // The first acetyl-CoA is shown in detail in the Krebs step; the others follow in the bilan.
  otherAcetylCoA: balance.acetylCoA - 1,
  zoomIn: zoomFactor('crista', 'molecular'),
  zoomOut: zoomFactor('crista', 'molecular'),
} as const
const fill = createFill(VALUES)

// The organelle for the tier changes: at the start our palmitoyl-CoA sits on its matrix
// cut face (where chapter 2 ended); at the end, the Krebs box does.
const INTRO_POSITION = organellePosition(MATRIX_VIEWPOINT, MATRIX_REST.position)
const OUTRO_POSITION = organellePosition(MATRIX_VIEWPOINT, KREBS_BOX.center)

type CalloutKey = 'vlcad' | 'etf' | 'etfQo' | 'tfpHydratase' | 'tfpDehydrogenase' | 'tfpThiolase' | 'soluble' | 'complexII'

const S = STEP_STARTS

/** When each protein is at work: lit and named (windows follow the steps). */
const WINDOWS: Record<CalloutKey, [number, number][]> = {
  vlcad: [
    [S.dehydrogenation, S.hydration],
    [S.turn2, T.toPocket2b[0]],
  ],
  etf: [
    [S.electrons, S.hydration],
    [T.etfToVlcad2[0], T.etfAway2[0]],
  ],
  etfQo: [
    [T.etfToQo[0], S.hydration],
    [T.etfToQo2[0], T.etfAway2[0]],
  ],
  tfpHydratase: [
    [S.hydration, S.oxidation],
    [T.toPocket2b[0], T.toPocket3b[0]],
  ],
  tfpDehydrogenase: [
    [S.oxidation, S.thiolysis],
    [T.toPocket3b[0], T.toPocket4b[0]],
  ],
  tfpThiolase: [
    [S.thiolysis, S.turn2],
    [T.toPocket4b[0], S.fastTurns],
  ],
  soluble: [[S.fastTurns, S.krebs]],
  complexII: [[S.krebs, DURATION]],
}

const atWork = (key: CalloutKey, t: number): boolean => WINDOWS[key].some(([a, b]) => t >= a && t < b)

/** Which callouts light which protein. */
const PROTEIN_OF: Record<CalloutKey, ProteinKey> = {
  vlcad: 'vlcad',
  etf: 'etf',
  etfQo: 'etfQo',
  tfpHydratase: 'tfp',
  tfpDehydrogenase: 'tfp',
  tfpThiolase: 'tfp',
  soluble: 'soluble',
  complexII: 'complexII',
}

export class Scene3BetaOx implements Scene {
  readonly id = 'scene3-betaox'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 9000)
  readonly multisampling = 4

  private context: SceneContext | null = null
  private readonly root = new THREE.Group()
  private readonly molecularSet = new THREE.Group()
  private stage: MolecularStage | null = null
  private sdf: MitochondrionSdf | null = null
  private story: BetaOxStory | null = null
  private cameraTrack: ((t: number, out: CameraShot) => CameraShot) | null = null
  private readonly shot: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  private timeline: gsap.core.Timeline | null = null
  private player: StepPlayer | null = null
  private offsets: OrbitOffsets | null = null
  private band: FramingBand | null = null
  private proteins: Partial<Record<ProteinKey, ProteinModel>> = {}
  private box: KrebsBox | null = null
  private chain: AcylChain | null = null
  private acetyls: AcetylGroup[] = []
  private vlcadFad: Pill | null = null
  private complexIIFad: Pill | null = null
  private nads: Pill[] = []
  private readonly labels = new LabelSet<CalloutKey>()
  private pocketBadges: CSS2DObject[] = []
  private boxLabel: { object: CSS2DObject; count: HTMLElement } | null = null
  private gauge: LynenGauge | null = null
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
  private reticleSize = 3.1

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

    this.stage = new MolecularStage(context.renderer, this.threeScene, this.root, frameMedia(), {
      halfSize: 46,
      near: 20,
      far: 340,
      target: v(38, -29, 13),
    })
    this.stage.configureShadows(low)

    // The organelle of the tier changes (crista ↔ molecular).
    this.sdf = createNanoOrganelle(context.quality.current)
    this.sdf.setCut(1)
    this.sdf.mesh.position.copy(INTRO_POSITION)
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
    this.gauge = new LynenGauge(context.container, VALUES)
    this.recapCard = createRecapCard({
      title: text.recap.title,
      keyMessage: fill(text.recap.keyMessage),
      net: fill(text.recap.net),
      bridge: fill(text.recap.bridge),
      nextChapter: content.chapters.items.scene4,
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

    // Chapter 3 starts where chapter 2 ended: the activation paid, nothing else yet.
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
    this.recapCard?.remove()
    this.recapCard = null
    this.recenterButton?.remove()
    this.recenterButton = null
    this.quiz?.close()
    this.quiz = null
    this.labels.dispose()
    for (const badge of this.pocketBadges) badge.element.remove()
    this.pocketBadges = []
    this.boxLabel?.object.element.remove()
    this.boxLabel = null
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
      y: SET.immY,
      headColor: COMPARTMENT_COLORS.innerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.innerMembrane.section,
      proteins: [PROTEINS.cpt2, PROTEINS.vlcad, PROTEINS.etfQo, PROTEINS.tfp, PROTEINS.complexII],
      seed: 3014,
      media,
      low,
      patch: SET.patch,
    })
    // The outer membrane above, for continuity (rarely in view): procedural planes only.
    const outer = createMembrane({
      y: SET.ommY,
      headColor: COMPARTMENT_COLORS.outerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.outerMembrane.section,
      proteins: [],
      seed: 3026,
      media,
      low,
      patch: SET.patch,
      planesOnly: true,
    })
    outer.dim.value = 0.5
    this.molecularSet.add(inner.group, outer.group)

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
      cpt2: createCpt2(proteinMaterial),
      vlcad: createVlcad(proteinMaterial),
      etfQo: createEtfQo(proteinMaterial),
      etf: createEtf(proteinMaterial),
      tfp: createTfp(proteinMaterial),
      soluble: createSolubleEnzymes(proteinMaterial),
      complexII: createComplexII(proteinMaterial),
    }
    for (const [key, model] of Object.entries(this.proteins) as [ProteinKey, ProteinModel][]) {
      model.group.position.copy(PROTEINS[key].position)
      this.molecularSet.add(model.group)
    }
    this.box = createKrebsBox(media)
    this.molecularSet.add(this.box.group)

    // Molecules: glossy « actors » against matte proteins and membranes.
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
    const materials: MoleculeMaterials = {
      beads: glossy({ vertexColors: true }),
      phosphate: glossy({ color: MOLECULE_COLORS.phosphate, flatShading: true, roughness: 0.28 }),
      link: glossy({ color: '#8e97a3', roughness: 0.45, clearcoat: 0 }),
      adenosineCharged: colorMaterial(MOLECULE_COLORS.atp),
      adenosineDischarged: colorMaterial(MOLECULE_COLORS.amp),
    }

    const chain = createAcylChain(colorMaterial, BETA_OXIDATION.chainCarbons)
    this.chain = chain
    const coas = Array.from({ length: 8 }, () => createCoA(materials))
    this.acetyls = coas.map((coa) => {
      const acetyl = createAcetylGroup(colorMaterial)
      coa.add(acetyl.group)
      return acetyl
    })
    const etfModel = this.proteins.etf!
    const electrons = Array.from({ length: 4 }, () => createElectron(colorMaterial))
    this.nads = [createPill(colorMaterial, 'nad'), createPill(colorMaterial, 'nad')]
    const water = createWater(colorMaterial)
    const co2 = [createCarbonDioxide(colorMaterial), createCarbonDioxide(colorMaterial)]
    const productNadh = [0, 1, 2].map(() => {
      const pill = createPill(colorMaterial, 'nad')
      pill.setReduced(true)
      return pill
    })
    const gtp = createGtp(colorMaterial, materials.phosphate, materials.link)
    this.molecularSet.add(chain.group, ...coas, ...electrons, ...this.nads.map((nad) => nad.group), water, ...co2, ...productNadh.map((pill) => pill.group), gtp)

    // The two bound FAD: in VLCAD (β-oxidation) and in complex II (Krebs), in section.
    this.vlcadFad = createPill(colorMaterial, 'fad')
    this.vlcadFad.group.position.copy(PROTEINS.vlcad.position).add(this.proteins.vlcad!.sites.fad)
    this.complexIIFad = createPill(colorMaterial, 'fad')
    this.complexIIFad.group.position.copy(PROTEINS.complexII.position).add(this.proteins.complexII!.sites.fad)
    this.molecularSet.add(this.vlcadFad.group, this.complexIIFad.group)

    const sites = Object.fromEntries(
      (Object.entries(this.proteins) as [ProteinKey, ProteinModel][]).map(([key, model]) => [key, model.sites]),
    ) as Record<ProteinKey, Record<string, THREE.Vector3>>
    this.story = new BetaOxStory({
      chain: chain.group,
      bondPoint: chain.bondPoint,
      coas,
      etf: etfModel.group,
      electrons,
      nads: this.nads.map((nad) => nad.group),
      water,
      products: { coa: coas[0], co2, nadh: productNadh.map((pill) => pill.group), gtp },
      sites,
    })
    this.cameraTrack = createCameraTrack(this.story)

    // Name tags (shown when the molecule matters).
    const tags = text.tags
    const [first] = TURNS
    const krebs = KREBS[0]
    this.labels.addTag(chain.group, v(-0.22, 0.42, 0.1), [[first.dehydrogenation + 0.4, S.electrons, tags.doubleBond]])
    this.labels.addTag(chain.group, v(-0.3, 0.62, 0.1), [
      [first.hydration, S.oxidation, tags.hydroxyl],
      [first.oxidation, S.thiolysis, tags.keto],
    ])
    this.labels.addTag(
      this.vlcadFad.group,
      v(0, -0.45, 0.3),
      [
        [first.dehydrogenation, T.fadEmptied, tags.fadh2],
        [T.fadEmptied, S.hydration, tags.fad],
      ],
      true,
    )
    this.labels.addTag(electrons[0], v(0.2, 0.45, 0), [
      [T.toEtf[1], T.intoQo[0], tags.electrons],
      [T.intoMembrane[1], S.hydration, tags.electronsToQ],
    ])
    this.labels.addTag(water, v(0, 0.35, 0), [[T.waterIn[0], first.hydration, tags.water]])
    this.labels.addTag(this.nads[0].group, v(0, 0.45, 0), [
      [T.nadIn[0], first.oxidation, tags.nad],
      [first.oxidation, S.thiolysis, tags.nadh],
    ])
    this.labels.addTag(coas[1], v(1.9, 0.55, 0), [[T.coaIn[0], coaBond(1)[1], tags.coa]])
    this.labels.addTag(coas[0], v(0.3, 0.6, 0), [
      [first.acetylFormed, S.turn2, tags.acetylCoA],
      [T.coaReleased, T.productsAway[0], tags.coaReleased],
    ])
    co2.forEach((molecule, i) => this.labels.addTag(molecule, v(0, 0.4, 0), [[krebs.nadh[i], T.productsAway[0], tags.co2]]))
    productNadh.forEach((pill, i) => this.labels.addTag(pill.group, v(0, 0.5, 0), [[krebs.nadh[i] + 0.15, T.productsAway[0], tags.krebsNadh]]))
    this.labels.addTag(gtp, v(0.6, 0.6, 0), [[krebs.gtp, T.productsAway[0], tags.gtp]])
    this.labels.addTag(this.complexIIFad.group, v(0, -0.5, 0.3), [[krebs.fadh2, T.cristaDissolve[0], tags.fadh2ComplexII]], true)
    this.labels.createReticle(this.root)

    // Layer names during the establishing shot.
    const layers: { key: keyof typeof text.compartments; badge: string; swatch: string; y: number }[] = [
      { key: 'intermembraneSpace', badge: '2', swatch: COMPARTMENT_COLORS.intermembraneSpace.fluid, y: SET.immY + 5.2 },
      { key: 'innerMembrane', badge: '3', swatch: COMPARTMENT_COLORS.innerMembrane.section, y: SET.immY },
      { key: 'matrix', badge: '4', swatch: COMPARTMENT_COLORS.matrix.section, y: MATRIX_FACE - 14 },
    ]
    for (const layer of layers) {
      this.labels.addLayerLabel(this.molecularSet, text.compartments[layer.key], v(4, layer.y, CUT_Z + 0.5), { text: layer.badge, swatch: layer.swatch })
    }

    // The TFP's pockets, numbered like the reactions they host (2, 3, 4).
    ;(['hydratase', 'dehydrogenase', 'thiolase'] as const).forEach((pocket, i) => {
      const element = document.createElement('span')
      element.className = 'pocket-badge'
      element.textContent = String(i + 2)
      element.setAttribute('aria-hidden', 'true')
      const object = new CSS2DObject(element)
      // Under every other label (the reticle's name, the tags).
      object.renderOrder = -1
      object.position.copy(TFP_POCKETS[pocket]).add(v(0, 1.7, 0.4))
      this.molecularSet.add(object)
      this.pocketBadges.push(object)
    })

    // The Krebs box's own label (it is a symbol: always named, with « Simplification »).
    const boxLabel = createBoxLabel(() => {
      this.player?.pause()
      this.context?.tooltipLayer.show(fill(text.tooltipTitles.krebsBox), fill(text.tooltips.krebsBox))
    })
    const boxObject = new CSS2DObject(boxLabel.element)
    // Inside the front face's top-left corner: clear of complex II above and of the
    // products lined up under the front slot.
    boxObject.position.set(-KREBS_BOX.size.x / 2 + 0.6, KREBS_BOX.size.y / 2 - 0.6, KREBS_BOX.size.z / 2 + 0.05)
    boxObject.center.set(0, 0)
    this.box.group.add(boxObject)
    this.boxLabel = { object: boxObject, count: boxLabel.count }
  }

  private buildCallouts(context: SceneContext): void {
    const order: { key: CalloutKey; label: string; tooltip: keyof typeof text.tooltips; direction: 'up' | 'down' | 'left' | 'right'; anchor: THREE.Vector3; parent: THREE.Object3D }[] = [
      { key: 'vlcad', label: text.proteins.vlcad, tooltip: 'boundFad', direction: 'left', anchor: this.proteins.vlcad!.labelAnchor, parent: this.proteins.vlcad!.group },
      { key: 'etf', label: text.proteins.etf, tooltip: 'etf', direction: 'left', anchor: this.proteins.etf!.labelAnchor, parent: this.proteins.etf!.group },
      { key: 'etfQo', label: text.proteins.etfQo, tooltip: 'etf', direction: 'right', anchor: this.proteins.etfQo!.labelAnchor, parent: this.proteins.etfQo!.group },
      ...(['tfpHydratase', 'tfpDehydrogenase', 'tfpThiolase'] as const).map((key, i) => ({
        key,
        label: text.proteins[key],
        tooltip: 'trifunctional' as const,
        direction: 'down' as const,
        // Under each pocket, clear of the water and the NAD⁺ waiting below pockets 2 and 3
        // and of the NADH parked between pockets 3 and 4.
        anchor: (['hydratase', 'dehydrogenase', 'thiolase'] as const).map((pocket) => this.proteins.tfp!.sites[pocket])[i].clone().add(v(i < 2 ? -1.2 : 0.6, -1.7, 0)),
        parent: this.proteins.tfp!.group,
      })),
      { key: 'soluble', label: text.proteins.soluble, tooltip: 'soluble', direction: 'right', anchor: this.proteins.soluble!.labelAnchor, parent: this.proteins.soluble!.group },
      { key: 'complexII', label: text.proteins.complexII, tooltip: 'complexII', direction: 'left', anchor: this.proteins.complexII!.labelAnchor, parent: this.proteins.complexII!.group },
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
    this.chain?.setState(carbonsAt(t), markAt(t))
    this.acetyls.forEach((acetyl, k) => {
      acetyl.group.visible = hasAcetyl(k, t)
      acetyl.setMorph(acetylMorphAt(k, t))
    })
    this.vlcadFad?.setReduced(vlcadFadReduced(t))
    this.complexIIFad?.setReduced(complexIIReduced(t))
    this.nads.forEach((nad, n) => nad.setReduced(nadReduced(n, t)))

    // Tier changes: the organelle dissolves into the set (×10), and back (÷10).
    const intro = ramp(t, T.dissolve[0], T.dissolve[1], EASE.inOut)
    const outro = ramp(t, T.cristaDissolve[0], T.cristaDissolve[1], EASE.inOut)
    const ending = t >= S.bilan
    if (this.sdf) {
      this.sdf.mesh.position.copy(ending ? OUTRO_POSITION : INTRO_POSITION)
      this.sdf.setOpacity(ending ? outro : 1 - intro)
    }
    this.molecularSet.visible = t >= T.dissolve[0] - 0.2 && outro < 1
    this.stage.media.uMediaAmount.value = intro

    const free = t >= T.glide[1]
    if (this.offsets) this.offsets.enabled = free
    this.cameraTrack?.(t, this.shot)
    // Framed for the free band from the first frame, as chapter 2 ended.
    this.shot.distance *= this.band?.fit ?? 1
    placeCamera(this.camera, this.shot, free ? this.offsets : null, 6500, this.band?.lift ?? 0)

    this.applyFocus(t)
    this.applyLabels(t)
    this.applyHud(t, context)
  }

  private applyFocus(t: number): void {
    const inSteps = t >= S.dehydrogenation && t < T.cristaDissolve[0]
    const working = new Set<ProteinKey>()
    for (const key of Object.keys(WINDOWS) as CalloutKey[]) if (atWork(key, t)) working.add(PROTEIN_OF[key])
    const hoveredProtein = this.hovered ? PROTEIN_OF[this.hovered] : null
    for (const [key, model] of Object.entries(this.proteins) as [ProteinKey, ProteinModel][]) {
      if (hoveredProtein) model.dim.value = key === hoveredProtein ? 0 : 0.85
      else model.dim.value = key === 'cpt2' ? 0.75 : inSteps && !working.has(key) ? 0.7 : 0
    }
    if (this.box) this.box.dim.value = hoveredProtein ? 0.85 : t < S.krebs ? 0.55 : 0
  }

  private applyLabels(t: number): void {
    const story = this.story!
    const molecular = t < T.cristaDissolve[0]
    for (const key of this.labels.calloutKeys) this.labels.showCallout(key, molecular && (atWork(key, t) || this.hovered === key))
    this.labels.showLayerLabels(t >= T.glide[0] && t < S.dehydrogenation)
    this.labels.applyTags(t, molecular)
    for (const badge of this.pocketBadges) badge.visible = molecular && t >= S.hydration && t < S.fastTurns
    if (this.boxLabel) {
      this.boxLabel.object.visible = molecular && t >= T.glide[0]
      const entered = enteredAt(t)
      this.boxLabel.count.hidden = t < S.bilan
      this.boxLabel.count.textContent = fillTemplate(text.tags.boxCount, { count: entered, acetylCoA: VALUES.acetylCoA })
    }

    // The reticle: the chain, then the acetyl-CoA carrying our last two carbons, then the box.
    const subject = reticleAt(t)
    const position = new THREE.Vector3()
    let name = ''
    if (subject.kind === 'chain') {
      const p = story.chain.poseAt(t)
      position.copy(chainMiddle(subject.carbons)).applyQuaternion(p.quaternion).add(p.position)
      const names = text.names
      const acyl = subject.bound
        ? subject.carbons <= 2
          ? names.acetylBound
          : names.thiolaseBound
        : subject.mark === 'enoyl'
          ? names.enoyl
          : subject.mark === 'hydroxy'
            ? names.hydroxy
            : subject.mark === 'keto'
              ? names.keto
              : ((names.acyl as Record<string, string | undefined>)[String(subject.carbons)] ?? names.acylGeneric)
      name = fillTemplate(names.format, { name: acyl, carbons: subject.carbons })
      this.reticleSize = Math.max(1.6, subject.carbons * 0.15 + 0.9)
    } else if (subject.kind === 'acetyl') {
      const p = story.coas[subject.index].poseAt(t)
      position.set(0.6, 0, 0).applyQuaternion(p.quaternion).add(p.position)
      name = fill(subject.index === 0 ? text.names.firstAcetyl : text.names.lastAcetyl)
      this.reticleSize = 2.6
    } else {
      position.copy(KREBS_BOX.center)
      name = fill(text.names.box)
      this.reticleSize = 13
    }
    this.labels.setReticle(position, name, t >= T.dissolve[1] - 0.4)
  }

  private applyHud(t: number, context: SceneContext): void {
    context.journey.set(countersAt(t, BETA_OXIDATION.activationCostATP))
    if (this.gauge) {
      // From the first reaction to the last cut (then the Krebs box takes over).
      this.gauge.element.hidden = t < S.dehydrogenation || t >= S.krebs
      this.gauge.set(lynenAt(t))
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
    const introducing = t >= T.glide[0] && t < S.dehydrogenation + 3
    if (introducing !== this.legendHighlighted) {
      this.legendHighlighted = introducing
      context.legend.setHighlighted(introducing ? ['acetylCoA', 'nadh', 'fadh2', 'electron', 'water', 'co2', 'gtp'] : [])
    }
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
    s += carbonsAt(t) * 29.3 + ['none', 'enoyl', 'hydroxy', 'keto'].indexOf(markAt(t)) * 31.7
    this.acetyls.forEach((_, k) => (s += (hasAcetyl(k, t) ? 1 : 0) * (37.1 + k) + acetylMorphAt(k, t) * (41.3 + k)))
    s += (vlcadFadReduced(t) ? 43.7 : 0) + (complexIIReduced(t) ? 47.9 : 0) + (nadReduced(0, t) ? 53.1 : 0) + (nadReduced(1, t) ? 59.3 : 0)
    for (const model of Object.values(this.proteins)) s += (model?.dim.value ?? 0) * 7.1
    s += (this.box?.dim.value ?? 0) * 61.7 + (this.stage?.media.uMediaAmount.value ?? 0) * 17.3
    s += this.camera.projectionMatrix.elements[0] * 19.1 + this.camera.projectionMatrix.elements[5] * 23.3
    return s
  }
}
