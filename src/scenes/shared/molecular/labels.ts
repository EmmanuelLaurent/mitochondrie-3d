import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

/**
 * Everything written on a molecular set: protein callouts (pill + leader line + dot on
 * the structure), name tags that follow small molecules during time windows, the reticle
 * that frames the followed molecule, and the layer names of the establishing shot.
 */

export type CalloutDirection = 'up' | 'down' | 'left' | 'right'

export interface CalloutOptions {
  /** The object the callout is attached to (it moves and hides with it). */
  parent: THREE.Object3D
  /** Where the dot sits, in the parent's frame. */
  anchor: THREE.Vector3
  label: string
  direction: CalloutDirection
  onOpen: () => void
  /** Optional ℹ button next to the name (« Le saviez-vous ? »). */
  info?: { ariaLabel: string; onOpen: () => void }
  /** Hover / keyboard focus on the name: the structure stands out, the rest greys. */
  onFocus: (focused: boolean) => void
}

/** [from, to, text]: the tag shows `text` while from ≤ t < to. */
export type TagWindow = [number, number, string]

interface Tag {
  object: CSS2DObject
  element: HTMLElement
  windows: TagWindow[]
  shown: string
}

const CENTERS: Record<CalloutDirection, [number, number]> = { up: [0.5, 1], down: [0.5, 0], left: [1, 0.5], right: [0, 0.5] }

export class LabelSet<K extends string = string> {
  private readonly callouts = new Map<K, CSS2DObject>()
  private readonly tags: Tag[] = []
  private readonly layerLabels: CSS2DObject[] = []
  private reticle: { object: CSS2DObject; element: HTMLElement; name: HTMLElement; shown: string } | null = null

  addCallout(key: K, options: CalloutOptions): void {
    const wrapper = document.createElement('div')
    wrapper.className = `callout callout--${options.direction}`
    const pill = document.createElement('span')
    pill.className = 'scene-label-group'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'scene-label'
    button.textContent = options.label
    button.addEventListener('click', options.onOpen)
    button.addEventListener('pointerenter', () => options.onFocus(true))
    button.addEventListener('focus', () => options.onFocus(true))
    button.addEventListener('pointerleave', () => options.onFocus(false))
    button.addEventListener('blur', () => options.onFocus(false))
    pill.append(button)
    if (options.info) {
      const info = document.createElement('button')
      info.type = 'button'
      info.className = 'scene-label scene-label--info'
      info.textContent = 'ℹ'
      info.setAttribute('aria-label', options.info.ariaLabel)
      info.addEventListener('click', options.info.onOpen)
      pill.append(info)
    }
    const line = document.createElement('span')
    line.className = 'callout__line'
    const dot = document.createElement('span')
    dot.className = 'callout__dot'
    if (options.direction === 'up' || options.direction === 'left') wrapper.append(pill, line, dot)
    else wrapper.append(dot, line, pill)
    const object = new CSS2DObject(wrapper)
    // The anchor dot sits exactly on the structure, whatever side the pill is on.
    const [cx, cy] = CENTERS[options.direction]
    object.center.set(cx, cy)
    object.position.copy(options.anchor)
    options.parent.add(object)
    this.callouts.set(key, object)
  }

  showCallout(key: K, visible: boolean): void {
    const object = this.callouts.get(key)
    if (object) object.visible = visible
  }

  get calloutKeys(): K[] {
    return [...this.callouts.keys()]
  }

  /** A name pill that follows a molecule and shows during its windows. */
  addTag(parent: THREE.Object3D, offset: THREE.Vector3, windows: TagWindow[]): void {
    const element = document.createElement('span')
    element.className = 'molecule-tag'
    const object = new CSS2DObject(element)
    object.position.copy(offset)
    object.center.set(0.5, 1)
    parent.add(object)
    this.tags.push({ object, element, windows, shown: '' })
  }

  /** Shows each tag whose window contains t (none when `allowed` is false). */
  applyTags(t: number, allowed: boolean): void {
    for (const tag of this.tags) {
      const window = tag.windows.find(([a, b]) => t >= a && t < b)
      const label = window ? window[2] : ''
      tag.object.visible = Boolean(window) && allowed
      if (label !== tag.shown) {
        tag.shown = label
        tag.element.textContent = label
      }
    }
  }

  /**
   * The reticle that frames the followed molecule. Keep its parent outside anything that
   * dissolves (e.g. the scene root), so the molecule stays marked across tier changes.
   */
  createReticle(parent: THREE.Object3D): void {
    const element = document.createElement('div')
    element.className = 'reticle'
    element.setAttribute('aria-hidden', 'true')
    const name = document.createElement('span')
    name.className = 'reticle__name'
    element.append(name)
    const object = new CSS2DObject(element)
    parent.add(object)
    this.reticle = { object, element, name, shown: '' }
  }

  setReticle(position: THREE.Vector3, name: string, visible: boolean): void {
    if (!this.reticle) return
    this.reticle.object.position.copy(position)
    this.reticle.object.visible = visible
    if (name !== this.reticle.shown) {
      this.reticle.shown = name
      this.reticle.name.textContent = name
    }
  }

  /** Reticle frame ≈ `worldSize` nm at the molecule's depth, ≥ 48 px so it stays findable when far. */
  sizeReticle(camera: THREE.PerspectiveCamera, viewportHeight: number, worldSize: number): void {
    if (!this.reticle) return
    const center = new THREE.Vector3().setFromMatrixPosition(this.reticle.object.matrixWorld)
    const depth = Math.max(1e-3, center.distanceTo(camera.position))
    const px = (worldSize * viewportHeight) / (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    const size = Math.max(48, Math.min(260, px))
    this.reticle.element.style.width = `${size.toFixed(0)}px`
    this.reticle.element.style.height = `${size.toFixed(0)}px`
  }

  /** A layer name written on the section (scene 1's numbered badges). */
  addLayerLabel(parent: THREE.Object3D, text: string, position: THREE.Vector3, badge?: { text: string; swatch: string }): void {
    const element = document.createElement('span')
    element.className = 'layer-label'
    if (badge) {
      const mark = document.createElement('span')
      mark.className = 'callout__badge'
      mark.textContent = badge.text
      mark.style.setProperty('--swatch', badge.swatch)
      mark.setAttribute('aria-hidden', 'true')
      element.append(mark)
    }
    element.append(text)
    const object = new CSS2DObject(element)
    object.position.copy(position)
    object.center.set(0, 0.5)
    parent.add(object)
    this.layerLabels.push(object)
  }

  showLayerLabels(visible: boolean): void {
    for (const label of this.layerLabels) label.visible = visible
  }

  /** Removes every element (CSS2DRenderer leaves them in the DOM otherwise). */
  dispose(): void {
    for (const object of this.callouts.values()) object.element.remove()
    for (const tag of this.tags) tag.element.remove()
    for (const label of this.layerLabels) label.element.remove()
    this.reticle?.element.remove()
    this.callouts.clear()
    this.tags.length = 0
    this.layerLabels.length = 0
    this.reticle = null
  }
}
