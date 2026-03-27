# Save EPUBs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist EPUB files server-side (auto-saved on upload and Calibre download) so users can re-open them from the library without re-uploading.

**Architecture:** Extend the existing `books` table with an `epub_filename` column. A book row can have an EPUB, an XTC, or both. New API endpoints handle EPUB upload and download. The client auto-saves EPUBs after load, and the library UI shows EPUB/XTC badges with an "Open" action.

**Tech Stack:** Next.js 16 (App Router), better-sqlite3, React 19, TypeScript, shadcn/ui

---

### Task 1: Add `epub_filename` column to DB and new DB functions

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add migration for `epub_filename` column**

After the `CREATE TABLE IF NOT EXISTS books` block in `src/lib/db.ts`, add a migration that adds the column if it doesn't exist. Also make the existing `filename` column nullable (it's currently `NOT NULL`, but EPUB-only rows won't have an XTC filename).

Add this code right after the `CREATE TABLE IF NOT EXISTS calibre_config` block (after line 38):

```typescript
// Migration: add epub_filename column and make filename nullable
const hasEpubFilename = db.prepare(
  `SELECT COUNT(*) as cnt FROM pragma_table_info('books') WHERE name = 'epub_filename'`
).get() as { cnt: number }
if (hasEpubFilename.cnt === 0) {
  db.exec(`ALTER TABLE books ADD COLUMN epub_filename TEXT`)
}
```

Also change the `CREATE TABLE` statement to make `filename` nullable — change `filename TEXT NOT NULL` to `filename TEXT` on line 22.

- [ ] **Step 2: Update the `Book` interface and `BookListItem` type**

In the `Book` interface (line 40), change `filename` to allow null and add `epub_filename`:

```typescript
export interface Book {
  id: string
  title: string
  author: string | null
  filename: string | null
  original_epub_name: string | null
  file_size: number | null
  cover_thumbnail: Buffer | null
  created_at: string
  device_type: string | null
  epub_filename: string | null
}
```

- [ ] **Step 3: Update the `list` statement to include `epub_filename`**

Change the `list` prepared statement (line 59) to include `epub_filename`:

```typescript
list: db.prepare(`
  SELECT id, title, author, filename, original_epub_name, file_size, created_at, device_type, epub_filename
  FROM books ORDER BY created_at DESC
`),
```

- [ ] **Step 4: Add new prepared statements**

Add these to the `stmts` object:

```typescript
insertEpub: db.prepare(`
  INSERT INTO books (id, title, author, epub_filename, original_epub_name, file_size, cover_thumbnail)
  VALUES (@id, @title, @author, @epub_filename, @original_epub_name, @file_size, @cover_thumbnail)
`),
findByOriginalEpub: db.prepare(`
  SELECT * FROM books WHERE original_epub_name = @original_epub_name AND file_size = @file_size LIMIT 1
`),
linkXtcToBook: db.prepare(`
  UPDATE books SET filename = @filename, device_type = @device_type WHERE id = @id
`),
```

- [ ] **Step 5: Add new exported functions**

Add these after the existing `getLibraryDir` function:

```typescript
export function insertEpubBook(book: {
  id: string
  title: string
  author: string | null
  epub_filename: string
  original_epub_name: string | null
  file_size: number
  cover_thumbnail: Buffer | null
}) {
  stmts.insertEpub.run(book)
}

export function findByOriginalEpub(originalName: string, fileSize: number): Book | undefined {
  return stmts.findByOriginalEpub.get({
    original_epub_name: originalName,
    file_size: fileSize,
  }) as Book | undefined
}

export function linkXtcToBook(id: string, filename: string, deviceType: string | null) {
  stmts.linkXtcToBook.run({ id, filename, device_type: deviceType })
}
```

