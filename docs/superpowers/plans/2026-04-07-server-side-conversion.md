# Server-Side EPUB-to-XTC Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the XTC generation loop from the browser to a standalone server-side worker process, allowing users to close the browser tab while conversion continues.

**Architecture:** A new `conversion_jobs` SQLite table acts as a job queue. The Next.js API inserts jobs; a standalone Node.js worker script polls for pending jobs, runs CREngine WASM + `node-canvas` to render pages, and saves XTC files to the library. The client polls for progress via a simple GET endpoint.

**Tech Stack:** Node.js, CREngine WASM (Emscripten), `canvas` (node-canvas), better-sqlite3, Next.js API routes

---

## File Structure

### New files
- `src/lib/xtc-assembler.ts` — Pure function to assemble XTC/XTCH binary from page buffers + metadata. Extracted from `converter.tsx` lines 847-901.
- `src/lib/conversion-jobs.ts` — Database operations for the `conversion_jobs` table (insert, query, update status/progress). Separate from `db.ts` to keep concerns clear.
- `src/app/api/convert/route.ts` — `POST /api/convert` to submit a job.
- `src/app/api/convert/[jobId]/route.ts` — `GET /api/convert/[jobId]` to poll status.
- `src/worker/convert.ts` — Standalone worker script. Entry point: `npx tsx src/worker/convert.ts`.

### Modified files
- `src/lib/image-processing.ts` — Refactor `generateXtgData` and `generateXthData` to accept raw pixel data (`Uint8ClampedArray`, width, height) instead of `HTMLCanvasElement`.
- `src/lib/db.ts` — Add `conversion_jobs` table creation + migration.
- `src/components/converter/converter.tsx` — Replace `handleGenerateXtc` rendering loop with API call + polling. Add resume-on-mount logic.
- `src/lib/progress-bar.ts` — No changes needed (Canvas 2D API is `node-canvas` compatible).
- `package.json` — Add `canvas` dependency and `worker` script.
- `Dockerfile` — Add Cairo/Pango system deps for `node-canvas`, start worker alongside Next.js.

---

## Task 1: Add `canvas` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install node-canvas**

```bash
pnpm add canvas
```

- [ ] **Step 2: Verify it installed correctly**

```bash
node -e "const { createCanvas } = require('canvas'); const c = createCanvas(10, 10); console.log('OK:', c.width, c.height)"
```

