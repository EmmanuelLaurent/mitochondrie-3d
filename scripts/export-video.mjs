#!/usr/bin/env node
/**
 * Frame-by-frame MP4 export of the guided tour.
 *
 *   npm run build
 *   npm run export:video -- [--chapters scene1,scene2] [--fps 30] [--samples 6]
 *                           [--width 1920] [--height 1080] [--out export/visite-guidee.mp4]
 *
 * Serves dist/ with `vite preview`, opens it in Chrome (puppeteer-core, the locally
 * installed browser, with its GPU) in export mode (`?export`), then for every frame:
 * sets the timeline time, renders a few accumulated samples (anti-aliasing and soft
 * shadows, exactly like a still frame in the app), screenshots the page and pipes the
 * PNG into ffmpeg (ffmpeg-static). Deterministic: the same frames on every run.
 * Set CHROME_PATH if Chrome is not found automatically.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import ffmpegPath from 'ffmpeg-static'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const options = { fps: 30, samples: 6, width: 1920, height: 1080, out: 'export/visite-guidee.mp4', chapters: null, port: 4317, headless: false }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    const value = argv[i + 1]
    if (key === 'headless') options.headless = true
    else if (key === 'chapters') options.chapters = value.split(',').map((s) => s.trim()).filter(Boolean), i++
    else if (['fps', 'samples', 'width', 'height', 'port'].includes(key)) options[key] = Number(value), i++
    else if (key === 'out') options.out = value, i++
  }
  return options
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error('Chrome introuvable : définissez CHROME_PATH.')
  return found
}

function startPreview(port) {
  if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('dist/ manquant : lancez « npm run build » d\'abord.')
  const child = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error('vite preview ne démarre pas')), 30000)
    child.stdout.on('data', (chunk) => {
      const plain = String(chunk).replace(/\u001b\[[0-9;]*m/g, '')
      const match = /(http:\/\/localhost:\d+\/?)/.exec(plain)
      if (match) {
        clearTimeout(timeout)
        resolveUrl({ url: match[1], child })
      }
    })
    child.on('exit', (code) => reject(new Error(`vite preview s'est arrêté (${code})`)))
  })
}

function startEncoder(out, fps) {
  mkdirSync(dirname(resolve(root, out)), { recursive: true })
  const encoder = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    resolve(root, out),
  ], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((resolveDone, reject) => {
    encoder.on('exit', (code) => (code === 0 ? resolveDone() : reject(new Error(`ffmpeg a échoué (${code})`))))
  })
  const write = (buffer) =>
    new Promise((resolveWrite) => {
      if (encoder.stdin.write(buffer)) resolveWrite()
      else encoder.stdin.once('drain', resolveWrite)
    })
  return { write, end: () => { encoder.stdin.end(); return done } }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { url, child: preview } = await startPreview(options.port)
  console.log(`Aperçu servi sur ${url}`)
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: options.headless,
    protocolTimeout: 120000,
    defaultViewport: { width: options.width, height: options.height, deviceScaleFactor: 1 },
    args: [
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      // Keep rendering even when the window is hidden behind others (no throttling).
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
      `--window-size=${options.width},${options.height + 120}`,
    ],
  })
  console.log('Navigateur lancé')
  const encoder = startEncoder(options.out, options.fps)
  try {
    const page = await browser.newPage()
    page.on('pageerror', (error) => console.error('Erreur de page :', error.message))
    await page.goto(`${url}?export`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => Boolean(window.__export), { timeout: 30000 })
    console.log('Application prête')
    const available = await page.evaluate(() => window.__export.chapters)
    const chapters = options.chapters ?? available
    let total = 0
    for (const chapter of chapters) {
      if (!available.includes(chapter)) throw new Error(`Chapitre inconnu : ${chapter} (disponibles : ${available.join(', ')})`)
      const duration = await page.evaluate((id) => window.__export.start(id), chapter)
      console.log(`${chapter} : ${duration} s`)
      const frames = Math.ceil(duration * options.fps)
      const started = Date.now()
      for (let i = 0; i <= frames; i++) {
        await page.evaluate((t, samples) => window.__export.frame(t, samples), i / options.fps, options.samples)
        await encoder.write(await page.screenshot({ type: 'png', optimizeForSpeed: true }))
        if (i % options.fps === 0) {
          const elapsed = (Date.now() - started) / 1000
          process.stdout.write(`\r${chapter} : ${(i / options.fps).toFixed(0)} / ${duration.toFixed(0)} s (${elapsed.toFixed(0)} s écoulées)   `)
        }
      }
      total += frames + 1
      process.stdout.write('\n')
    }
    await encoder.end()
    console.log(`Vidéo écrite : ${options.out} (${total} images, ${options.fps} i/s)`)
  } finally {
    await browser.close()
    preview.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