- [ ] **Step 6: Verify the app still compiles**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds (or only pre-existing warnings).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add epub_filename column and DB functions for EPUB storage"
```

---

### Task 2: Create `POST /api/library/epub` endpoint

**Files:**
- Create: `src/app/api/library/epub/route.ts`

- [ ] **Step 1: Create the EPUB upload endpoint**

Create `src/app/api/library/epub/route.ts`:

```typescript
import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"
import { insertEpubBook, findByOriginalEpub, getLibraryDir } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string | null
    const author = formData.get("author") as string | null
    const originalEpubName = formData.get("original_epub_name") as string | null
    const coverFile = formData.get("cover") as File | null

    if (!file || !title) {
      return Response.json({ error: "file and title are required" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // Dedup check: same original name + file size = same EPUB
    if (originalEpubName) {
      const existing = findByOriginalEpub(originalEpubName, arrayBuffer.byteLength)
      if (existing) {
        return Response.json({ id: existing.id, title: existing.title, author: existing.author, isExisting: true })
      }
    }

    const id = randomUUID()
    const epubFilename = `${id}.epub`
    const filePath = path.join(getLibraryDir(), epubFilename)

    fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

    let coverBuffer: Buffer | null = null
    if (coverFile) {
      const coverData = await coverFile.arrayBuffer()
      coverBuffer = Buffer.from(coverData)
    }

    insertEpubBook({
      id,
      title,
      author,
      epub_filename: epubFilename,
      original_epub_name: originalEpubName,
      file_size: arrayBuffer.byteLength,
      cover_thumbnail: coverBuffer,
    })

    return Response.json({ id, title, author, isExisting: false })
  } catch (err) {
    console.error("EPUB upload error:", err)
    return Response.json({ error: "Upload failed" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/library/epub/route.ts
git commit -m "feat: add POST /api/library/epub endpoint for EPUB uploads"
```

---

### Task 3: Add `GET /api/library/{id}/epub` endpoint

**Files:**
- Modify: `src/app/api/library/[id]/route.ts`

- [ ] **Step 1: Add the EPUB download handler**

We need a new route at `src/app/api/library/[id]/epub/route.ts`. Create it:

**Files:**
- Create: `src/app/api/library/[id]/epub/route.ts`

```typescript
import path from "path"
import fs from "fs"
import { getBook, getLibraryDir } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const book = getBook(id)
  if (!book || !book.epub_filename) {
    return Response.json({ error: "EPUB not found" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.epub_filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "EPUB file not found on disk" }, { status: 404 })
  }

  const data = fs.readFileSync(filePath)
  const safeName = (book.original_epub_name || book.title || "book")
    .replace(/[^a-zA-Z0-9\u0080-\uFFFF._-]/g, "_")
    .substring(0, 80)
  const filename = safeName.endsWith(".epub") ? safeName : `${safeName}.epub`

  return new Response(data, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(data.byteLength),
    },
  })
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/library/[id]/epub/route.ts
git commit -m "feat: add GET /api/library/{id}/epub endpoint"
```

---

### Task 4: Modify existing library API routes

**Files:**
- Modify: `src/app/api/library/route.ts`
- Modify: `src/app/api/library/[id]/route.ts`

- [ ] **Step 1: Update `POST /api/library` to link XTC to existing EPUB rows**

In `src/app/api/library/route.ts`, update the import and POST handler. Add `findByOriginalEpub` and `linkXtcToBook` to the import, then add logic to check for existing EPUB rows before creating new ones.

Replace the import on line 5:

```typescript
import { insertBook, listBooks, getLibraryDir, findByOriginalEpub, linkXtcToBook } from "@/lib/db"
```

Replace the full POST handler body (everything inside the `try` block) with:

```typescript
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = formData.get("title") as string | null
    const author = formData.get("author") as string | null
    const deviceType = formData.get("device_type") as string | null
    const originalEpubName = formData.get("original_epub_name") as string | null
    const coverFile = formData.get("cover") as File | null
    const epubBookId = formData.get("epub_book_id") as string | null

    if (!file || !title) {
      return Response.json({ error: "file and title are required" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // Check if we should link to an existing EPUB row
    let id = epubBookId ?? undefined
    if (!id && originalEpubName) {
      const existing = findByOriginalEpub(originalEpubName, arrayBuffer.byteLength)
      if (existing) id = existing.id
    }

    if (id) {
      // Link XTC to existing book row
      const filename = `${id}.xtc`
      const filePath = path.join(getLibraryDir(), filename)
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer))
      linkXtcToBook(id, filename, deviceType)
      return Response.json({ id, title, author })
    }

    // No existing row — create new (legacy path)
    id = randomUUID()
    const filename = `${id}.xtc`
    const filePath = path.join(getLibraryDir(), filename)
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
```

- [ ] **Step 2: Update DELETE handler to also remove EPUB files**

In `src/app/api/library/[id]/route.ts`, the DELETE handler currently only deletes the XTC file. Update it to also delete the EPUB file if present.

Update the import on line 3 to also bring in `getLibraryDir` (already imported) — no change needed there.

Replace the DELETE handler body (lines 37-57) with:

```typescript
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const book = getBook(id)
  if (!book) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  // Delete XTC file if present
  if (book.filename) {
    const xtcPath = path.join(getLibraryDir(), book.filename)
    if (fs.existsSync(xtcPath)) fs.unlinkSync(xtcPath)
  }

  // Delete EPUB file if present
  if (book.epub_filename) {
    const epubPath = path.join(getLibraryDir(), book.epub_filename)
    if (fs.existsSync(epubPath)) fs.unlinkSync(epubPath)
  }

  deleteBook(id)
  return Response.json({ ok: true })
}
```

Also update the GET handler to handle the case where `book.filename` might be null (EPUB-only rows). The current code on line 19 does `book.filename` without a null check. Add a guard:

```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const book = getBook(id)
  if (!book || !book.filename) {
    return Response.json({ error: "XTC not found" }, { status: 404 })
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
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/library/route.ts src/app/api/library/[id]/route.ts
git commit -m "feat: link XTC to existing EPUB rows, delete both files on remove"
```

---

### Task 5: Add `FileInfo.libraryBookId` and auto-save EPUB on upload

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Extend the `FileInfo` interface**

In `src/app/page.tsx`, add `libraryBookId` to the `FileInfo` interface (line 101):

```typescript
interface FileInfo {
  file: File
  name: string
  loaded: boolean
  libraryBookId?: string
}
```

- [ ] **Step 2: Create the `saveEpubToLibrary` helper function**

Add this function after the `saveToLibrary` function (after line 1182). This is a standalone helper that saves the raw EPUB file to the server:

```typescript
  const saveEpubToLibrary = useCallback(async (file: File, bookMeta: BookMetadata): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", bookMeta.title || "Untitled")
      formData.append("author", bookMeta.authors || "Unknown")
      formData.append("original_epub_name", file.name)

      // Capture cover thumbnail from the canvas
      const canvas = canvasRef.current
      if (canvas) {
        const scale = Math.min(200 / canvas.width, 300 / canvas.height)
        const thumbCanvas = document.createElement("canvas")
        thumbCanvas.width = Math.round(canvas.width * scale)
        thumbCanvas.height = Math.round(canvas.height * scale)
        const ctx = thumbCanvas.getContext("2d")!
        ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
        const blob = await new Promise<Blob | null>(r => thumbCanvas.toBlob(r, "image/jpeg", 0.7))
        if (blob) formData.append("cover", blob, "cover.jpg")
      }

      const res = await fetch("/api/library/epub", { method: "POST", body: formData })
      if (!res.ok) throw new Error("EPUB upload failed")
      const data = await res.json()
      return data.id as string
    } catch (err) {
      console.error("Auto-save EPUB error:", err)
      return null
    }
  }, [])
```

- [ ] **Step 3: Auto-save EPUB after `loadEpub` completes**

Modify the `loadEpub` function. After `setBookLoaded(true)` and `applySettings()` (line 828), add the auto-save call. The function needs to save the EPUB and store the returned ID in the file's state entry.

Add this block after `applySettings()` (line 828), still inside the `try` block:

```typescript
      // Auto-save EPUB to library
      const currentFile = filesRef.current[fileIdxRef.current]
      if (currentFile && !currentFile.libraryBookId) {
        saveEpubToLibrary(file, newMeta).then(bookId => {
          if (bookId) {
            setFiles(prev => prev.map(f =>
              f === currentFile ? { ...f, libraryBookId: bookId } : f
            ))
            filesRef.current = filesRef.current.map(f =>
              f === currentFile ? { ...f, libraryBookId: bookId } : f
            )
          }
        })
      }
```

Note: This is intentionally fire-and-forget (using `.then()` not `await`) so it doesn't block the UI. Errors are caught inside `saveEpubToLibrary`.

- [ ] **Step 4: Pass `libraryBookId` when saving XTC to library**

In the `saveToLibrary` function (line 1156), add the `epub_book_id` to the form data. After `formData.append("original_epub_name", ...)` (line 1164), add:

```typescript
    const currentFile = filesRef.current[fileIdxRef.current]
    if (currentFile?.libraryBookId) {
      formData.append("epub_book_id", currentFile.libraryBookId)
    }
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: auto-save EPUBs to library on upload"
```

---

### Task 6: Auto-save EPUB on Calibre download

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update `opdsImportBook` to save EPUB before loading**

Replace the `opdsImportBook` function (lines 933-949) with:

```typescript
  const opdsImportBook = useCallback(async (entry: OpdsEntry) => {
    if (!entry.epubPath) return
    setOpdsDownloading(prev => new Set(prev).add(entry.id))
    try {
      const file = await downloadEpub(entry.epubPath)

      // Auto-save EPUB to library with OPDS metadata
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", entry.title || "Untitled")
      formData.append("author", entry.authors?.join(", ") || "Unknown")
      formData.append("original_epub_name", file.name)

      // Fetch cover thumbnail from Calibre if available
      if (entry.thumbnailPath) {
        try {
          const coverRes = await fetch(`/api/calibre/download?path=${encodeURIComponent(entry.thumbnailPath)}`)
          if (coverRes.ok) {
            const coverBlob = await coverRes.blob()
            formData.append("cover", coverBlob, "cover.jpg")
          }
        } catch { /* cover is optional */ }
      }

      let bookId: string | null = null
      try {
        const res = await fetch("/api/library/epub", { method: "POST", body: formData })
        if (res.ok) {
          const data = await res.json()
          bookId = data.id
        }
      } catch (err) {
        console.error("Auto-save Calibre EPUB error:", err)
      }

      addFiles([file])

      // Store library book ID on the file entry
      if (bookId) {
        setTimeout(() => {
          setFiles(prev => prev.map(f =>
            f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
          ))
          filesRef.current = filesRef.current.map(f =>
            f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
          )
        }, 100)
      }
    } catch (err) {
      console.error("Calibre download failed:", err)
      setOpdsError(`Failed to download "${entry.title}"`)
    } finally {
      setOpdsDownloading(prev => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }, [addFiles])
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: auto-save Calibre-downloaded EPUBs to library"
```

---

### Task 7: Add Library tab with EPUB/XTC badges and Open action

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add library state variables**

Add these state variables after the OPDS state block (after line 599):

```typescript
  // Library state
  const [libraryBooks, setLibraryBooks] = useState<Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
```

- [ ] **Step 2: Add library fetch and open functions**

Add these functions after the `opdsDisconnect` function (after line 971):

```typescript
  // ── Library functions ──

  const fetchLibraryBooks = useCallback(async () => {
    setLibraryLoading(true)
    try {
      const res = await fetch("/api/library")
      if (res.ok) {
        const books = await res.json()
        setLibraryBooks(books)
      }
    } catch (err) {
      console.error("Failed to fetch library:", err)
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  const openLibraryEpub = useCallback(async (bookId: string, title: string) => {
    try {
      const res = await fetch(`/api/library/${bookId}/epub`)
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const file = new File([blob], `${title}.epub`, { type: "application/epub+zip" })
      addFiles([file])
      // Set the library book ID so XTC export links correctly
      setTimeout(() => {
        setFiles(prev => prev.map(f =>
          f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
        ))
        filesRef.current = filesRef.current.map(f =>
          f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
        )
      }, 100)
    } catch (err) {
      console.error("Failed to open library EPUB:", err)
    }
  }, [addFiles])

  const deleteLibraryBook = useCallback(async (bookId: string) => {
    try {
      const res = await fetch(`/api/library/${bookId}`, { method: "DELETE" })
      if (res.ok) {
        setLibraryBooks(prev => prev.filter(b => b.id !== bookId))
      }
    } catch (err) {
      console.error("Failed to delete library book:", err)
    }
  }, [])
```

- [ ] **Step 3: Add the Library tab trigger**

Add a 4th tab. Change the `TabsList` (lines 1411-1415) to include a Library tab:

```tsx
            <TabsList className="w-full !h-7 p-0.5">
              <TabsTrigger value={0} className="text-[12px]">Files</TabsTrigger>
              <TabsTrigger value={1} className="text-[12px]">Options</TabsTrigger>
              <TabsTrigger value={2} className="text-[12px]">Calibre</TabsTrigger>
              <TabsTrigger value={3} className="text-[12px]">Library</TabsTrigger>
            </TabsList>
```

Also update the `Tabs` `onValueChange` prop (line 1409) to fetch library books when switching to the Library tab:

```tsx
        <Tabs urlSync="tab" defaultValue={0} onValueChange={(v) => { if (v === 2 && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse(); if (v === 3) fetchLibraryBooks() }} className="flex-1 flex flex-col min-h-0 gap-0">
```

- [ ] **Step 4: Add the Library tab content**

Add this `TabsContent` block right before the closing `</Tabs>` tag (before line 2052):

```tsx
          <TabsContent value={3} className="flex-1 min-h-0 flex flex-col px-4 pt-3">
            {libraryLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              </div>
            ) : libraryBooks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[12px] text-muted-foreground">No saved books yet</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-1 pb-3">
                  {libraryBooks.map(book => (
                    <div key={book.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{book.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {book.author && <span className="text-[10px] text-muted-foreground truncate">{book.author}</span>}
                          <div className="flex gap-1">
                            {book.epub_filename && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">EPUB</span>
                            )}
                            {book.filename && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">XTC</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {book.epub_filename && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Open in converter" onClick={() => openLibraryEpub(book.id, book.title)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
                          </Button>
                        )}
                        {book.filename && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Download XTC" onClick={() => { window.location.href = `/api/library/${book.id}` }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => deleteLibraryBook(book.id)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Library tab with EPUB/XTC badges and Open/Delete actions"
```

---

### Task 8: Refresh library after save operations

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Refresh library books list after XTC save**

In the `handleSaveToLibrary` function, after the `setSaveMsg("Saved!")` line (line 1192), add a library refresh:

```typescript
      fetchLibraryBooks()
```

Similarly in `handleSaveAllToLibrary`, after the `setExportMsg(...)` success line (line 1220), add:

```typescript
      fetchLibraryBooks()
```

- [ ] **Step 2: Also refresh after EPUB auto-save completes**

In the `saveEpubToLibrary` function, before the `return data.id` line, add a library refresh:

```typescript
      fetchLibraryBooks()
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && npx next build 2>&1 | tail -20`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: refresh library list after save operations"
```

---

### Task 9: End-to-end manual verification

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/gego/conductor/workspaces/xtc/worcester && pnpm dev`

- [ ] **Step 2: Test upload auto-save**

1. Open the app in the browser
2. Upload an EPUB file via drag-and-drop or file picker
3. Wait for it to load in the converter
4. Switch to the Library tab — verify the EPUB appears with a blue "EPUB" badge

- [ ] **Step 3: Test XTC save linking**

1. With the same EPUB loaded, click "Save to Library"
2. After save completes, check the Library tab — the same book row should now show both "EPUB" and "XTC" badges (not a duplicate row)

- [ ] **Step 4: Test re-open from library**

1. Clear all files from the Files tab
2. Go to Library tab, hover over the book, click the book icon (Open in converter)
3. Verify the EPUB loads in the converter and renders correctly

- [ ] **Step 5: Test Calibre download auto-save**

1. Go to Calibre tab, browse and download a book
2. Check Library tab — verify it appears with "EPUB" badge

- [ ] **Step 6: Test delete**

1. In Library tab, hover over a book and click the trash icon
2. Verify the book disappears from the list

- [ ] **Step 7: Test deduplication**

1. Upload the same EPUB file again
2. Check Library tab — should still show only one entry, not a duplicate