Expected: `OK: 10 10`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add node-canvas for server-side rendering"
```

---

## Task 2: Refactor `generateXtgData` and `generateXthData` to accept raw pixel data

Currently these functions take `HTMLCanvasElement` and call `getImageData()` internally. Refactor them to accept `Uint8ClampedArray` + dimensions, making them usable in both browser and Node.js. Keep the old signatures as thin wrappers for backward compat during the transition.

**Files:**
- Modify: `src/lib/image-processing.ts`
- Modify: `src/components/converter/converter.tsx` (update call sites)

- [ ] **Step 1: Refactor `generateXtgData` to accept raw data**

In `src/lib/image-processing.ts`, change the existing `generateXtgData` function signature from `(canvas: HTMLCanvasElement, bits: number)` to `(data: Uint8ClampedArray, w: number, h: number, bits: number)`. Remove the canvas/ctx lines at the top:

```typescript
export function generateXtgData(data: Uint8ClampedArray, w: number, h: number, bits: number): ArrayBuffer {
  function writeHeader(view: DataView, dataSize: number, bitCode: number) {
    view.setUint8(0, 0x58); view.setUint8(1, 0x54); view.setUint8(2, 0x47); view.setUint8(3, 0x00)
    view.setUint16(4, w, true); view.setUint16(6, h, true)
    view.setUint8(8, 0); view.setUint8(9, bitCode); view.setUint32(10, dataSize, true)
  }

  if (bits === 1) {
    const bpr = (w + 7) >> 3, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 0)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 8) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 8, w); bx++) {
          if (data[pi] >= 128) byte |= (1 << (7 - (bx - x)))
          pi += 4
        }
        arr[ro + (x >> 3)] = byte
      }
    }
    return buf
  } else if (bits === 2) {
    const bpr = (w + 3) >> 2, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 1)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 4) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 4, w); bx++) {
          byte |= ((data[pi] >> 6) << ((3 - (bx - x)) * 2))
          pi += 4
        }
        arr[ro + (x >> 2)] = byte
      }
    }
    return buf
  } else {
    const bpr = (w + 1) >> 1, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 2)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 2) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 2, w); bx++) {
          byte |= ((data[pi] >> 4) << ((1 - (bx - x)) * 4))
          pi += 4
        }
        arr[ro + (x >> 1)] = byte
      }
    }
    return buf
  }
}
```

- [ ] **Step 2: Refactor `generateXthData` to accept raw data**

Same file. Change from `(canvas: HTMLCanvasElement)` to `(data: Uint8ClampedArray, w: number, h: number)`:

```typescript
export function generateXthData(data: Uint8ClampedArray, w: number, h: number): ArrayBuffer {
  const bpc = Math.ceil(h / 8), planeSize = bpc * w, ds = planeSize * 2
  const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)

  v.setUint8(0, 0x58); v.setUint8(1, 0x54); v.setUint8(2, 0x48); v.setUint8(3, 0x00)
  v.setUint16(4, w, true); v.setUint16(6, h, true)
  v.setUint8(8, 0); v.setUint8(9, 0); v.setUint32(10, ds, true)

  const p1 = 22, p2 = 22 + planeSize
  for (let x = w - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) {
      const gray = data[(y * w + x) * 4]
      const val = gray > 212 ? 0 : gray > 127 ? 2 : gray > 42 ? 1 : 3
      const colIdx = w - 1 - x, byteIdx = colIdx * bpc + Math.floor(y / 8), bitIdx = 7 - (y % 8)
      if ((val >> 1) & 1) arr[p1 + byteIdx] |= (1 << bitIdx)
      if (val & 1) arr[p2 + byteIdx] |= (1 << bitIdx)
    }
  }
  return buf
}
```

- [ ] **Step 3: Update call sites in `converter.tsx`**

In `converter.tsx` around line 835, the current call is:

```typescript
const pageData = isHQ ? generateXthData(finalCanvas) : generateXtgData(finalCanvas, 1)
```

Change to extract pixel data first:

```typescript
const finalCtx = finalCanvas.getContext("2d", { willReadFrequently: true })!
const finalPixels = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height)
const pageData = isHQ
  ? generateXthData(finalPixels.data, finalCanvas.width, finalCanvas.height)
  : generateXtgData(finalPixels.data, finalCanvas.width, finalCanvas.height, 1)
```

- [ ] **Step 4: Remove the `downloadFile` function**

Delete the `downloadFile` function from `image-processing.ts` (lines 159-166). It's a browser-only helper. Check that nothing imports it first:

```bash
grep -r "downloadFile" src/
```

If nothing else uses it, remove it. If something does, leave it.

- [ ] **Step 5: Verify the app still works**

```bash
pnpm build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-processing.ts src/components/converter/converter.tsx
git commit -m "refactor: make XTG/XTH generators accept raw pixel data instead of HTMLCanvasElement"
```

---

## Task 3: Extract XTC assembler into shared module

Extract the XTC file assembly logic (header, metadata, chapters, index, page data) from `converter.tsx` into a reusable pure function.

**Files:**
- Create: `src/lib/xtc-assembler.ts`
- Modify: `src/components/converter/converter.tsx` (import and use the new module)

- [ ] **Step 1: Create `src/lib/xtc-assembler.ts`**

```typescript
export interface XtcChapter {
  name: string
  startPage: number
  endPage: number
}

export interface AssembleXtcParams {
  pages: ArrayBuffer[]
  title: string
  author: string
  chapters: XtcChapter[]
  deviceWidth: number
  deviceHeight: number
  isHQ: boolean
}

