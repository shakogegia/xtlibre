# Library Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify library to a flat "Saved" list, replace export bar with a "Generate XTC" button in the preview area, show generation progress via Sonner toast, and filter OPDS to XTC-only books.

**Architecture:** Remove multi-file UI from library tab and export bar from sidebar. Move XTC generation trigger to the preview area (below page scrubber). Use Sonner toasts for generation progress. The `files[]` array stays internally but is capped to 1 entry.

**Tech Stack:** Next.js 16, React 19, Sonner, Tailwind CSS 4, shadcn/ui

---

### Task 1: Install Sonner and add Toaster to layout

**Files:**
- Modify: `package.json`
- Modify: `src/app/layout.tsx:22-48`

- [ ] **Step 1: Install sonner**

Run: `pnpm add sonner`
Expected: sonner added to dependencies

- [ ] **Step 2: Add Toaster component to root layout**

In `src/app/layout.tsx`, add the import and component:

```tsx
import { Toaster } from "sonner"
```

Add `<Toaster />` inside the `<body>` tag, after `<ThemeProvider>`:

```tsx
<body className="h-full overflow-hidden font-sans">
  <ThemeProvider>
    {children}
  </ThemeProvider>
  <Toaster position="bottom-right" richColors />
  <Analytics />
</body>
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/layout.tsx
git commit -m "feat: add sonner toast library and Toaster to layout"
```

---

### Task 2: Strip export bar from sidebar

**Files:**
- Modify: `src/components/converter/sidebar.tsx:1-164`
- Delete: `src/components/converter/export-bar.tsx`

- [ ] **Step 1: Remove ExportBar from sidebar**

In `src/components/converter/sidebar.tsx`:

Remove the `ExportBar` import:
```tsx
// DELETE this line:
import { ExportBar } from "@/components/converter/export-bar"
```

Remove all export-bar related props from `SidebarProps` interface (lines 72-83):
```tsx
// DELETE these lines from the interface:
  // Export bar
  bookLoaded: boolean
  processing: boolean
  showExport: boolean
  exportPct: number
  exportMsg: React.ReactNode
  saving: boolean
  saveMsg: string
  handleExportXtc: () => void
  handleExportAll: () => void
  handleSaveToLibrary: () => void
  handleSaveAllToLibrary: () => void
```

Remove the same props from the destructured function parameters (lines 103-105):
```tsx
// DELETE these from the destructuring:
  bookLoaded, processing, showExport, exportPct, exportMsg,
  saving, saveMsg, handleExportXtc, handleExportAll,
  handleSaveToLibrary, handleSaveAllToLibrary,
```

Remove the `<ExportBar ... />` JSX block (lines 155-161):
```tsx
// DELETE this entire block:
      <ExportBar
        bookLoaded={bookLoaded} processing={processing} files={files}
        showExport={showExport} exportPct={exportPct} exportMsg={exportMsg}
        saving={saving} saveMsg={saveMsg}
        handleExportXtc={handleExportXtc} handleExportAll={handleExportAll}
        handleSaveToLibrary={handleSaveToLibrary} handleSaveAllToLibrary={handleSaveAllToLibrary}
      />
```

- [ ] **Step 2: Delete export-bar.tsx**

Delete the file `src/components/converter/export-bar.tsx`.

- [ ] **Step 3: Verify build**

