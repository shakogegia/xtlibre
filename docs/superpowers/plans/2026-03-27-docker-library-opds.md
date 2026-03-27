# Docker + XTC Library + OPDS Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dockerize the XTC Converter with server-side XTC file storage and an OPDS 1.2 catalog endpoint for Xteink e-readers.

**Architecture:** Next.js API routes handle file upload/download/delete and serve an OPDS Atom feed. SQLite (`better-sqlite3`) stores book metadata. XTC files live on disk in `/data/library/`. Docker packages everything with a volume mount for persistence. A Makefile wraps common Docker commands.

**Tech Stack:** Next.js 16 App Router API routes, better-sqlite3, Docker (multi-stage, standalone output), Makefile

---

## File Structure

```
src/
  lib/
    db.ts                          — SQLite connection + schema init + query helpers
  app/
    api/
      library/
        route.ts                   — POST (upload XTC) + GET (list books)
        [id]/
          route.ts                 — GET (download XTC) + DELETE (remove book)
          cover/
            route.ts               — GET (serve cover thumbnail)
    opds/
      route.ts                     — GET (OPDS 1.2 Atom feed)
    page.tsx                       — Modified: add "Save to Library" buttons
Dockerfile                         — Multi-stage build
Makefile                           — build/run/stop/logs/publish/clean
.dockerignore                      — Exclude node_modules, .next, .git, etc.
next.config.ts                     — Modified: add output: "standalone"
package.json                       — Modified: add better-sqlite3 dependency
```

---

### Task 1: Add better-sqlite3 and configure standalone output

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install better-sqlite3**

```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: Set standalone output in next.config.ts**

Replace the contents of `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