export function assembleXtc(params: AssembleXtcParams): ArrayBuffer {
  const { pages, title, author, chapters, deviceWidth: dw, deviceHeight: dh, isHQ } = params
  const pageCount = pages.length

  const headerSize = 56
  const metadataSize = 256
  const chapterEntrySize = 96
  const indexEntrySize = 16
  const chapterCount = chapters.length

  let totalDataSize = 0
  for (const p of pages) totalDataSize += p.byteLength

  const metaOffset = headerSize
  const chapOffset = metaOffset + metadataSize
  const indexOffset = chapOffset + chapterCount * chapterEntrySize
  const dataOffset = indexOffset + pageCount * indexEntrySize
  const totalSize = dataOffset + totalDataSize

  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const arr = new Uint8Array(buf)

  // Header
  view.setUint8(0, 0x58); view.setUint8(1, 0x54); view.setUint8(2, 0x43)
  view.setUint8(3, isHQ ? 0x48 : 0x00)
  view.setUint16(4, 1, true); view.setUint16(6, pageCount, true)
  view.setUint8(8, 0); view.setUint8(9, 1); view.setUint8(10, 0)
  view.setUint8(11, chapterCount > 0 ? 1 : 0); view.setUint32(12, 1, true)

  view.setBigUint64(16, BigInt(metaOffset), true)
  view.setBigUint64(24, BigInt(indexOffset), true)
  view.setBigUint64(32, BigInt(dataOffset), true)
  view.setBigUint64(40, BigInt(0), true)
  view.setBigUint64(48, BigInt(chapOffset), true)

  // Metadata
  const enc = new TextEncoder()
  const titleBytes = enc.encode(title || "Untitled")
  const authorBytes = enc.encode(author || "Unknown")
  for (let i = 0; i < Math.min(titleBytes.length, 127); i++) arr[metaOffset + i] = titleBytes[i]
  for (let i = 0; i < Math.min(authorBytes.length, 63); i++) arr[metaOffset + 0x80 + i] = authorBytes[i]

  view.setUint32(metaOffset + 0xF0, Math.floor(Date.now() / 1000), true)
  view.setUint16(metaOffset + 0xF4, 0, true)
  view.setUint16(metaOffset + 0xF6, chapterCount, true)

  // Chapter index
  for (let i = 0; i < chapters.length; i++) {
    const co = chapOffset + i * chapterEntrySize
    const nb = enc.encode(chapters[i].name)
    for (let j = 0; j < Math.min(nb.length, 79); j++) arr[co + j] = nb[j]
    view.setUint16(co + 0x50, chapters[i].startPage + 1, true)
    view.setUint16(co + 0x52, chapters[i].endPage + 1, true)
  }

  // Page index
  let absOff = dataOffset
  for (let i = 0; i < pageCount; i++) {
    const iea = indexOffset + i * indexEntrySize
    view.setBigUint64(iea, BigInt(absOff), true)
    view.setUint32(iea + 8, pages[i].byteLength, true)
    view.setUint16(iea + 12, dw, true); view.setUint16(iea + 14, dh, true)
    absOff += pages[i].byteLength
  }

  // Page data
  let wo = dataOffset
  for (let i = 0; i < pageCount; i++) {
    arr.set(new Uint8Array(pages[i]), wo)
    wo += pages[i].byteLength
  }

  return buf
}
```

- [ ] **Step 2: Update `converter.tsx` to use `assembleXtc`**

Import the new module at the top of `converter.tsx`:

```typescript
import { assembleXtc } from "@/lib/xtc-assembler"
```

In `handleGenerateXtc`, replace lines 847-901 (the entire XTC assembly block starting with `const headerSize = 56` through the page data copy loop ending with `wo += pageBuffers[i].byteLength`) with:

```typescript
      const buf = assembleXtc({
        pages: pageBuffers,
        title: metaRef.current.title || "Untitled",
        author: metaRef.current.authors || "Unknown",
        chapters,
        deviceWidth: dw,
        deviceHeight: dh,
        isHQ,
      })
```

- [ ] **Step 3: Verify the build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/xtc-assembler.ts src/components/converter/converter.tsx
git commit -m "refactor: extract XTC assembler into shared module"
```

---

## Task 4: Add `conversion_jobs` table and DB operations

**Files:**
- Modify: `src/lib/db.ts` (add table creation)
- Create: `src/lib/conversion-jobs.ts` (job CRUD operations)

- [ ] **Step 1: Add table creation to `db.ts`**

Add after the existing `CREATE TABLE` statements (after the `fonts` table, around line 57):

```typescript
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
```

