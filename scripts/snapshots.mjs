#!/usr/bin/env node
/**
 * Deterministic still frames of a chapter, for visual checks and before/after comparisons.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/snapshots.mjs --chapter scene2 --times 0,20,58 --out snapshots/scene2
 *   node scripts/snapshots.mjs --chapter scene3 --times 45.999 --interactive --width 1366 --height 768
 *   node scripts/snapshots.mjs --compare snapshots/before snapshots/after
 *
 * Uses the same export mode as the video (`?export`): the timeline is set to each time,
 * a number of accumulated samples are rendered, then the page is captured. `--interactive`
 * captures the real app instead (header, chapter bar and player controls shown, as a
 * student sees it): the chapter is opened through the dev handle `window.__app`, the
 * narration is sought, and the progressive renderer is left to settle. `--compare`
 * prints the SSIM of every pair of same-named PNGs (1 = identical), using ffmpeg-static.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import ffmpegPath from 'ffmpeg-static'

function parseArgs(argv) {
  const options = { chapter: 'scene1', times: [0], out: 'snapshots', url: 'http://localhost:5173/', samples: 24, width: 1600, height: 900, compare: null, interactive: false }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    const value = argv[i + 1]
    if (key === 'interactive') options.interactive = true
    else if (key === 'compare') options.compare = [argv[i + 1], argv[i + 2]], (i += 2)
    else if (key === 'times') options.times = value.split(',').map(Number), i++
    else if (['samples', 'width', 'height'].includes(key)) options[key] = Number(value), i++
    else if (['chapter', 'out', 'url'].includes(key)) options[key] = value, i++
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
  ].filter(Boolean)
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error('Chrome introuvable : définissez CHROME_PATH.')
  return found
}

function compare([dirA, dirB]) {
  const files = readdirSync(dirA).filter((name) => name.endsWith('.png') && existsSync(join(dirB, name)))
  for (const name of files) {
    const result = spawnSync(ffmpegPath, ['-i', join(dirA, name), '-i', join(dirB, name), '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8' })
    const match = /All:([\d.]+)/.exec(result.stderr)
    console.log(`${name}\tSSIM ${match ? match[1] : '?'}`)
  }
}

async function capture(options) {
  mkdirSync(resolve(options.out), { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: false,
    protocolTimeout: 120000,
    defaultViewport: { width: options.width, height: options.height, deviceScaleFactor: 1 },
    args: [
      '--ignore-gpu-blocklist',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
      `--window-size=${options.width},${options.height + 120}`,
    ],
  })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`)
    })
    if (options.interactive) {
      await page.goto(options.url, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => Boolean(window.__app), { timeout: 30000 })
      await page.evaluate((id) => window.__app.goToChapter(id), options.chapter)
      await page.waitForFunction(() => Boolean(window.__app.sceneManager.activeScene?.narration), { timeout: 60000 })
      const duration = await page.evaluate(() => window.__app.sceneManager.activeScene.narration.duration)
      for (const t of options.times) {
        await page.evaluate((seconds) => window.__app.sceneManager.activeScene.narration.seek(seconds), Math.min(t, duration))
        // Let the progressive renderer accumulate its still frames.
        await new Promise((done) => setTimeout(done, 2500))
        const file = resolve(options.out, `${options.chapter}-i${options.width}-${String(t).padStart(6, '0')}.png`)
        await page.screenshot({ path: file })
        console.log(file)
      }
    } else {
      await page.goto(`${options.url}?export`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => Boolean(window.__export), { timeout: 30000 })
      const duration = await page.evaluate((id) => window.__export.start(id), options.chapter)
      for (const t of options.times) {
        await page.evaluate((seconds, samples) => window.__export.frame(seconds, samples), Math.min(t, duration), options.samples)
        const file = resolve(options.out, `${options.chapter}-${String(t).padStart(6, '0')}.png`)
        await page.screenshot({ path: file })
        console.log(file)
      }
    }
    if (errors.length) console.log(`Console : ${errors.length} message(s)\n${errors.join('\n')}`)
    else console.log('Console : aucune erreur')
  } finally {
    await browser.close()
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.compare) compare(options.compare)
else
  capture(options).catch((error) => {
    console.error(error)
    process.exit(1)
  })
