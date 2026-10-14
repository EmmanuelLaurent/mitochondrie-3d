import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'

/** Weight (in samples) given to a frame rendered while moving (one sample per pixel). */
const MOVING_FRAME_SAMPLES = 1

/**
 * Progressive accumulation: while the view is still, each frame is rendered with a
 * sub-pixel camera jitter and stochastic lighting, and averaged into an HDR history
 * buffer — converging to an offline-quality still. Any change resets it.
 */
class AccumulatePass extends Pass {
  samples = 0
  private history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private current = 0
  private readonly blend: FullScreenQuad
  private readonly copy: FullScreenQuad
  private readonly blendMaterial: THREE.ShaderMaterial
  private readonly copyMaterial: THREE.ShaderMaterial
  private pendingWeight = 1

  constructor() {
    super()
    const make = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    this.history = [make(), make()]
    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tHistory: { value: null },
        uWeight: { value: 1 },
      },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCurrent;
        uniform sampler2D tHistory;
        uniform float uWeight;
        varying vec2 vUv;
        void main() {
          gl_FragColor = mix(texture2D(tHistory, vUv), texture2D(tCurrent, vUv), uWeight);
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    })
    this.blend = new FullScreenQuad(this.blendMaterial)
    this.copy = new FullScreenQuad(this.copyMaterial)
  }

  /** Next frame replaces the history (a moving frame counts as several samples). */
  restart(): void {
    this.pendingWeight = 1
    this.samples = MOVING_FRAME_SAMPLES
  }

  /** Next frame adds one more sample to the running average. */
  addSample(): void {
    this.samples += 1
    this.pendingWeight = 1 / this.samples
  }

  override setSize(width: number, height: number): void {
    for (const target of this.history) target.setSize(width, height)
    this.restart()
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const previous = this.history[this.current]
    const next = this.history[1 - this.current]

    this.blendMaterial.uniforms.tCurrent.value = readBuffer.texture
    this.blendMaterial.uniforms.tHistory.value = previous.texture
    this.blendMaterial.uniforms.uWeight.value = this.pendingWeight
    renderer.setRenderTarget(next)
    this.blend.render(renderer)
    this.current = 1 - this.current

    this.copyMaterial.uniforms.tDiffuse.value = next.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.copy.render(renderer)
  }

  override dispose(): void {
    for (const target of this.history) target.dispose()
    this.blendMaterial.dispose()
    this.copyMaterial.dispose()
    this.blend.dispose()
    this.copy.dispose()
  }
}

// Runs after OutputPass, on display-referred values: gentle vignette, luma-weighted
// static grain, and triangular dither against 8-bit banding in the dark backdrop.
// No chromatic aberration: false colour fringes don't belong on a colour code.
const FilmFinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.012 },
    uVignette: { value: 0.32 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    float ign(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 fromCenter = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      col *= 1.0 - uVignette * smoothstep(0.35, 1.25, length(fromCenter) * 1.15);
      vec2 px = vUv * uResolution;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float grain = (ign(px) - 0.5) * uGrain * mix(0.5, 1.0, smoothstep(0.03, 0.3, l)) * (1.0 - 0.5 * smoothstep(0.6, 1.0, l));
      float dither = (ign(px) - ign(px + 17.0)) / 255.0;
      gl_FragColor = vec4(col + grain + dither, 1.0);
    }
  `,
}

function halton(index: number, base: number): number {
  let result = 0
  let f = 1 / base
  let i = index
  while (i > 0) {
    result += f * (i % base)
    i = Math.floor(i / base)
    f /= base
  }
  return result
}

/**
 * HDR pipeline: scene -> half-float target -> accumulation -> bloom (glints only)
 * -> OutputPass (tone mapping + sRGB) -> film finish. ShaderMaterials rendering into
 * the composer's targets stay linear automatically; tone mapping happens once, in OutputPass.
 */
export class PostProcessing {
  private readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly accumulate: AccumulatePass
  private readonly bloom: UnrealBloomPass
  private readonly finish: ShaderPass
  private readonly bufferSize = new THREE.Vector2(1, 1)

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.composer = new EffectComposer(renderer)
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    this.accumulate = new AccumulatePass()
    // High threshold with a soft knee: specular glints and rim light glow, lit surfaces don't.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.35, 2.4)
    // Typed as plain `object` in @types/three; the runtime holds IUniforms.
    ;(this.bloom.highPassUniforms as Record<string, THREE.IUniform<number>>).smoothWidth.value = 0.8
    this.finish = new ShaderPass(FilmFinishShader)

    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.accumulate)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.composer.addPass(this.finish)
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
    this.renderer.getDrawingBufferSize(this.bufferSize)
    this.finish.uniforms.uResolution.value.copy(this.bufferSize)
  }

  /**
   * @param sampleIndex null for a frame rendered while something changes (restarts the
   * average); otherwise the index of a still-view sample to accumulate.
   */
  render(scene: THREE.Scene, camera: THREE.Camera, sampleIndex: number | null): void {
    this.renderPass.scene = scene
    this.renderPass.camera = camera

    const jitter = sampleIndex !== null && camera instanceof THREE.PerspectiveCamera
    if (sampleIndex === null) {
      this.accumulate.restart()
    } else {
      this.accumulate.addSample()
    }
    if (jitter) {
      this.renderer.getDrawingBufferSize(this.bufferSize)
      const jx = halton(sampleIndex + 1, 2) - 0.5
      const jy = halton(sampleIndex + 1, 3) - 0.5
      camera.setViewOffset(this.bufferSize.x, this.bufferSize.y, jx, jy, this.bufferSize.x, this.bufferSize.y)
    }
    this.composer.render()
    if (jitter) camera.clearViewOffset()
  }

  dispose(): void {
    this.composer.dispose()
    this.accumulate.dispose()
    this.bloom.dispose()
  }
}
