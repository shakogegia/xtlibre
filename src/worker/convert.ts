import path from "path"
import fs from "fs"
import { createCanvas } from "canvas"
import Database from "better-sqlite3"
import { settingsSchema, type Settings, DEFAULT_SETTINGS } from "../lib/settings-schema"
import { DEVICE_SPECS, FONT_FAMILIES, ARABIC_FONTS } from "../lib/config"
import { applyDitheringSyncToData, quantizeImageData, applyNegativeToData, generateXtgData, generateXthData } from "../lib/image-processing"
import { drawProgressIndicator, getPatternForLang } from "../lib/progress-bar"
import { assembleXtc, type XtcChapter } from "../lib/xtc-assembler"
import { ensureCoverPage } from "../lib/epub-cover-page"
import type { TocItem } from "../lib/types"

// ── Config ──

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const LIBRARY_DIR = path.join(DATA_DIR, "library")
const DB_PATH = path.join(DATA_DIR, "library.db")
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..")
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public")
const POLL_INTERVAL = 500

// ── Database (own connection, separate from Next.js process) ──

fs.mkdirSync(LIBRARY_DIR, { recursive: true })
const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")

// Ensure conversion_jobs table exists (worker may start before Next.js)
db.exec(`
  CREATE TABLE IF NOT EXISTS conversion_jobs (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER NOT NULL DEFAULT 0,
    settings TEXT NOT NULL,
    device_type TEXT NOT NULL,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

interface JobRow {
  id: string
  book_id: string
  status: string
  progress: number
  total_pages: number
  settings: string
  device_type: string
  error: string | null
}

interface BookRow {
  id: string
  title: string
  author: string | null
  filename: string | null
  epub_filename: string | null
  original_epub_name: string | null
  file_size: number | null
  device_type: string | null
}

const stmts = {
  claimNext: db.prepare(`
    UPDATE conversion_jobs
    SET status = 'processing', updated_at = datetime('now')
    WHERE id = (SELECT id FROM conversion_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1)
    RETURNING *
  `),
  updateProgress: db.prepare(`
    UPDATE conversion_jobs SET progress = @progress, total_pages = @total_pages, updated_at = datetime('now')
    WHERE id = @id
  `),
  complete: db.prepare(`
    UPDATE conversion_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?
  `),
  fail: db.prepare(`
    UPDATE conversion_jobs SET status = 'failed', error = @error, updated_at = datetime('now') WHERE id = @id
  `),
  getBook: db.prepare(`SELECT * FROM books WHERE id = ?`),
  linkXtc: db.prepare(`
    UPDATE books SET filename = @filename, device_type = @device_type, file_size = @file_size WHERE id = @id
  `),
}

// ── CREngine WASM ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmModule: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let renderer: any = null

async function initCREngine(screenWidth: number, screenHeight: number): Promise<void> {
  if (wasmModule && renderer) {
    renderer.resize(screenWidth, screenHeight)
    return
  }

  const crEnginePath = path.join(PUBLIC_DIR, "lib", "crengine.js")
  const CREngine = require(crEnginePath)
  wasmModule = await CREngine({
    locateFile: (file: string) => path.join(PUBLIC_DIR, "lib", file),
    printErr: (msg: string) => {
      if (typeof msg === "string" && msg.includes("FT_New_Memory_Face failed")) {
        // Ignore font loading warnings
      } else {
        console.error("[crengine]", msg)
      }
    },
  })

  renderer = new wasmModule.EpubRenderer(screenWidth, screenHeight)
  if (renderer.initHyphenation) renderer.initHyphenation("/hyph")
}

// ── Font loading ──

const loadedFonts = new Set<string>()
const loadedPatterns = new Set<string>()

function loadFontFromFile(filePath: string, filename: string): boolean {
  try {
    const data = fs.readFileSync(filePath)
    const arr = new Uint8Array(data)
    const ptr = wasmModule.allocateMemory(arr.length)
    wasmModule.HEAPU8.set(arr, ptr)
    const result = renderer.registerFontFromMemory(ptr, arr.length, filename)
    wasmModule.freeMemory(ptr)
    return !!result
  } catch {
    return false
  }
}

async function loadFontFromUrl(url: string, filename: string): Promise<boolean> {
  const cacheDir = path.join(DATA_DIR, "font-cache")
  fs.mkdirSync(cacheDir, { recursive: true })
  const cachePath = path.join(cacheDir, filename)

  if (fs.existsSync(cachePath)) {
    return loadFontFromFile(cachePath, filename)
  }

  try {
    const resp = await fetch(url)
    if (!resp.ok) return false
    const data = Buffer.from(await resp.arrayBuffer())
    fs.writeFileSync(cachePath, data)
    return loadFontFromFile(cachePath, filename)
  } catch {
    return false
  }
}

async function loadFontFamily(familyName: string): Promise<boolean> {
  if (loadedFonts.has(familyName)) return true

  const family = FONT_FAMILIES[familyName]
  if (family) {
    const results = await Promise.all(family.variants.map(v => loadFontFromUrl(v.url, v.file)))
    if (results.some(r => r)) { loadedFonts.add(familyName); return true }
    return false
  }

  // Check custom fonts in DB
  const fontsDir = path.join(DATA_DIR, "fonts")
  const fontRows = db.prepare("SELECT id, name, filename FROM fonts WHERE name = ?").all(familyName) as { id: string; name: string; filename: string }[]
  for (const font of fontRows) {
    const fontPath = path.join(fontsDir, font.filename)
    if (fs.existsSync(fontPath) && loadFontFromFile(fontPath, font.filename)) {
      loadedFonts.add(familyName)
      return true
    }
  }

  return false
}

async function loadRequiredFonts(): Promise<void> {
  await loadFontFamily("Literata")
  for (const font of ARABIC_FONTS) await loadFontFromUrl(font.url, font.file)
  if (renderer.setFallbackFontFaces) renderer.setFallbackFontFaces("Literata;Noto Naskh Arabic")
}

function loadHyphenationPattern(langTag: string): void {
  const patternFile = getPatternForLang(langTag)
  if (loadedPatterns.has(patternFile)) return

  const patternPath = path.join(PUBLIC_DIR, "patterns", patternFile)
  if (!fs.existsSync(patternPath)) return

  try {
    const data = fs.readFileSync(patternPath)
    const arr = new Uint8Array(data)
    const ptr = wasmModule.allocateMemory(arr.length)
    wasmModule.HEAPU8.set(arr, ptr)
    const result = renderer.loadHyphenationPattern(ptr, arr.length, patternFile)
    wasmModule.freeMemory(ptr)
    if (result) {
      loadedPatterns.add(patternFile)
      renderer.initHyphenation("/hyph")
      renderer.activateHyphenationDict(patternFile)
    }
  } catch { /* ignore */ }
}

// ── Screen dimensions ──

function getScreenDimensions(deviceType: string, orientation: number) {
  const device = DEVICE_SPECS[deviceType as keyof typeof DEVICE_SPECS] || DEVICE_SPECS.x4
  const isLandscape = orientation === 90 || orientation === 270
  return {
    screenWidth: isLandscape ? device.height : device.width,
    screenHeight: isLandscape ? device.width : device.height,
    deviceWidth: device.width,
    deviceHeight: device.height,
  }
}

// ── Conversion ──

async function processJob(job: JobRow): Promise<void> {
  const settings: Settings = (() => {
    try { return settingsSchema.parse(JSON.parse(job.settings)) } catch { return DEFAULT_SETTINGS }
  })()

  const book = stmts.getBook.get(job.book_id) as BookRow | undefined
  if (!book || !book.epub_filename) throw new Error("Book or EPUB not found")

  const epubPath = path.join(LIBRARY_DIR, book.epub_filename)
  if (!fs.existsSync(epubPath)) throw new Error(`EPUB file not found: ${epubPath}`)

  // Read and optionally inject cover
  let epubBuffer: Buffer = fs.readFileSync(epubPath)
  const modified = ensureCoverPage(epubBuffer)
  if (modified) epubBuffer = Buffer.from(modified)

  const { screenWidth: sw, screenHeight: sh, deviceWidth: dw, deviceHeight: dh } = getScreenDimensions(settings.deviceType, settings.orientation)

  // Init CREngine
  await initCREngine(sw, sh)
  await loadRequiredFonts()

  // Load the requested font
  if (settings.fontFace && settings.fontFace !== "Literata") {
    await loadFontFamily(settings.fontFace)
  }

  // Load EPUB into renderer
  const epubData = new Uint8Array(epubBuffer)
  const ptr = wasmModule.allocateMemory(epubData.length)
  wasmModule.HEAPU8.set(epubData, ptr)
  const loaded = renderer.loadEpubFromMemory(ptr, epubData.length)
  wasmModule.freeMemory(ptr)
  if (!loaded) throw new Error("CREngine failed to load EPUB")

  // Apply settings to renderer
  renderer.setFontSize(settings.fontSize)
  if (renderer.setFontWeight) renderer.setFontWeight(settings.fontWeight)
  renderer.setInterlineSpace(settings.lineHeight)
  renderer.setMargins(settings.margin, settings.margin, settings.margin, settings.margin)
  renderer.setFontFace(settings.fontFace || "Literata")
  if (renderer.setTextAlign) renderer.setTextAlign(settings.textAlign)
  if (renderer.setWordSpacing) renderer.setWordSpacing(settings.wordSpacing)
  if (renderer.setIgnoreDocumentMargins) renderer.setIgnoreDocumentMargins(settings.ignoreDocMargins)
  if (renderer.setFontHinting) renderer.setFontHinting(settings.fontHinting)
  if (renderer.setFontAntialiasing) renderer.setFontAntialiasing(settings.fontAntialiasing)

  // Hyphenation
  if (settings.hyphenation === 2) {
    const info = renderer.getDocumentInfo()
    const lang = settings.hyphenationLang === "auto" ? (info?.language || "en") : settings.hyphenationLang
    loadHyphenationPattern(lang)
  }
  if (renderer.setHyphenation) renderer.setHyphenation(settings.hyphenation)

  // Force re-layout
  renderer.renderCurrentPage()

  const pageCount = renderer.getPageCount()
  const bits = settings.qualityMode === "hq" ? 2 : 1
  const isHQ = settings.qualityMode === "hq"

  // Extract chapters from TOC
  const toc: TocItem[] = (() => {
    try { return renderer.getToc() || [] } catch { return [] }
  })()

  const chapters: XtcChapter[] = []
  function extractChapters(items: TocItem[]) {
    for (const item of items) {
      chapters.push({ name: item.title.substring(0, 79), startPage: Math.max(0, Math.min(item.page, pageCount - 1)), endPage: -1 })
      if (item.children?.length) extractChapters(item.children)
    }
  }
  extractChapters(toc)
  chapters.sort((a, b) => a.startPage - b.startPage)

  // Update total pages
  stmts.updateProgress.run({ id: job.id, progress: 0, total_pages: pageCount })

  // Render all pages
  const tempCanvas = createCanvas(sw, sh)
  const tempCtx = tempCanvas.getContext("2d")

  const pageBuffers: ArrayBuffer[] = []

  for (let pg = 0; pg < pageCount; pg++) {
    renderer.goToPage(pg)
    renderer.renderCurrentPage()
    const buffer = renderer.getFrameBuffer()

    const imageData = tempCtx.createImageData(sw, sh)
    imageData.data.set(buffer)
    tempCtx.putImageData(imageData, 0, 0)

    // Dithering / quantization
    if (settings.enableDithering) {
      const img = tempCtx.getImageData(0, 0, sw, sh)
      applyDitheringSyncToData(img.data, sw, sh, bits, settings.ditherStrength, isHQ)
      tempCtx.putImageData(img, 0, 0)
    } else {
      const img = tempCtx.getImageData(0, 0, sw, sh)
      quantizeImageData(img.data, bits, isHQ)
      tempCtx.putImageData(img, 0, 0)
    }

    // Negative
    if (settings.enableNegative) {
      const img = tempCtx.getImageData(0, 0, sw, sh)
      applyNegativeToData(img.data)
      tempCtx.putImageData(img, 0, 0)
    }

    // Progress bar — node-canvas CanvasRenderingContext2D is compatible
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawProgressIndicator(tempCtx as any, settings, pg, pageCount, sw, sh, toc)

    // Rotation
    let finalW = sw, finalH = sh
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalCtx: any = tempCtx
    const rot = settings.orientation
    if (rot !== 0) {
      const rc = createCanvas(dw, dh)
      const rCtx = rc.getContext("2d")
      if (rot === 90) { rCtx.translate(dw, 0); rCtx.rotate(Math.PI / 2) }
      else if (rot === 180) { rCtx.translate(dw, dh); rCtx.rotate(Math.PI) }
      else if (rot === 270) { rCtx.translate(0, dh); rCtx.rotate(3 * Math.PI / 2) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rCtx.drawImage(tempCanvas as any, 0, 0)
      finalCtx = rCtx
      finalW = dw; finalH = dh
    }

    // Generate page data
    const finalPixels = finalCtx.getImageData(0, 0, finalW, finalH)
    const pageData = isHQ
      ? generateXthData(finalPixels.data, finalW, finalH)
      : generateXtgData(finalPixels.data, finalW, finalH, 1)
    pageBuffers.push(pageData)

    // Update progress every page
    stmts.updateProgress.run({ id: job.id, progress: pg + 1, total_pages: pageCount })
  }

  // Finalize chapter end pages
  for (let i = 0; i < chapters.length; i++) {
    chapters[i].endPage = i < chapters.length - 1 ? chapters[i + 1].startPage - 1 : pageCount - 1
    if (chapters[i].endPage < chapters[i].startPage) chapters[i].endPage = chapters[i].startPage
  }

  // Assemble XTC
  const xtcData = assembleXtc({
    pages: pageBuffers,
    title: book.title || "Untitled",
    author: book.author || "Unknown",
    chapters,
    deviceWidth: dw,
    deviceHeight: dh,
    isHQ,
  })

  // Save XTC file
  const ext = isHQ ? ".xtch" : ".xtc"
  const xtcFilename = `${book.id}${ext}`
  const xtcPath = path.join(LIBRARY_DIR, xtcFilename)
  fs.writeFileSync(xtcPath, Buffer.from(xtcData))

  // Update book record
  stmts.linkXtc.run({
    id: book.id,
    filename: xtcFilename,
    device_type: settings.deviceType,
    file_size: xtcData.byteLength,
  })

  console.log(`[worker] Completed: "${book.title}" — ${pageCount} pages, ${(xtcData.byteLength / 1024).toFixed(0)} KB`)
}

// ── Main loop ──

async function main() {
  console.log("[worker] Conversion worker started, polling for jobs...")

  while (true) {
    try {
      const job = stmts.claimNext.get() as JobRow | undefined
      if (job) {
        console.log(`[worker] Processing job ${job.id} for book ${job.book_id}`)
        try {
          await processJob(job)
          stmts.complete.run(job.id)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error"
          console.error(`[worker] Job ${job.id} failed:`, message)
          stmts.fail.run({ id: job.id, error: message })
        }
      }
    } catch (err) {
      console.error("[worker] Poll error:", err)
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
}

main()