Also export `db` and `DATA_DIR` so the jobs module can reuse the same database connection:

```typescript
export { db, DATA_DIR }
```

- [ ] **Step 2: Create `src/lib/conversion-jobs.ts`**

```typescript
import { db } from "@/lib/db"
import type { Settings } from "@/lib/settings-schema"

export interface ConversionJob {
  id: string
  book_id: string
  status: "pending" | "processing" | "completed" | "failed"
  progress: number
  total_pages: number
  settings: string
  device_type: string
  error: string | null
  created_at: string
  updated_at: string
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO conversion_jobs (id, book_id, status, settings, device_type)
    VALUES (@id, @book_id, 'pending', @settings, @device_type)
  `),
  getById: db.prepare(`
    SELECT * FROM conversion_jobs WHERE id = ?
  `),
  getActive: db.prepare(`
    SELECT * FROM conversion_jobs WHERE status IN ('pending', 'processing') ORDER BY created_at ASC
  `),
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
}

export function createJob(id: string, bookId: string, settings: Settings, deviceType: string): void {
  stmts.insert.run({ id, book_id: bookId, settings: JSON.stringify(settings), device_type: deviceType })
}

export function getJob(id: string): ConversionJob | undefined {
  return stmts.getById.get(id) as ConversionJob | undefined
}

export function getActiveJobs(): ConversionJob[] {
  return stmts.getActive.all() as ConversionJob[]
}

export function claimNextJob(): ConversionJob | undefined {
  return stmts.claimNext.get() as ConversionJob | undefined
}

export function updateJobProgress(id: string, progress: number, totalPages: number): void {
  stmts.updateProgress.run({ id, progress, total_pages: totalPages })
}

export function completeJob(id: string): void {
  stmts.complete.run(id)
}

export function failJob(id: string, error: string): void {
  stmts.fail.run({ id, error })
}
```

- [ ] **Step 3: Verify the build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/conversion-jobs.ts
git commit -m "feat: add conversion_jobs table and job management operations"
```

---

## Task 5: Create API routes for job submission and status polling

**Files:**
- Create: `src/app/api/convert/route.ts`
- Create: `src/app/api/convert/[jobId]/route.ts`

- [ ] **Step 1: Create `POST /api/convert`**

Create `src/app/api/convert/route.ts`:

```typescript
import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth } from "@/lib/auth"
import { getBook, getSettings, getLibraryDir } from "@/lib/db"
import { createJob } from "@/lib/conversion-jobs"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"
import fs from "fs"
import path from "path"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const { book_id } = await request.json()
    if (!book_id) {
      return Response.json({ error: "book_id is required" }, { status: 400 })
    }

    const book = getBook(book_id)
    if (!book) {
      return Response.json({ error: "Book not found" }, { status: 404 })
    }

    // Verify the EPUB file exists on disk
    if (!book.epub_filename) {
      return Response.json({ error: "Book has no EPUB file" }, { status: 400 })
    }
    const epubPath = path.join(getLibraryDir(), book.epub_filename)
    if (!fs.existsSync(epubPath)) {
      return Response.json({ error: "EPUB file not found on disk" }, { status: 404 })
    }

    const settings = getSettings() || DEFAULT_SETTINGS
    const jobId = randomUUID()

    createJob(jobId, book_id, settings, settings.deviceType)

    return Response.json({ job_id: jobId })
  } catch (err) {
    console.error("Convert submit error:", err)
    return Response.json({ error: "Failed to submit conversion job" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `GET /api/convert/[jobId]`**

Create `src/app/api/convert/[jobId]/route.ts`:

```typescript
import { requireAuth } from "@/lib/auth"
import { getJob } from "@/lib/conversion-jobs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { jobId } = await params
  const job = getJob(jobId)
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 })
  }

  return Response.json({
    status: job.status,
    progress: job.progress,
    totalPages: job.total_pages,
    error: job.error,
  })
}
```

- [ ] **Step 3: Verify the build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/convert/route.ts src/app/api/convert/\[jobId\]/route.ts
git commit -m "feat: add /api/convert routes for job submission and status polling"
```

---

## Task 6: Create the worker script

The main piece — a standalone Node.js script that polls for pending jobs, loads CREngine WASM, renders all pages, and produces XTC files.

