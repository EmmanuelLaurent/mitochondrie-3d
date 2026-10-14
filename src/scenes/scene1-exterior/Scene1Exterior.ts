import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Scene, SceneContext } from '../../core/Scene'
import { disposeObject3D } from '../../core/dispose'
import { content } from '../../i18n/content'
import { addCristaeWobble, beanZExtent, createBeanGeometry } from './mitochondrionGeometry'

function createBackdropTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512)
    gradient.addColorStop(0, '#1b2735')
    gradient.addColorStop(0.55, '#0f1621')
    gradient.addColorStop(1, '#070a0e')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 2, 512)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const RADIUS = 1.2

type StructureKey = keyof typeof content.scenes.scene1.labels

export class Scene1Exterior implements Scene {
  readonly id = 'scene1-exterior'
  readonly threeScene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)

  private readonly group = new THREE.Group()
  private readonly cutawayPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), beanZExtent(RADIUS))
  private readonly cutMax = beanZExtent(RADIUS)

  private controls: OrbitControls | null = null
  private cutawayPanel: HTMLElement | null = null
  private context: SceneContext | null = null
  private readonly labelElements: HTMLElement[] = []
  private pmremGenerator: THREE.PMREMGenerator | null = null
  private environmentTexture: THREE.Texture | null = null
  private readonly backdropTexture = createBackdropTexture()

  constructor() {
    this.threeScene.background = this.backdropTexture
    this.camera.position.set(2.8, 2.6, 3.4)
  }

  async enter(context: SceneContext): Promise<void> {
    this.context = context

    const { clientWidth, clientHeight } = context.container
    this.camera.aspect = clientWidth / Math.max(1, clientHeight)
    this.camera.updateProjectionMatrix()

    this.buildEnvironment(context)
    this.buildLighting()
    this.buildMitochondrion()
    this.buildLabels(context)
    this.buildCutawayControl(context)

    this.controls = new OrbitControls(this.camera, context.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 2
    this.controls.maxDistance = 9
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    context.scaleBar.setTier('organelle', 1)
    context.sceneCaption.textContent = `${content.scenes.scene1.title} — ${content.scenes.scene1.keyMessage}`
  }

  update(deltaSeconds: number): void {
    this.controls?.update(deltaSeconds)
  }

  exit(): void {
    this.controls?.dispose()
    this.controls = null

    for (const element of this.labelElements) element.remove()
    this.labelElements.length = 0

    this.cutawayPanel?.remove()
    this.cutawayPanel = null

    this.context?.tooltipLayer.clear()
    this.context = null

    disposeObject3D(this.group)
    this.group.clear()

    this.threeScene.environment = null
    this.environmentTexture?.dispose()
    this.environmentTexture = null
    this.pmremGenerator?.dispose()
    this.pmremGenerator = null
  }

  private buildEnvironment(context: SceneContext): void {
    this.pmremGenerator = new THREE.PMREMGenerator(context.renderer)
    this.environmentTexture = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture
    this.threeScene.environment = this.environmentTexture
  }

  private buildLighting(): void {
    // Warm key / cool cyan rim — a deliberate complementary pair so the organelle
    // pops off the dark backdrop instead of reading as flatly lit.
    const hemi = new THREE.HemisphereLight(0x2a3a4a, 0x100c08, 0.5)

    const key = new THREE.DirectionalLight(0xffe3bd, 2.6)
    key.position.set(4, 5.5, 3.5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 12
    key.shadow.camera.left = -3
    key.shadow.camera.right = 3
    key.shadow.camera.top = 3
    key.shadow.camera.bottom = -3
    key.shadow.radius = 3
    key.shadow.bias = -0.0015

    const fill = new THREE.DirectionalLight(0x6fa8c9, 0.5)
    fill.position.set(-4.5, 1.5, -1.5)

    const rim = new THREE.DirectionalLight(0x7fe3ff, 2.2)
    rim.position.set(-2.8, 2.6, -4.8)

    this.threeScene.add(hemi, key, fill, rim)
  }

  private buildMitochondrion(): void {
    // Opaque, not translucent: with no stencil-based clip caps, overlapping
    // translucent shells blend into a murky, unreadable mess once cut open.
    // Solid colours keep each cross-section ring clean — closer to the classic
    // "biology textbook cutaway diagram" look anyway (direction artistique).
    const outerGeometry = createBeanGeometry(RADIUS)
    const outerMaterial = new THREE.MeshStandardMaterial({
      color: 0xd98c6b,
      roughness: 0.6,
      side: THREE.DoubleSide,
      clippingPlanes: [this.cutawayPlane],
    })
    const outerMembrane = new THREE.Mesh(outerGeometry, outerMaterial)
    outerMembrane.name = 'outerMembrane'
    outerMembrane.castShadow = true
    outerMembrane.receiveShadow = true

    const innerGeometry = addCristaeWobble(createBeanGeometry(RADIUS * 0.82), RADIUS * 0.022)
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: 0xc96b4a,
      roughness: 0.75,
      side: THREE.DoubleSide,
      clippingPlanes: [this.cutawayPlane],
    })
    const innerMembrane = new THREE.Mesh(innerGeometry, innerMaterial)
    innerMembrane.name = 'innerMembrane'
    innerMembrane.castShadow = true
    innerMembrane.receiveShadow = true

    // Unlit (MeshBasicMaterial) and DoubleSide: FrontSide culling made the solid
    // core nearly disappear through the cutaway (only its clipped silhouette
    // rim remained), and a lit DoubleSide material rendered its back faces
    // dark (shaded as if facing away from the light). Flat, unlit colour reads
    // as a clean solid fill regardless of which face the camera sees.
    const matrixGeometry = createBeanGeometry(RADIUS * 0.62)
    const matrixMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2c879,
      side: THREE.DoubleSide,
      clippingPlanes: [this.cutawayPlane],
    })
    const matrix = new THREE.Mesh(matrixGeometry, matrixMaterial)
    matrix.name = 'matrix'
    matrix.receiveShadow = true

    this.group.add(matrix, innerMembrane, outerMembrane)
    this.threeScene.add(this.group)
  }

  private buildLabels(context: SceneContext): void {
    const anchors: Record<StructureKey, THREE.Vector3> = {
      outerMembrane: new THREE.Vector3(0, RADIUS * 1.05, 0),
      intermembraneSpace: new THREE.Vector3(-RADIUS * 1.2, RADIUS * 0.3, 0),
      innerMembrane: new THREE.Vector3(0, -RADIUS * 0.55, RADIUS * 0.55),
      matrix: new THREE.Vector3(0, 0, 0),
    }

    for (const key of Object.keys(anchors) as StructureKey[]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `scene1-label scene1-label--${key}`
      button.textContent = content.scenes.scene1.labels[key]
      button.addEventListener('click', () => {
        context.tooltipLayer.show(content.scenes.scene1.labels[key], content.scenes.scene1.tooltips[key])
      })

      const label = new CSS2DObject(button)
      label.position.copy(anchors[key])
      this.group.add(label)
      this.labelElements.push(button)
    }

    const infoButton = document.createElement('button')
    infoButton.type = 'button'
    infoButton.className = 'scene1-label scene1-label--info'
    infoButton.textContent = 'ℹ Réseau mitochondrial'
    infoButton.addEventListener('click', () => {
      context.tooltipLayer.show('Le saviez-vous ?', content.scenes.scene1.tooltips.network)
    })
    const infoLabel = new CSS2DObject(infoButton)
    infoLabel.position.set(RADIUS * 1.3, -RADIUS * 0.9, 0)
    this.group.add(infoLabel)
    this.labelElements.push(infoButton)
  }

  private buildCutawayControl(context: SceneContext): void {
    const panel = document.createElement('div')
    panel.className = 'cutaway-control'

    const label = document.createElement('label')
    label.htmlFor = 'cutaway-slider'
    label.textContent = content.scenes.scene1.cutawaySliderLabel

    const slider = document.createElement('input')
    slider.id = 'cutaway-slider'
    slider.type = 'range'
    slider.min = '0'
    slider.max = '100'
    slider.value = '0'
    slider.style.setProperty('--_fill', '0%')
    slider.addEventListener('input', () => {
      const t = Number(slider.value) / 100
      this.cutawayPlane.constant = THREE.MathUtils.lerp(this.cutMax, 0, t)
      slider.style.setProperty('--_fill', `${slider.value}%`)
    })

    panel.append(label, slider)
    context.container.append(panel)
    this.cutawayPanel = panel
  }
}
