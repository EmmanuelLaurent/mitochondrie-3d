import * as THREE from 'three'
import type { NarrationControl, Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { countersAtChapterStart } from '../../core/JourneyState'
import { COMPARTMENT_COLORS, MOLECULE_COLORS } from '../../config/palette'
import { BETA_OXIDATION } from '../../config/science.config'
import { content } from '../../i18n/content'
import { createFill } from '../../i18n/fill'
import { StepPlayer } from '../../ui/player/StepPlayer'
import { Quiz } from '../../ui/quiz/Quiz'
import type { MitochondrionSdf } from '../scene1-exterior/mitochondrionSdf'
import { OrbitOffsets, mixShots, placeCamera, type CameraShot } from '../shared/molecular/camera'
import { EASE, ramp, stepIndexAt } from '../shared/molecular/choreography'
import { CUT_Z, frameMedia, v } from '../shared/molecular/frame'
import { FramingBand } from '../shared/molecular/framing'
import { createRecapCard, DepthGauge } from '../shared/molecular/hud'
import { LabelSet } from '../shared/molecular/labels'
import { patchMaterial } from '../shared/molecular/media'
import { createMembrane, type Membrane } from '../shared/molecular/membrane'
import { createAdenosine, createCarbonChain, createCarnitine, createCoA, createLink, createPhosphate, PHOSPHATE_X, type MoleculeMaterials } from '../shared/molecular/molecules'
import { createStepTimeline, playerSteps } from '../shared/molecular/narration'
import { createNanoOrganelle, MATRIX_VIEWPOINT, organellePosition, OUTER_CUT_EDGE, scene1Shot } from '../shared/molecular/organelle'
import { MolecularStage } from '../shared/molecular/stage'
import { createNotHappeningCard, routeMapSvg, ROUTE_MAP_VIEWBOX } from './hud'
import { PROTEINS, SET, type ProteinKey } from './layout'
import { createAcsl, createCact, createCpt1, createCpt2, createPorin, createPyrophosphatase, type MaterialFactory, type ProteinModel } from './proteins'
import { compartmentAt, countersAt, createCameraTrack, DIVE_POINT, DIVE_SHOT, DURATION, isAtWork, MATRIX_REST, nameAt, ShuttleStory, STEP_STARTS, T, type Compartment } from './story'

/** Beyond the farthest membrane plane (they extend 3000 nm and fade into the media). */
const FAR_EXTRA = 6500

const text = content.scenes.scene2
const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Fills the {carbons} / {cost} placeholders from the science config (never hard-coded). */
const fill = createFill({ carbons: BETA_OXIDATION.chainCarbons, cost: BETA_OXIDATION.activationCostATP })

// The organelle of scene 1, placed so that the top edge of its cut (outer membrane, cut
// fully open) lands on the molecular set's cut edge: the ×100 dive goes from one
// representation to the other at the same place.
const ORGANELLE_POSITION = organellePosition(OUTER_CUT_EDGE, DIVE_POINT)
// For the crista view, the organelle is moved so that our molecule sits on its matrix
// cut face (just under the inner membrane, between two cristae).
const OUTRO_POSITION = organellePosition(MATRIX_VIEWPOINT, MATRIX_REST.position)
const SCENE1_SHOT = scene1Shot(ORGANELLE_POSITION)

/** The middle of the chain (C8), in the chain's frame: what the reticle and the gauge follow. */
const CHAIN_MIDDLE = v(-1.05, 0, 0)

export class Scene2Shuttle implements Scene {
  readonly id = 'scene2-shuttle'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000)
  readonly multisampling = 4

  private context: SceneContext | null = null
  private readonly root = new THREE.Group()
  private readonly molecularSet = new THREE.Group()
  private stage: MolecularStage | null = null
  private sdf: MitochondrionSdf | null = null
  private story: ShuttleStory | null = null
  private cameraTrack: ((t: number, out: CameraShot) => CameraShot) | null = null
  private readonly shot: CameraShot = { target: new THREE.Vector3(), distance: 1, azimuth: 0, elevation: 0 }
  private timeline: gsap.core.Timeline | null = null
  private player: StepPlayer | null = null
  private offsets: OrbitOffsets | null = null
  private band: FramingBand | null = null
  private proteins: Partial<Record<ProteinKey, ProteinModel>> = {}
  private cactOpen: ((side: number) => void) | null = null
  private acslLid: THREE.Object3D | null = null
  private membranes: { outer: Membrane; inner: Membrane } | null = null
  private readonly labels = new LabelSet<ProteinKey>()
  private gauge: DepthGauge<Compartment> | null = null
  private insetCard: HTMLElement | null = null
  private recapCard: HTMLElement | null = null
  private recenterButton: HTMLButtonElement | null = null
  private quiz: Quiz | null = null
  private unsubscribeQuality: (() => void) | null = null
  private lastSignature = Number.NaN
  private forceDirty = true
  private lastTier: 'organelle' | 'molecular' | 'crista' | null = null
  private lastTime = 0
  private hoveredProtein: ProteinKey | null = null
  private legendHighlighted = false
  private labelledStep = -1

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

    // Light, reflections, media, backdrop.
    this.stage = new MolecularStage(context.renderer, this.threeScene, this.root, frameMedia(), {
      halfSize: 42,
      near: 20,
      far: 320,
      target: v(-2, -10, 12),
    })
    this.stage.configureShadows(low)

    // The organelle for the ×100 dive.
    this.sdf = createNanoOrganelle(context.quality.current)
    this.sdf.setCut(0.85)
    this.sdf.mesh.position.copy(ORGANELLE_POSITION)
    this.root.add(this.sdf.mesh)

    this.buildMolecularSet(low)
    this.root.add(this.molecularSet)

    this.offsets = new OrbitOffsets(context.renderer.domElement)
    this.band = new FramingBand(context.container, context.playerRoot, () => {
      this.forceDirty = true
    })
    // Shown only once the student has turned or zoomed the view.
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
      { key: 'cytosol', label: text.compartments.cytosol, badge: '', color: '#3a4656', texture: 'open' },
      { key: 'outerMembrane', label: text.compartments.outerMembrane, badge: '1', color: COMPARTMENT_COLORS.outerMembrane.section, texture: 'bilayer' },
      { key: 'intermembraneSpace', label: text.compartments.intermembraneSpace, badge: '2', color: COMPARTMENT_COLORS.intermembraneSpace.fluid, texture: 'fluid' },
      { key: 'innerMembrane', label: text.compartments.innerMembrane, badge: '3', color: COMPARTMENT_COLORS.innerMembrane.section, texture: 'bilayer' },
      { key: 'matrix', label: text.compartments.matrix, badge: '4', color: COMPARTMENT_COLORS.matrix.section, texture: 'granular' },
    ])
    this.insetCard = createNotHappeningCard()
    this.insetCard.hidden = true
    this.recapCard = createRecapCard({
      title: text.recap.title,
      keyMessage: text.recap.keyMessage,
      map: { svg: routeMapSvg(), viewBox: ROUTE_MAP_VIEWBOX, label: text.recap.mapLabel },
      net: fill(text.recap.net),
      bridge: text.recap.bridge,
      nextChapter: content.chapters.items.scene3,
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
    context.container.append(this.insetCard, this.recapCard)

    context.journey.set(countersAtChapterStart())
    context.legend.setHighlighted([])
    context.sceneCaption.textContent = ''
    context.scaleBar.setTier('organelle')
    this.lastTier = 'organelle'

    this.unsubscribeQuality = context.quality.onChange((level) => {
      this.sdf?.setQuality(level)
      this.stage?.configureShadows(level === 'low')
      this.forceDirty = true
    })

    // Compile every program now (the raymarcher is big, and the molecular set is hidden at
    // first) so neither the start nor the dissolve hitches.
    this.applyTime(0)
    this.molecularSet.visible = true
    await context.renderer.compileAsync(this.threeScene, this.camera)
    if (this.context !== context) return // exited while compiling
    this.applyTime(0)

    this.timeline = createStepTimeline(STEP_STARTS, DURATION)
    const tooltips = text.tooltips as Record<string, string>
    const titles = text.tooltipTitles as Record<string, string>
    this.player = new StepPlayer(context.playerRoot, {
      timeline: this.timeline,
      steps: playerSteps(text.steps, fill, (key) => ({ title: titles[key], text: tooltips[key] }), (title, body) => context.tooltipLayer.show(title, body)),
      reducedMotion: prefersReducedMotion(),
      autoplay: context.visit.guided,
      // Nothing to do here: update() notices the playhead moved, and the signature tells
      // whether the picture changed (still holds keep refining while playing).
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
    // True ruler at the focus depth.
    const distance = this.shot.distance * (this.offsets?.zoom ?? 1)
    const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    const pxPerNm = this.context.container.clientHeight / viewHeight
    this.context.scaleBar.setPixelsPerMeter(pxPerNm * 1e9)
    // The reticle frames the followed molecule.
    this.labels.sizeReticle(this.camera, this.context.container.clientHeight, 3.1)
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
    this.insetCard?.remove()
    this.recapCard?.remove()
    this.recenterButton?.remove()
    this.recenterButton = null
    this.quiz?.close()
    this.quiz = null
    this.insetCard = null
    this.recapCard = null
    this.labels.dispose()
    if (this.context) {
      this.context.renderer.domElement.removeAttribute('role')
      this.context.renderer.domElement.removeAttribute('aria-label')
      this.context.tooltipLayer.clear()
      this.context.legend.setHighlighted([])
      this.context.legend.setExpanded(false)
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

    const outer = createMembrane({
      y: SET.ommY,
      headColor: COMPARTMENT_COLORS.outerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.outerMembrane.section,
      proteins: [PROTEINS.acsl, PROTEINS.cpt1, PROTEINS.porin],
      seed: 2026,
      media,
      low,
      patch: SET.patch,
    })
    const inner = createMembrane({
      y: SET.immY,
      headColor: COMPARTMENT_COLORS.innerMembrane.heads,
      tailColor: COMPARTMENT_COLORS.innerMembrane.section,
      proteins: [PROTEINS.cact, PROTEINS.cpt2],
      seed: 1014,
      media,
      low,
      patch: SET.patch,
    })
    this.membranes = { outer, inner }
    this.molecularSet.add(outer.group, inner.group)

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
    const acsl = createAcsl(proteinMaterial)
    const cpt1 = createCpt1(proteinMaterial)
    const porin = createPorin(proteinMaterial)
    const cact = createCact(proteinMaterial)
    const cpt2 = createCpt2(proteinMaterial)
    const ppase = createPyrophosphatase(proteinMaterial)
    this.proteins = { acsl, cpt1, porin, cact, cpt2, pyrophosphatase: ppase }
    this.cactOpen = cact.setOpenTo
    this.acslLid = acsl.parts.cDomain
    for (const [key, model] of Object.entries(this.proteins) as [ProteinKey, ProteinModel][]) {
      model.group.position.copy(PROTEINS[key].position)
      this.molecularSet.add(model.group)
    }

    // Molecules: glossy "actors" against matte proteins and membranes.
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
      adenosineDischarged: glossy({ color: MOLECULE_COLORS.amp }),
    }

    const chain = createCarbonChain(materials)
    const adenosine = createAdenosine(materials)
    const linkAlphaBeta = createLink(new THREE.Vector3(PHOSPHATE_X[0], 0, 0), new THREE.Vector3(PHOSPHATE_X[1], 0, 0), materials.link, 0.035)
    adenosine.group.add(linkAlphaBeta)
    const phosphateBeta = new THREE.Group()
    phosphateBeta.add(createPhosphate(materials, 1.1))
    const linkBetaGamma = createLink(new THREE.Vector3(0, 0, 0), new THREE.Vector3(PHOSPHATE_X[2] - PHOSPHATE_X[1], 0, 0), materials.link, 0.035)
    phosphateBeta.add(linkBetaGamma)
    const phosphateGamma = new THREE.Group()
    phosphateGamma.add(createPhosphate(materials, 2.3))
    const coaCytosol = createCoA(materials)
    const coaMatrix = createCoA(materials)
    const carnitineIn = createCarnitine(materials)
    const carnitineOut = createCarnitine(materials)
    this.molecularSet.add(chain.group, adenosine.group, phosphateBeta, phosphateGamma, coaCytosol, coaMatrix, carnitineIn, carnitineOut)

    const sites = Object.fromEntries(
      (Object.entries(this.proteins) as [ProteinKey, ProteinModel][]).map(([key, model]) => [key, model.sites]),
    ) as Record<ProteinKey, Record<string, THREE.Vector3>>

    this.story = new ShuttleStory({
      chain: chain.group,
      freeOxygen: chain.freeOxygen,
      bondPoint: chain.bondPoint,
      adenosine: adenosine.group,
      setAdenosineCharged: adenosine.setCharged,
      linkAlphaBeta,
      phosphateBeta,
      phosphateGamma,
      linkBetaGamma,
      coaCytosol,
      coaMatrix,
      carnitineIn,
      carnitineOut,
      sites,
    })
    this.cameraTrack = createCameraTrack(this.story)

    // Molecule tags (name pills that follow their molecule, shown when they matter).
    const tags = text.tags
    this.labels.addTag(adenosine.group, v(0, 0.7, 0), [
      [T.atpIn[0], T.split, tags.atp],
      [T.split, STEP_STARTS.cpt1, tags.amp],
    ])
    this.labels.addTag(phosphateBeta, v(0.2, 0.55, 0), [
      [T.split + 0.2, T.hydrolysis, tags.ppi],
      [T.hydrolysis, STEP_STARTS.cpt1, tags.pi],
    ])
    // One tetrahedron = one Pi: after hydrolysis each phosphate carries its own tag.
    this.labels.addTag(phosphateGamma, v(0.2, 0.55, 0), [[T.hydrolysis, STEP_STARTS.cpt1, tags.pi]])
    this.labels.addTag(coaCytosol, v(1.9, 0.55, 0), [
      [T.coaIn[0], T.thioester, tags.coa],
      [T.coaOut[0] + 0.6, STEP_STARTS.barrier, tags.coaCytosol],
    ])
    this.labels.addTag(carnitineIn, v(0.6, 0.6, 0), [
      [T.carnitineIn[0], T.swap1, tags.carnitine],
      [T.carnitineBack[0], STEP_STARTS.matrix + 2, tags.carnitineBack],
    ])
    this.labels.addTag(carnitineOut, v(0.6, 0.6, 0), [[T.matrixCarnitineIn[0] - 1.5, STEP_STARTS.cpt2, tags.carnitineOut]])
    this.labels.addTag(coaMatrix, v(1.9, 0.55, 0), [[T.coaMatrixIn[0], T.swap2, tags.coaMatrix]])
    // « Sa tête carboxylate servira de point d'accroche » : the head is marked.
    this.labels.addTag(chain.group, chain.bondPoint.clone().add(v(0, 0.5, 0)), [[STEP_STARTS.palmitate, T.split, tags.carboxylate]])
    // Kept outside the molecular set (positioned on the chain every frame) so it still
    // marks our molecule once the set has dissolved into the crista view.
    this.labels.createReticle(this.root)

    // Each layer named on the section itself during the establishing shot (scene 1's badges).
    const layers: { key: keyof typeof text.compartments; badge: string; swatch: string; y: number }[] = [
      { key: 'cytosol', badge: '', swatch: '#3a4656', y: SET.ommY + 12 },
      { key: 'outerMembrane', badge: '1', swatch: COMPARTMENT_COLORS.outerMembrane.section, y: SET.ommY },
      { key: 'intermembraneSpace', badge: '2', swatch: COMPARTMENT_COLORS.intermembraneSpace.fluid, y: (SET.ommY + SET.immY) / 2 },
      { key: 'innerMembrane', badge: '3', swatch: COMPARTMENT_COLORS.innerMembrane.section, y: SET.immY },
      { key: 'matrix', badge: '4', swatch: COMPARTMENT_COLORS.matrix.section, y: SET.immY - 9 },
    ]
    for (const layer of layers) {
      this.labels.addLayerLabel(
        this.molecularSet,
        text.compartments[layer.key],
        v(layer.key === 'cytosol' ? -50 : -40, layer.y, CUT_Z + 0.5),
        layer.badge ? { text: layer.badge, swatch: layer.swatch } : undefined,
      )
    }
  }

  private buildCallouts(context: SceneContext): void {
    const order: { key: ProteinKey; tooltip: keyof typeof text.tooltips; direction: 'up' | 'down' | 'left' | 'right'; extra?: keyof typeof text.tooltips }[] = [
      { key: 'acsl', tooltip: 'acsl', direction: 'up', extra: 'activationCost' },
      { key: 'pyrophosphatase', tooltip: 'pyrophosphatase', direction: 'up' },
      { key: 'cpt1', tooltip: 'cpt1', direction: 'up', extra: 'cpt1Regulation' },
      { key: 'porin', tooltip: 'porin', direction: 'left' },
      { key: 'cact', tooltip: 'cact', direction: 'right', extra: 'innerMembraneBarrier' },
      { key: 'cpt2', tooltip: 'cpt2', direction: 'right', extra: 'coenzymeAPools' },
    ]
    for (const { key, tooltip, direction, extra } of order) {
      const model = this.proteins[key]
      if (!model) continue
      this.labels.addCallout(key, {
        parent: model.group,
        anchor: model.labelAnchor,
        label: text.proteins[key],
        direction,
        onOpen: () => {
          this.player?.pause()
          context.tooltipLayer.show(text.proteins[key], fill(text.tooltips[tooltip]))
        },
        info: extra
          ? {
              ariaLabel: `${text.proteins[key]} : ${content.ui.didYouKnow}`,
              onOpen: () => {
                this.player?.pause()
                context.tooltipLayer.show(fill(text.tooltipTitles[extra]), fill(text.tooltips[extra]))
              },
            }
          : undefined,
        onFocus: (focused) => this.focusProtein(focused ? key : null),
      })
    }
  }

  private focusProtein(key: ProteinKey | null): void {
    this.hoveredProtein = key
    this.forceDirty = true
  }

  // -------------------------------------------------------------------- time

  private applyTime(t: number): void {
    const story = this.story
    const context = this.context
    if (!story || !context || !this.stage) return
    this.lastTime = t

    for (const actor of story.actors) actor.apply(t)
    story.applyParts(
      t,
      (angle) => {
        if (this.acslLid) this.acslLid.rotation.z = angle
      },
      (side) => this.cactOpen?.(side),
    )

    // ×100 dive: the organelle dissolves into the molecular set at the same place.
    // ÷10 at the end: the molecular set dissolves back into the organelle, placed so that
    // our molecule sits on its matrix cut face between two cristae.
    const dissolve = ramp(t, T.dissolve[0], T.dissolve[1], EASE.inOut)
    const outro = ramp(t, T.cristaDissolve[0], T.cristaDissolve[1], EASE.inOut)
    const inMatrixView = t >= STEP_STARTS.matrix
    if (this.sdf) {
      this.sdf.mesh.position.copy(inMatrixView ? OUTRO_POSITION : ORGANELLE_POSITION)
      this.sdf.setCut(inMatrixView ? 1 : 0.85 + 0.15 * ramp(t, T.cutOpen[0], T.cutOpen[1]))
      this.sdf.setOpacity(inMatrixView ? outro : 1 - dissolve)
    }
    this.molecularSet.visible = t >= T.dissolve[0] - 0.2 && outro < 1
    this.stage.media.uMediaAmount.value = dissolve

    // Camera: scripted shot + the student's own orbit (not during the dive).
    const free = t >= T.glide[1]
    if (this.offsets) this.offsets.enabled = free
    if (t < T.dive[1]) this.diveShot(t, this.shot)
    else this.cameraTrack?.(t, this.shot)
    const lift = (this.band?.lift ?? 0) * ramp(t, T.dive[0], T.dive[1])
    placeCamera(this.camera, this.shot, free ? this.offsets : null, FAR_EXTRA, lift)

    this.applyFocus(t)
    this.applyLabels(t)
    this.applyHud(t, context)
  }

  /** Logarithmic dolly from scene 1's framing down onto the outer membrane's surface. */
  private diveShot(t: number, out: CameraShot): CameraShot {
    const u = ramp(t, T.dive[0], T.dive[1], EASE.inOut)
    mixShots(SCENE1_SHOT, DIVE_SHOT, u, out)
    // The aim converges early on the landing point, so it stays centred while the scale changes.
    const aim = 1 - Math.pow(1 - ramp(t, T.dive[0], T.dive[1] - 1.5, EASE.linear), 3)
    out.target.lerpVectors(SCENE1_SHOT.target, DIVE_SHOT.target, aim)
    return out
  }

  /** Focus + context: the protein at work stays lit, the others recede. */
  private applyFocus(t: number): void {
    const inSteps = t >= STEP_STARTS.activation && t < STEP_STARTS.matrix
    for (const [key, model] of Object.entries(this.proteins) as [ProteinKey, ProteinModel][]) {
      if (this.hoveredProtein) model.dim.value = this.hoveredProtein === key ? 0 : 0.85
      else model.dim.value = inSteps && !isAtWork(key, t) ? 0.7 : 0
    }
    if (this.membranes) {
      // « La vraie barrière » : only the inner membrane (and CACT) stay lit.
      const barrier = ramp(t, T.barrierView[0], T.barrierView[0] + 1.2) * (1 - ramp(t, STEP_STARTS.cact, STEP_STARTS.cact + 1.2))
      this.membranes.outer.dim.value = this.hoveredProtein ? 0.6 : 0.85 * barrier
      this.membranes.inner.dim.value = this.hoveredProtein ? 0.6 : 0
    }
  }

  private applyLabels(t: number): void {
    const story = this.story!
    // A protein is named when it acts, so the picture never carries more labels than the
    // step needs. Labels inside the molecular set disappear with it in the crista view;
    // the reticle lives outside the set so our molecule stays marked there.
    const molecular = t < T.cristaDissolve[0]
    for (const key of this.labels.calloutKeys) {
      this.labels.showCallout(key, molecular && (isAtWork(key, t) || this.hoveredProtein === key))
    }
    this.labels.showLayerLabels(t >= T.glide[0] && t < STEP_STARTS.activation)
    this.labels.applyTags(t, molecular)
    const p = story.chain.poseAt(t)
    this.labels.setReticle(CHAIN_MIDDLE.clone().applyQuaternion(p.quaternion).add(p.position), fill(text.tags[nameAt(t)]), t >= T.dissolve[1] - 0.4)
  }

  private applyHud(t: number, context: SceneContext): void {
    const story = this.story!
    // Counters: a pure function of time (stepping back undoes the cost; it never counts twice).
    context.journey.set(countersAt(t, BETA_OXIDATION.activationCostATP))

    // The gauge follows the middle of the chain (its head may already be across).
    const chainPose = story.chain.poseAt(t)
    this.gauge?.set(compartmentAt(CHAIN_MIDDLE.clone().applyQuaternion(chainPose.quaternion).add(chainPose.position).y))
    if (this.gauge) this.gauge.element.hidden = t < STEP_STARTS.palmitate + 2

    const tier = t >= T.cristaTier ? 'crista' : t >= T.tier ? 'molecular' : 'organelle'
    if (tier !== this.lastTier) {
      // Announce only when the change is crossed while playing forward, not when seeking.
      const crossing = tier === 'molecular' ? Math.abs(t - T.tier) < 0.5 : tier === 'crista' ? Math.abs(t - T.cristaTier) < 0.5 : false
      context.scaleBar.setTier(tier, crossing ? (tier === 'molecular' ? 100 : 0.1) : undefined)
      this.lastTier = tier
    }

    // The canvas is an image for assistive technologies; its name follows the step.
    const stepIndex = stepIndexAt(STEP_STARTS, t)
    if (stepIndex !== this.labelledStep) {
      this.labelledStep = stepIndex
      const step = text.steps[stepIndex]
      context.renderer.domElement.setAttribute('role', 'img')
      context.renderer.domElement.setAttribute('aria-label', `${text.title} — ${step.title}`)
    }
    if (this.recenterButton) this.recenterButton.hidden = !(this.offsets?.isOffset ?? false)
    if (this.insetCard) this.insetCard.hidden = !(t >= T.barrierView[0] + 1.0 && t < STEP_STARTS.cact)
    if (this.recapCard) this.recapCard.hidden = t < T.recap
    const introducing = t >= STEP_STARTS.palmitate && t < STEP_STARTS.activation
    if (introducing !== this.legendHighlighted) {
      this.legendHighlighted = introducing
      context.legend.setHighlighted(introducing ? ['coa', 'carnitine', 'amp', 'pyrophosphate'] : [])
    }
  }

  /** Cheap fingerprint of everything that affects the 3D picture: unchanged = refine instead of redraw. */
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
    for (const model of Object.values(this.proteins)) s += (model?.dim.value ?? 0) * 7.1
    s += (this.membranes?.outer.dim.value ?? 0) * 9.7 + (this.membranes?.inner.dim.value ?? 0) * 11.3
    s += (this.acslLid?.rotation.z ?? 0) * 13.1 + (this.stage?.media.uMediaAmount.value ?? 0) * 17.3
    s += this.camera.projectionMatrix.elements[0] * 19.1 + this.camera.projectionMatrix.elements[5] * 23.3
    return s
  }
}