**Files:**
- Create: `src/worker/convert.ts`

- [ ] **Step 1: Create the worker script**

Create `src/worker/convert.ts`:

```typescript
import path from "path"
import fs from "fs"
import { createCanvas, type Canvas, type CanvasRenderingContext2D } from "canvas"
import Database from "better-sqlite3"
import { settingsSchema, type Settings, DEFAULT_SETTINGS } from "../lib/settings-schema"
import { DEVICE_SPECS } from "../lib/config"
import { FONT_FAMILIES, ARABIC_FONTS, LANG_TO_PATTERN } from "../lib/config"
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

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")

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
    // Resize if dimensions changed
    renderer.resize(screenWidth, screenHeight)
    return
  }

  const crEnginePath = path.join(PUBLIC_DIR, "lib", "crengine.js")
  // Emscripten module needs to find the .wasm file
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
  // For built-in fonts, download from CDN and cache locally
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
  let epubBuffer = fs.readFileSync(epubPath)
  const modified = ensureCoverPage(epubBuffer)
  if (modified) epubBuffer = modified

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
  const tempCanvas = createCanvas(sw, sh) as unknown as Canvas
  const tempCtx = tempCanvas.getContext("2d") as unknown as CanvasRenderingContext2D

  const pageBuffers: ArrayBuffer[] = []

  for (let pg = 0; pg < pageCount; pg++) {
    renderer.goToPage(pg)
    renderer.renderCurrentPage()
    const buffer = renderer.getFrameBuffer()

    // Create ImageData manually (node-canvas uses createImageData)
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

    // Progress bar
    drawProgressIndicator(tempCtx as unknown as CanvasRenderingContext2D, settings, pg, pageCount, sw, sh, toc)

    // Rotation
    let finalCanvas: Canvas = tempCanvas
    let finalW = sw, finalH = sh
    const rot = settings.orientation
    if (rot !== 0) {
      const rc = createCanvas(dw, dh) as unknown as Canvas
      const rCtx = rc.getContext("2d") as unknown as CanvasRenderingContext2D
      if (rot === 90) { rCtx.translate(dw, 0); rCtx.rotate(Math.PI / 2) }
      else if (rot === 180) { rCtx.translate(dw, dh); rCtx.rotate(Math.PI) }
      else if (rot === 270) { rCtx.translate(0, dh); rCtx.rotate(3 * Math.PI / 2) }
      rCtx.drawImage(tempCanvas as unknown as CanvasImageSource, 0, 0)
      finalCanvas = rc
      finalW = dw; finalH = dh
    }

    // Generate page data
    const finalCtx = finalCanvas.getContext("2d") as unknown as CanvasRenderingContext2D
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
```

- [ ] **Step 2: Add worker script to `package.json`**

Add to the `scripts` section in `package.json`:

```json
"worker": "tsx src/worker/convert.ts"
```

- [ ] **Step 3: Verify the worker compiles**

```bash
npx tsx --check src/worker/convert.ts
```