`serverExternalPackages` tells Next.js not to bundle `better-sqlite3` (it has native bindings that can't be bundled).

- [ ] **Step 3: Add /data to .gitignore**

Append to `.gitignore`:

```
# library data
/data
```

- [ ] **Step 4: Verify build works**

```bash
pnpm build
```

Expected: Build succeeds with standalone output in `.next/standalone/`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts .gitignore
git commit -m "feat: add better-sqlite3 and configure standalone output for Docker"
```

---

### Task 2: Create SQLite database module

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create the database module**

Create `src/lib/db.ts`:

```typescript
import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const LIBRARY_DIR = path.join(DATA_DIR, "library")
const DB_PATH = path.join(DATA_DIR, "library.db")

// Ensure directories exist
fs.mkdirSync(LIBRARY_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    filename TEXT NOT NULL,
    original_epub_name TEXT,
    file_size INTEGER,
    cover_thumbnail BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    device_type TEXT
  )
`)

export interface Book {
  id: string
  title: string
  author: string | null
  filename: string
  original_epub_name: string | null
  file_size: number | null
  cover_thumbnail: Buffer | null
  created_at: string
  device_type: string | null
}

export type BookListItem = Omit<Book, "cover_thumbnail">

const stmts = {
  insert: db.prepare(`
    INSERT INTO books (id, title, author, filename, original_epub_name, file_size, cover_thumbnail, device_type)
    VALUES (@id, @title, @author, @filename, @original_epub_name, @file_size, @cover_thumbnail, @device_type)
  `),
  list: db.prepare(`
    SELECT id, title, author, filename, original_epub_name, file_size, created_at, device_type
    FROM books ORDER BY created_at DESC
  `),
  getById: db.prepare(`SELECT * FROM books WHERE id = ?`),
  deleteById: db.prepare(`DELETE FROM books WHERE id = ?`),
  getCover: db.prepare(`SELECT cover_thumbnail FROM books WHERE id = ?`),
}

export function insertBook(book: {
  id: string
  title: string
  author: string | null
  filename: string
  original_epub_name: string | null
  file_size: number
  cover_thumbnail: Buffer | null
  device_type: string | null
}) {
  stmts.insert.run(book)
}

export function listBooks(): BookListItem[] {
  return stmts.list.all() as BookListItem[]
}

export function getBook(id: string): Book | undefined {
  return stmts.getById.get(id) as Book | undefined
}

export function deleteBook(id: string): boolean {
  const result = stmts.deleteById.run(id)
  return result.changes > 0
}

export function getCover(id: string): Buffer | null {
  const row = stmts.getCover.get(id) as { cover_thumbnail: Buffer | null } | undefined
  return row?.cover_thumbnail ?? null
}

export function getLibraryDir(): string {
  return LIBRARY_DIR
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm build
```

Expected: Build succeeds (db.ts is server-only, used by API routes).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add SQLite database module for book library"
```

---

### Task 3: Create library API routes (upload + list)

**Files:**
- Create: `src/app/api/library/route.ts`

- [ ] **Step 1: Create the upload and list route**

Create `src/app/api/library/route.ts`:

```typescript
import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import { insertBook, listBooks, getLibraryDir } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string | null
    const author = formData.get("author") as string | null
    const deviceType = formData.get("device_type") as string | null
    const originalEpubName = formData.get("original_epub_name") as string | null
    const coverFile = formData.get("cover") as File | null

    if (!file || !title) {
      return Response.json({ error: "file and title are required" }, { status: 400 })
    }

    const id = randomUUID()
    const filename = `${id}.xtc`
    const filePath = path.join(getLibraryDir(), filename)

    const arrayBuffer = await file.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    let coverBuffer: Buffer | null = null
    if (coverFile) {
      const coverData = await coverFile.arrayBuffer()
      coverBuffer = Buffer.from(coverData)
    }

    insertBook({
      id,
      title,
      author,
      filename,
      original_epub_name: originalEpubName,
      file_size: arrayBuffer.byteLength,
      cover_thumbnail: coverBuffer,
      device_type: deviceType,
    })

    return Response.json({ id, title, author })
  } catch (err) {
    console.error("Library upload error:", err)
    return Response.json({ error: "Upload failed" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const books = listBooks()
    return Response.json(books)
  } catch (err) {
    console.error("Library list error:", err)
    return Response.json({ error: "Failed to list books" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/library/route.ts
git commit -m "feat: add library API routes for upload and list"
```

---

### Task 4: Create library item routes (download + delete)

**Files:**
- Create: `src/app/api/library/[id]/route.ts`

- [ ] **Step 1: Create download and delete route**

Create `src/app/api/library/[id]/route.ts`:

```typescript
import path from "path"
import fs from "fs"
import { getBook, deleteBook, getLibraryDir } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const book = getBook(id)
  if (!book) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "File not found on disk" }, { status: 404 })
  }

  const data = fs.readFileSync(filePath)
  const safeName = book.title.replace(/[^a-zA-Z0-9\u0080-\uFFFF._-]/g, "_").substring(0, 50)
  const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"

  return new Response(data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}${ext}"`,
      "Content-Length": String(data.byteLength),
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const book = getBook(id)
  if (!book) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.filename)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  deleteBook(id)
  return Response.json({ ok: true })
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/library/\[id\]/route.ts
git commit -m "feat: add library download and delete API routes"
```

---

### Task 5: Create cover thumbnail route

**Files:**
- Create: `src/app/api/library/[id]/cover/route.ts`

- [ ] **Step 1: Create cover route**

Create `src/app/api/library/[id]/cover/route.ts`:

```typescript
import { getCover } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cover = getCover(id)

  if (!cover) {
    return new Response(null, { status: 404 })
  }

  return new Response(cover, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/library/\[id\]/cover/route.ts
git commit -m "feat: add cover thumbnail API route"
```

---

### Task 6: Create OPDS feed route

**Files:**
- Create: `src/app/opds/route.ts`

- [ ] **Step 1: Create the OPDS route**

Create `src/app/opds/route.ts`:

```typescript
import { listBooks, type BookListItem } from "@/lib/db"

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function bookEntry(book: BookListItem, baseUrl: string): string {
  const acqHref = `${baseUrl}/api/library/${book.id}`
  const coverHref = `${baseUrl}/api/library/${book.id}/cover`

  return `
  <entry>
    <title>${escapeXml(book.title)}</title>
    <id>urn:uuid:${book.id}</id>
    <updated>${book.created_at}Z</updated>
    ${book.author ? `<author><name>${escapeXml(book.author)}</name></author>` : ""}
    <link rel="http://opds-spec.org/acquisition" href="${acqHref}" type="application/octet-stream"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${coverHref}" type="image/jpeg"/>
    ${book.device_type ? `<category term="${escapeXml(book.device_type)}" label="${escapeXml(book.device_type.toUpperCase())}"/>` : ""}
  </entry>`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const books = listBooks()
  const latestDate = books.length > 0 ? books[0].created_at + "Z" : new Date().toISOString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:xtc-library</id>
  <title>XTC Library</title>
  <updated>${latestDate}</updated>
  <author><name>XTC Converter</name></author>
  <link rel="self" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
${books.map((b) => bookEntry(b, baseUrl)).join("\n")}
</feed>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml;charset=utf-8",
    },
  })
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/opds/route.ts
git commit -m "feat: add OPDS 1.2 catalog feed endpoint"
```

---

### Task 7: Add "Save to Library" UI to page.tsx

**Files:**
- Modify: `src/app/page.tsx`

This task modifies the existing export button area (~lines 1685-1706) to add "Save to Library" and "Save All to Library" buttons. It also adds a helper function for uploading to the server.

- [ ] **Step 1: Add the saveToLibrary function**

Add this function inside the `EpubToXtcConverter` component (after the `handleExportAll` function, around line 1053):

```typescript
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

  const saveToLibrary = useCallback(async (xtcData: ArrayBuffer, bookMeta: BookMetadata, deviceType: string) => {
    const formData = new FormData()
    const ext = sRef.current.qualityMode === "hq" ? ".xtch" : ".xtc"
    const filename = (bookMeta.title || "book").replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, "_").substring(0, 50) + ext
    formData.append("file", new Blob([xtcData], { type: "application/octet-stream" }), filename)
    formData.append("title", bookMeta.title || "Untitled")
    formData.append("author", bookMeta.authors || "Unknown")
    formData.append("device_type", deviceType)
    formData.append("original_epub_name", filesRef.current[fileIdxRef.current]?.name || "")

    const res = await fetch("/api/library", { method: "POST", body: formData })
    if (!res.ok) throw new Error("Upload failed")
    return res.json()
  }, [])