Run: `pnpm build` (may fail on converter.tsx still passing removed props — that's expected, will fix in Task 5)

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/sidebar.tsx
git rm src/components/converter/export-bar.tsx
git commit -m "feat: remove export bar from sidebar"
```

---

### Task 3: Simplify library tab — remove loaded files list

**Files:**
- Modify: `src/components/converter/library-tab.tsx:1-157`

- [ ] **Step 1: Remove loaded-files props and UI**

Replace the entire `library-tab.tsx` with the simplified version. Remove `files`, `fileIdx`, `switchToFile`, `removeFile`, `setFiles`, `filesRef`, `setBookLoaded` props. Keep upload area and saved section.

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface LibraryBook {
  id: string
  title: string
  author: string | null
  filename: string | null
  file_size: number | null
  created_at: string
  device_type: string | null
  epub_filename: string | null
}

interface LibraryTabProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void
  libraryBooks: LibraryBook[]
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  downloadXtc: (bookId: string) => void
  deleteLibraryBook: (bookId: string) => void
}

export function LibraryTab({
  fileInputRef, addFiles, dragOver, setDragOver,
  libraryBooks, libraryLoading, openLibraryEpub, downloadXtc, deleteLibraryBook,
}: LibraryTabProps) {
  return (
    <>
      {/* Upload area */}
      <div
        className={`group relative border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-all duration-200 mb-3 ${
          dragOver
            ? "border-primary bg-primary/5 shadow-[0_0_15px_-3px] shadow-primary/20"
            : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
      >
        <div className={`mx-auto w-8 h-8 mb-2 rounded-full flex items-center justify-center transition-colors ${
          dragOver ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground"
        }`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div className="text-xs font-medium">Drop EPUB files here</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">or click to browse</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = "" }}
        />
      </div>

      {/* Separator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saved</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* Library books */}
      {libraryLoading ? (
        <div className="flex items-center justify-center py-8">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </div>
      ) : libraryBooks.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-[12px] text-muted-foreground">No saved books yet</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-1 pb-3">
            {libraryBooks.map(book => (
              <div key={book.id} className="group/lib flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
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
                <div className="flex gap-1 opacity-0 group-hover/lib:opacity-100 transition-opacity">
                  {book.epub_filename && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Open in preview" onClick={() => openLibraryEpub(book.id, book.title)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
                    </Button>
                  )}
                  {book.filename && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Download XTC" onClick={() => downloadXtc(book.id)}>
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
    </>
  )
}
```

- [ ] **Step 2: Update sidebar to pass simplified props**

In `src/components/converter/sidebar.tsx`, update the `SidebarProps` interface — remove the loaded-files props:

```tsx
// DELETE these from SidebarProps:
  files: FileInfo[]
  fileIdx: number
  switchToFile: (index: number) => void
  removeFile: (index: number) => void
  setFiles: React.Dispatch<React.SetStateAction<FileInfo[]>>
  filesRef: React.MutableRefObject<FileInfo[]>
  setBookLoaded: (v: boolean) => void
```

Add `downloadXtc` prop:
```tsx
  downloadXtc: (bookId: string) => void
```

Remove those from the function destructuring and update the `<LibraryTab>` JSX:

```tsx
<LibraryTab
  fileInputRef={fileInputRef}
  addFiles={addFiles} dragOver={dragOver} setDragOver={setDragOver}
  libraryBooks={libraryBooks} libraryLoading={libraryLoading}
  openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
  deleteLibraryBook={deleteLibraryBook}
/>
```

Also remove the `FileInfo` import from `@/lib/types` if no longer used in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/library-tab.tsx src/components/converter/sidebar.tsx
git commit -m "feat: simplify library tab — remove loaded files list"
```

---

### Task 4: Add Generate XTC button to device preview

**Files:**
- Modify: `src/components/converter/device-preview.tsx:1-180`

- [ ] **Step 1: Add Generate XTC button below page scrubber**

Add new props to `DevicePreviewProps`:

```tsx
  processing: boolean
  handleGenerateXtc: () => void
```

Add the button below the page scrubber (after the `{pages > 1 && (` slider block, inside the `flex-col items-center gap-20` div):

```tsx
{/* Generate XTC button */}
<div className="flex items-center gap-3 px-1 w-full">
  <Button
    className="w-full h-8 text-[12px] font-medium"
    disabled={!bookLoaded || processing}
    onClick={handleGenerateXtc}
  >
    {processing ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    )}
    Generate XTC
  </Button>
</div>
```

Add `Button` import at the top:
```tsx
import { Button } from "@/components/ui/button"
```

- [ ] **Step 2: Commit**

```bash
git add src/components/converter/device-preview.tsx
git commit -m "feat: add Generate XTC button below page scrubber in preview"
```

---

### Task 5: Rewire converter.tsx — Sonner toasts, remove dead code, wire new props

**Files:**
- Modify: `src/components/converter/converter.tsx`

This is the largest task — it rewires the export flow to use Sonner toasts and removes multi-file / export-bar dead code.

- [ ] **Step 1: Add sonner import and replace export progress state with toast**

At the top of `converter.tsx`, add the import:
```tsx
import { toast } from "sonner"
```

- [ ] **Step 2: Remove dead state variables**

Remove these state declarations (they're no longer needed):
```tsx
// DELETE:
const [exportPct, setExportPct] = useState(0)
const [exportMsg, setExportMsg] = useState<React.ReactNode>("")
const [showExport, setShowExport] = useState(false)
const [saving, setSaving] = useState(false)
const [saveMsg, setSaveMsg] = useState("")
```

- [ ] **Step 3: Rewrite handleExportXtc to use toast and auto-save**

Replace `handleExportXtc` (lines 592-747). The new version:
- Shows a Sonner toast with progress that updates in-place
- After rendering, auto-saves XTC to library (merging the old "save to library" flow)
- Refreshes the library book list on completion

```tsx
const handleGenerateXtc = useCallback(async () => {
  const ren = rendererRef.current, mod = moduleRef.current
  if (!ren || !mod || processingRef.current) return
  processingRef.current = true; setProcessing(true)

  const toastId = toast.loading("Preparing...", { duration: Infinity })
  const startTime = performance.now()

  try {
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
      toast.loading(`Rendering page ${pg + 1} of ${pageCount}...`, { id: toastId })

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

    // Save XTC to library
    toast.loading("Saving to library...", { id: toastId })
    await saveToLibrary(buf, metaRef.current, settings.deviceType)
    await fetchLibraryBooks()

    // Restore preview to current page
    ren.goToPage(page)
    renderPreview()

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1)
    toast.success(`Generated ${pageCount} pages in ${totalTime}s`, { id: toastId, duration: 4000 })
  } catch (err) {
    console.error("Generate XTC error:", err)
    toast.error("Generation failed", { id: toastId, duration: 4000 })
  } finally {
    processingRef.current = false; setProcessing(false)
  }
}, [saveToLibrary, fetchLibraryBooks, page, renderPreview])
```

- [ ] **Step 4: Remove dead functions**

Delete these functions from converter.tsx (they are no longer called):
- `handleExportAll` (lines 750-770)
- `handleSaveToLibrary` (lines 808-828)
- `handleSaveAllToLibrary` (lines 830-856)

- [ ] **Step 5: Cap addFiles to single file**

Replace `addFiles` (lines 381-402) so it replaces the current file instead of appending:

```tsx
const addFiles = useCallback((newFiles: FileList | File[]) => {
  const epubs = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith(".epub"))
  if (epubs.length === 0) return
  const file = epubs[0]
  setFiles([{ file, name: file.name, loaded: false }])
  filesRef.current = [{ file, name: file.name, loaded: false }]
  setFileIdx(0)
  fileIdxRef.current = 0
  loadEpub(file)
}, [loadEpub])
```

- [ ] **Step 6: Add downloadXtc callback**

Add a simple callback for downloading XTC from library (used by the library tab's download button):

```tsx
const downloadXtc = useCallback((bookId: string) => {
  window.location.href = `/api/library/${bookId}`
}, [])
```

- [ ] **Step 7: Update Sidebar props in JSX**

Update the `<Sidebar>` JSX call (lines 1005-1033) to remove dead props and add new ones:

```tsx
<Sidebar
  initialTab={initialTab}
  fileInputRef={fileInputRef}
  addFiles={addFiles} dragOver={dragOver} setDragOver={setDragOver}
  s={s} meta={meta} toc={toc} customFontName={customFontName}
  update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
  flushReformat={flushReformat} flushRender={flushRender}
  handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
  handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
  handleCustomFont={handleCustomFont} fontInputRef={fontInputRef}
  renderPreview={renderPreview} rendererRef={rendererRef}
  calibreConnected={calibreConnected} opdsFeed={opdsFeed}
  opdsLoading={opdsLoading} opdsError={opdsError}
  opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
  opdsDownloading={opdsDownloading}
  setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
  setOpdsError={setOpdsError}
  opdsBrowse={opdsBrowse} opdsBack={opdsBack}
  opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
  libraryBooks={libraryBooks} libraryLoading={libraryLoading}
  openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
  deleteLibraryBook={deleteLibraryBook}
/>
```

- [ ] **Step 8: Update DevicePreview props in JSX**

Add `processing` and `handleGenerateXtc` to the `<DevicePreview>` call:

```tsx
<DevicePreview
  canvasRef={canvasRef} s={s} deviceColor={deviceColor}
  bookLoaded={bookLoaded} loading={loading} loadingMsg={loadingMsg} wasmReady={wasmReady}
  page={page} pages={pages} goToPage={goToPage}
  processing={processing} handleGenerateXtc={handleGenerateXtc}
/>
```

- [ ] **Step 9: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/converter/converter.tsx
git commit -m "feat: rewire converter to use Sonner toasts, remove multi-file and export bar code"
```

---

### Task 6: Filter OPDS feed to XTC-only books

**Files:**
- Modify: `src/app/opds/route.ts:29-55`

- [ ] **Step 1: Filter books to XTC-only**

In `src/app/opds/route.ts`, add a filter after `listBooks()`:

Change line 35:
```tsx
// FROM:
const books = listBooks()
// TO:
const books = listBooks().filter(b => b.filename)
```

This ensures only books with a generated XTC file (`filename IS NOT NULL`) appear in the OPDS feed.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/opds/route.ts
git commit -m "feat: filter OPDS feed to only serve books with generated XTC files"
```

---

### Task 7: Clean up — remove unused imports and dead code

**Files:**
- Modify: `src/components/converter/converter.tsx`
- Modify: `src/components/converter/sidebar.tsx`

- [ ] **Step 1: Audit and remove unused imports/state**

In `converter.tsx`:
- Remove `downloadFile` from the `image-processing` import if no longer used (it was used by the old `handleExportXtc` download path — the new `handleGenerateXtc` doesn't download, it saves to library)
- Remove `switchToFile` and `removeFile` callbacks if no longer passed anywhere
- Confirm `fileIdx` and `setFileIdx` are still needed (yes — `saveToLibrary` uses `filesRef.current[fileIdxRef.current]`)

In `sidebar.tsx`:
- Remove `FileInfo` from the `@/lib/types` import if no longer referenced
- Confirm the `files` prop is fully removed from both interface and destructuring

- [ ] **Step 2: Run final build check**

Run: `pnpm build`
Expected: Clean build, no warnings about unused vars.

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/converter.tsx src/components/converter/sidebar.tsx
git commit -m "chore: remove unused imports and dead code from converter and sidebar"
```