Expected: No syntax or type errors. (The worker won't fully run without a database, but it should compile.)

- [ ] **Step 4: Commit**

```bash
git add src/worker/convert.ts package.json
git commit -m "feat: add standalone conversion worker script"
```

---

## Task 7: Update client-side `handleGenerateXtc` to use server-side conversion

Replace the rendering loop in `converter.tsx` with job submission + polling.

**Files:**
- Modify: `src/components/converter/converter.tsx`

- [ ] **Step 1: Replace `handleGenerateXtc` with server-side flow**

Replace the entire `handleGenerateXtc` callback (lines 762-932) with:

```typescript
  const handleGenerateXtc = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true; setProcessing(true)

    const toastId = toast.loading("Submitting conversion job...", { duration: Infinity })

    try {
      // Ensure the EPUB is saved to library
      const currentFile = filesRef.current[fileIdxRef.current]
      let bookId = currentFile?.libraryBookId
      if (!bookId) {
        toast.error("EPUB not saved to library yet. Please wait and try again.", { id: toastId, duration: 4000 })
        return
      }

      // Submit job
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error || "Failed to submit job")
      }
      const { job_id } = await res.json()

      // Poll for progress
      toast.loading("Waiting for worker...", { id: toastId })

      const poll = async (): Promise<void> => {
        const statusRes = await fetch(`/api/convert/${job_id}`)
        if (!statusRes.ok) throw new Error("Failed to check job status")
        const status = await statusRes.json()

        if (status.status === "completed") {
          const updatedBooks = await fetchLibraryBooks()
          const justSaved = updatedBooks?.[0]
          if (justSaved?.filename && sRef.current.deviceHost) {
            toast.success(`Conversion complete — ${status.totalPages} pages`, {
              id: toastId,
              duration: 8000,
              action: {
                label: "Send to device",
                onClick: () => sendToDevice(justSaved.id),
              },
            })
          } else {
            toast.success(`Conversion complete — ${status.totalPages} pages`, { id: toastId, duration: 4000 })
          }
          return
        }

        if (status.status === "failed") {
          throw new Error(status.error || "Conversion failed")
        }

        if (status.status === "processing" && status.totalPages > 0) {
          toast.loading(`Rendering page ${status.progress} of ${status.totalPages}...`, { id: toastId })
        }

        await new Promise(r => setTimeout(r, 500))
        return poll()
      }

      await poll()
    } catch (err) {
      console.error("Generate XTC error:", err)
      toast.error(err instanceof Error ? err.message : "Generation failed", { id: toastId, duration: 4000 })
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [fetchLibraryBooks, sendToDevice])
```

- [ ] **Step 2: Remove unused imports**

The rendering-loop imports are no longer needed in `handleGenerateXtc`. However, they're still used by `renderPreview`, so check before removing. The `assembleXtc` import can be removed since it's no longer used client-side (unless `renderPreview` or another function uses it — verify first).

Remove `assembleXtc` from imports if unused:

```bash
grep -n "assembleXtc" src/components/converter/converter.tsx
```

If only the import line, remove it.

- [ ] **Step 3: Add resume-on-mount logic**

Add a `useEffect` that checks for active jobs on mount. Place it near the other initialization effects (after the WASM init effect, around line 970):

```typescript
  // Resume polling for any active conversion jobs on mount
  useEffect(() => {
    let cancelled = false
    async function checkActiveJobs() {
      try {
        // Check for active jobs by looking at recent job — simple approach
        // The server could expose a GET /api/convert?active=true endpoint,
        // but for now we store the job ID in sessionStorage
        const activeJobId = sessionStorage.getItem("xtc-active-job")
        if (!activeJobId) return

        const res = await fetch(`/api/convert/${activeJobId}`)
        if (!res.ok) { sessionStorage.removeItem("xtc-active-job"); return }
        const status = await res.json()

        if (status.status === "pending" || status.status === "processing") {
          processingRef.current = true; setProcessing(true)
          const toastId = toast.loading("Resuming conversion...", { duration: Infinity })

          const poll = async (): Promise<void> => {
            if (cancelled) return
            const statusRes = await fetch(`/api/convert/${activeJobId}`)
            if (!statusRes.ok) throw new Error("Failed to check job status")
            const s = await statusRes.json()

            if (s.status === "completed") {
              sessionStorage.removeItem("xtc-active-job")
              await fetchLibraryBooks()
              toast.success(`Conversion complete — ${s.totalPages} pages`, { id: toastId, duration: 4000 })
              return
            }
            if (s.status === "failed") {
              sessionStorage.removeItem("xtc-active-job")
              throw new Error(s.error || "Conversion failed")
            }
            if (s.totalPages > 0) {
              toast.loading(`Rendering page ${s.progress} of ${s.totalPages}...`, { id: toastId })
            }
            await new Promise(r => setTimeout(r, 500))
            return poll()
          }

          try {
            await poll()
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Conversion failed", { id: toastId, duration: 4000 })
          } finally {
            processingRef.current = false; setProcessing(false)
          }
        } else {
          sessionStorage.removeItem("xtc-active-job")
        }
      } catch { /* ignore */ }
    }
    checkActiveJobs()
    return () => { cancelled = true }
  }, [fetchLibraryBooks])
```

Also, in `handleGenerateXtc`, after receiving the `job_id`, store it:

```typescript
sessionStorage.setItem("xtc-active-job", job_id)
```

And on completion/failure, remove it:

```typescript
sessionStorage.removeItem("xtc-active-job")
```

- [ ] **Step 4: Verify the build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/converter/converter.tsx
git commit -m "feat: replace client-side XTC generation with server-side job submission and polling"
```

---

## Task 8: Update Dockerfile

**Files:**
- Modify: `Dockerfile`
- Modify: `package.json`

- [ ] **Step 1: Add `tsx` as a production dependency**

The worker runs TypeScript source via `tsx`. Add it to `dependencies` (not `devDependencies`) so it's available in the production image:

```bash
pnpm add tsx
```

- [ ] **Step 2: Add Cairo/Pango system dependencies to Dockerfile**

In the runner stage, before the `COPY --from=builder` lines, add:

```dockerfile
RUN apk add --no-cache cairo pango libjpeg-turbo giflib
```

These are the runtime libraries that `node-canvas` needs (not the `-dev` build variants).

- [ ] **Step 3: Copy worker source and shared libs into the production image**

After the existing `COPY --from=builder` lines in the runner stage, add:

```dockerfile
# Copy conversion worker source + shared libs (run via tsx)
COPY --from=builder /app/src/worker ./src/worker
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules/canvas ./node_modules/canvas
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
```

The `tsconfig.json` is needed so `tsx` can resolve `@/*` path aliases used by the shared `src/lib/` modules.

- [ ] **Step 4: Update entrypoint to start both processes**

Replace the entrypoint script:

```dockerfile
COPY <<'EOF' /entrypoint.sh
#!/bin/sh
chown -R nextjs:nodejs /data
su-exec nextjs npx tsx src/worker/convert.ts &
exec su-exec nextjs node server.js
EOF
```

The worker runs in the background (`&`). The main process is `node server.js` (Next.js). If either crashes, the container stops.

- [ ] **Step 5: Verify Docker builds**

```bash
docker build -t xtc-test .
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile package.json pnpm-lock.yaml
git commit -m "feat: update Docker image with node-canvas deps and conversion worker"
```

---

## Task 9: End-to-end test

Manual integration test to verify the full flow.

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

In a separate terminal:

```bash
pnpm worker
```

- [ ] **Step 2: Load an EPUB in the browser**

Open the app, load an EPUB file. Verify:
- Preview works as before
- EPUB is auto-saved to library (check `data/library/` for `.epub` file)

- [ ] **Step 3: Click Generate XTC**

Click the Generate button. Verify:
- Toast shows "Submitting conversion job..."
- Toast updates to "Rendering page X of Y..."
- Worker terminal shows `[worker] Processing job ...`
- On completion, toast shows success
- Library tab shows the new XTC file

- [ ] **Step 4: Test close-and-resume**

1. Load another EPUB
2. Click Generate
3. While "Rendering page X of Y..." is showing, close the browser tab
4. Reopen the tab
5. Verify the toast resumes showing progress
6. Verify completion works

- [ ] **Step 5: Test error handling**

Delete an EPUB file from `data/library/` while no job is running, then try to convert it. Verify:
- Error is shown in the toast
- Worker doesn't crash

---

## Execution Notes

- **Tasks 1-5** can be done sequentially, each building on the previous.
- **Task 6** (worker script) is the largest task. It depends on Tasks 2, 3, and 4 being complete.
- **Task 7** (client changes) depends on Task 5 (API routes).
- **Task 8** (Docker) can be done after Task 6.
- **Task 9** (testing) requires all previous tasks.

The worker script (Task 6) uses relative imports (`../lib/config`) rather than `@/lib/config` path aliases because it runs outside Next.js. The `tsconfig.json` path alias `@/*` resolves via Next.js's bundler, but `tsx` running standalone needs relative paths. All shared modules (`image-processing.ts`, `progress-bar.ts`, `xtc-assembler.ts`, `config.ts`, `settings-schema.ts`, `types.ts`, `epub-cover-page.ts`) are imported with relative paths in the worker.

The `node-canvas` types may need `@types/canvas` or the types bundled with the package. If type errors arise, add `// @ts-expect-error` comments for the Canvas type casts, which are safe since `node-canvas` implements the same API.