```

- [ ] **Step 2: Add handleSaveToLibrary function**

Add this right after `saveToLibrary`:

```typescript
  const handleSaveToLibrary = useCallback(async () => {
    const ren = rendererRef.current, mod = moduleRef.current
    if (!ren || !mod || processingRef.current) return
    processingRef.current = true; setProcessing(true); setShowExport(true); setSaving(true)

    try {
      // Reuse the same export logic but capture the buffer instead of downloading
      const settings = sRef.current
      const bits = settings.qualityMode === "hq" ? 2 : 1
      const isHQ = settings.qualityMode === "hq"
      const pageCount = ren.getPageCount()
      const { screenWidth: sw, screenHeight: sh, deviceWidth: dw, deviceHeight: dh } = screenDimsRef.current

      const chapters: { name: string; startPage: number; endPage: number }[] = []
      function extractChapters(items: TocItem[]) {
        for (const item of items) {
          chapters.push({ name: item.title.substring(0, 79), startPage: Math.max(0, Math.min(item.page, pageCount - 1)), endPage: -1 })
          if (item.children?.length) extractChapters(item.children)
        }
      }
      extractChapters(tocRef.current)
      chapters.sort((a, b) => a.startPage - b.startPage)

      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = sw; tempCanvas.height = sh
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true })!

      const pageBuffers: ArrayBuffer[] = []
      let totalDataSize = 0

      for (let pg = 0; pg < pageCount; pg++) {
        const pct = Math.round((pg / pageCount) * 100)
        setExportPct(pct); setExportMsg(<>Rendering page <span className="font-mono">{pg + 1}</span> of <span className="font-mono">{pageCount}</span>...</>)

        ren.goToPage(pg); ren.renderCurrentPage()
        const buffer = ren.getFrameBuffer()
        const imageData = tempCtx.createImageData(sw, sh)
        imageData.data.set(buffer)
        tempCtx.putImageData(imageData, 0, 0)

        if (settings.enableDithering) {
          const img = tempCtx.getImageData(0, 0, sw, sh)
          applyDitheringSyncToData(img.data, sw, sh, bits, settings.ditherStrength, isHQ)
          tempCtx.putImageData(img, 0, 0)
        } else {
          const img = tempCtx.getImageData(0, 0, sw, sh)
          quantizeImageData(img.data, bits, isHQ)
          tempCtx.putImageData(img, 0, 0)
        }

        if (settings.enableNegative) {
          const img = tempCtx.getImageData(0, 0, sw, sh)
          applyNegativeToData(img.data)
          tempCtx.putImageData(img, 0, 0)
        }

        drawProgressIndicator(tempCtx, settings, pg, pageCount, sw, sh, tocRef.current)

        let finalCanvas: HTMLCanvasElement = tempCanvas
        const rot = settings.orientation
        if (rot !== 0) {
          const rc = document.createElement("canvas")
          rc.width = dw; rc.height = dh
          const rCtx = rc.getContext("2d")!
          if (rot === 90) { rCtx.translate(dw, 0); rCtx.rotate(Math.PI / 2) }
          else if (rot === 180) { rCtx.translate(dw, dh); rCtx.rotate(Math.PI) }
          else if (rot === 270) { rCtx.translate(0, dh); rCtx.rotate(3 * Math.PI / 2) }
          rCtx.drawImage(tempCanvas, 0, 0)
          finalCanvas = rc
        }

        const pageData = isHQ ? generateXthData(finalCanvas) : generateXtgData(finalCanvas, 1)
        pageBuffers.push(pageData)
        totalDataSize += pageData.byteLength

        if (pg % 10 === 0) await new Promise(r => setTimeout(r, 0))
      }

      for (let i = 0; i < chapters.length; i++) {
        chapters[i].endPage = i < chapters.length - 1 ? chapters[i + 1].startPage - 1 : pageCount - 1
        if (chapters[i].endPage < chapters[i].startPage) chapters[i].endPage = chapters[i].startPage
      }

      const headerSize = 56, metadataSize = 256, chapterEntrySize = 96, indexEntrySize = 16
      const chapterCount = chapters.length
      const metaOffset = headerSize
      const chapOffset = metaOffset + metadataSize
      const indexOffset = chapOffset + chapterCount * chapterEntrySize
      const dataOffset = indexOffset + pageCount * indexEntrySize
      const totalSize = dataOffset + totalDataSize

      const buf = new ArrayBuffer(totalSize)
      const view = new DataView(buf), arr = new Uint8Array(buf)

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

      const enc = new TextEncoder()
      const titleBytes = enc.encode(metaRef.current.title || "Untitled")
      const authorBytes = enc.encode(metaRef.current.authors || "Unknown")
      for (let i = 0; i < Math.min(titleBytes.length, 127); i++) arr[metaOffset + i] = titleBytes[i]
      for (let i = 0; i < Math.min(authorBytes.length, 63); i++) arr[metaOffset + 0x80 + i] = authorBytes[i]

      view.setUint32(metaOffset + 0xF0, Math.floor(Date.now() / 1000), true)
      view.setUint16(metaOffset + 0xF4, 0, true)
      view.setUint16(metaOffset + 0xF6, chapterCount, true)

      for (let i = 0; i < chapters.length; i++) {
        const co = chapOffset + i * chapterEntrySize
        const nb = enc.encode(chapters[i].name)
        for (let j = 0; j < Math.min(nb.length, 79); j++) arr[co + j] = nb[j]
        view.setUint16(co + 0x50, chapters[i].startPage + 1, true)
        view.setUint16(co + 0x52, chapters[i].endPage + 1, true)
      }

      let absOff = dataOffset
      for (let i = 0; i < pageCount; i++) {
        const iea = indexOffset + i * indexEntrySize
        view.setBigUint64(iea, BigInt(absOff), true)
        view.setUint32(iea + 8, pageBuffers[i].byteLength, true)
        view.setUint16(iea + 12, dw, true); view.setUint16(iea + 14, dh, true)
        absOff += pageBuffers[i].byteLength
      }

      let wo = dataOffset
      for (let i = 0; i < pageCount; i++) {
        arr.set(new Uint8Array(pageBuffers[i]), wo)
        wo += pageBuffers[i].byteLength
      }

      setExportMsg("Saving to library...")
      await saveToLibrary(buf, metaRef.current, settings.deviceType)
      setSaveMsg("Saved!")
      setExportMsg("Saved to library!")
      setExportPct(100)
      setTimeout(() => { setShowExport(false); setSaveMsg(""); setSaving(false) }, 2000)
    } catch (err) {
      console.error("Save to library error:", err)
      setExportMsg("Save failed!")
      setSaveMsg("")
      setTimeout(() => { setShowExport(false); setSaving(false) }, 2000)
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [saveToLibrary])
```

**Important note for implementor:** The XTC binary generation code above is duplicated from `handleExportXtc`. This is intentional for v1 — the alternative would be refactoring `handleExportXtc` to return the buffer instead of downloading it, but that changes existing behavior and touches tightly-coupled code. A later refactor can extract the shared XTC generation into a helper.

**Better alternative (recommended):** Instead of duplicating, modify `handleExportXtc` to accept a mode parameter and return the buffer. Change lines 876-1030 like this:

At line 876, change the signature:
```typescript
  const handleExportXtc = useCallback(async (internal?: boolean, returnBuffer?: boolean): Promise<ArrayBuffer | void> => {
```

At lines 1017-1019, replace the download + message with:
```typescript
      if (returnBuffer) return buf
      const ext = isHQ ? ".xtch" : ".xtc"
      const filename = (metaRef.current.title || "book").replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, "_").substring(0, 50) + ext
      downloadFile(buf, filename)
      setExportMsg(<>Done! <span className="font-mono">{totalTime}s</span> total (<span className="font-mono">{pageCount}</span> pages)</>)
      setExportPct(100)
      if (!internal) setTimeout(() => setShowExport(false), 2000)
```

Then `handleSaveToLibrary` becomes much simpler:

```typescript
  const handleSaveToLibrary = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true; setProcessing(true); setShowExport(true); setSaving(true)
    try {
      const buf = await handleExportXtc(true, true)
      if (!buf) throw new Error("Export returned no data")
      setExportMsg("Saving to library...")
      await saveToLibrary(buf as ArrayBuffer, metaRef.current, sRef.current.deviceType)
      setSaveMsg("Saved!")
      setExportMsg("Saved to library!")
      setExportPct(100)
      setTimeout(() => { setShowExport(false); setSaveMsg(""); setSaving(false) }, 2000)
    } catch (err) {
      console.error("Save to library error:", err)
      setExportMsg("Save failed!")
      setTimeout(() => { setShowExport(false); setSaving(false) }, 2000)
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [handleExportXtc, saveToLibrary])
```

Use this recommended approach.

- [ ] **Step 3: Add Save All to Library function**

Add right after `handleSaveToLibrary`:

```typescript
  const handleSaveAllToLibrary = useCallback(async () => {
    if (filesRef.current.length === 0 || processingRef.current) return
    processingRef.current = true; setProcessing(true); setShowExport(true); setSaving(true)
    const totalFiles = filesRef.current.length
    try {
      for (let fi = 0; fi < totalFiles; fi++) {
        setExportMsg(<>Processing file <span className="font-mono">{fi + 1}</span>/<span className="font-mono">{totalFiles}</span>...</>)
        setExportPct((fi / totalFiles) * 100)
        await loadEpub(filesRef.current[fi].file)
        setFileIdx(fi); fileIdxRef.current = fi
        const buf = await handleExportXtc(true, true)
        if (buf) {
          await saveToLibrary(buf as ArrayBuffer, metaRef.current, sRef.current.deviceType)
        }
      }
      setExportMsg(<>All <span className="font-mono">{totalFiles}</span> files saved to library!</>)
      setExportPct(100)
      setTimeout(() => { setShowExport(false); setSaveMsg(""); setSaving(false) }, 3000)
    } catch (err) {
      console.error("Save all error:", err)
      setExportMsg("Save failed!")
      setTimeout(() => { setShowExport(false); setSaving(false) }, 2000)
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [loadEpub, handleExportXtc, saveToLibrary])
```

- [ ] **Step 4: Add the Save to Library buttons in the UI**

Find the export buttons section (around lines 1685-1706). After the existing "Export All" button and before the closing `</div>` of the export section, add:

After line 1705 (`</Button>` closing Export All) and before line 1706 (`</div>`), insert:

```tsx
          <div className="flex gap-2 mt-1">
            <Button variant="outline" className="flex-1 h-7 text-[11px]" disabled={!bookLoaded || processing} onClick={handleSaveToLibrary}>
              {saving ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              ) : saveMsg ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
              )}
              {saveMsg || "Save to Library"}
            </Button>
            {files.length > 1 && (
              <Button variant="outline" className="h-7 text-[11px] px-2" disabled={processing} onClick={handleSaveAllToLibrary} title="Save All to Library">
                Save All
              </Button>
            )}
          </div>
```

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Manually test**

```bash
pnpm dev
```

1. Open http://localhost:3000
2. Upload an EPUB, convert it
3. Click "Save to Library"
4. Check http://localhost:3000/api/library returns the book in JSON
5. Check http://localhost:3000/opds returns OPDS XML with the book entry
6. Check http://localhost:3000/api/library/{id} downloads the file

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Save to Library buttons to converter UI"
```

---

### Task 8: Create Dockerfile and .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
.next
.git
.gitignore
*.md
data
.env*
.vercel
.DS_Store
docs
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Stage 3: Production image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data/library && \
    chown -R nextjs:nodejs /data

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy better-sqlite3 native binding
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY --from=builder /app/node_modules/prebuild-install ./node_modules/prebuild-install
COPY --from=builder /app/node_modules/node-gyp-build ./node_modules/node-gyp-build

USER nextjs

EXPOSE 3000

VOLUME /data

CMD ["node", "server.js"]
```

- [ ] **Step 3: Build the Docker image**

```bash
docker build -t xtc .
```

Expected: Build succeeds.

- [ ] **Step 4: Test run the container**

```bash
docker run --rm -p 3000:3000 -v xtc-data:/data xtc
```

Open http://localhost:3000, verify the app loads. Check http://localhost:3000/opds returns XML. Stop with Ctrl+C.

If `better-sqlite3` fails to load (native binding mismatch), the Dockerfile may need adjustment — the fix would be to install build tools in the runner stage and rebuild the binding. But alpine + node:22-alpine should work since `better-sqlite3` includes prebuilt binaries for alpine.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile for self-hosted deployment"
```

---

### Task 9: Create Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create the Makefile**

Create `Makefile`:

```makefile
IMAGE_NAME := xtc
CONTAINER_NAME := xtc
DOCKER_REPO ?= $(IMAGE_NAME)
PORT ?= 3000
VOLUME_NAME := xtc-data

.PHONY: dev build run stop logs push clean shell

## Development
dev:
	pnpm dev

## Docker
build:
	docker build -t $(IMAGE_NAME) .

run: build
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(PORT):3000 \
		-v $(VOLUME_NAME):/data \
		$(IMAGE_NAME)
	@echo "Running at http://localhost:$(PORT)"

stop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)

shell:
	docker exec -it $(CONTAINER_NAME) sh

push: build
	docker tag $(IMAGE_NAME) $(DOCKER_REPO):latest
	docker push $(DOCKER_REPO):latest

clean: stop
	-docker rmi $(IMAGE_NAME)
	-docker volume rm $(VOLUME_NAME)
```

- [ ] **Step 2: Test Makefile targets**

```bash
make build
make run
# verify at http://localhost:3000
make logs
# Ctrl+C to stop following logs
make stop
```

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat: add Makefile for Docker build, run, and publish"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Full Docker test**

```bash
make clean  # start fresh
make run
```

1. Open http://localhost:3000
2. Upload an EPUB
3. Convert and click "Save to Library"
4. Visit http://localhost:3000/opds — verify XML feed shows the book
5. Visit http://localhost:3000/api/library — verify JSON list
6. Click the acquisition link from OPDS to download the XTC
7. Delete via `curl -X DELETE http://localhost:3000/api/library/{id}`
8. Verify OPDS feed is now empty

- [ ] **Step 2: Verify volume persistence**

```bash
make stop
make run
# Visit http://localhost:3000/api/library — books should still be there
```

- [ ] **Step 3: Final commit if any fixes needed**

```bash
make stop
```
