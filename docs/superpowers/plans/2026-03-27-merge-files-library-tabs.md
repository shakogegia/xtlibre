# Merge Files + Library Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the "Files" and "Library" sidebar tabs into a single "Library" tab.

**Architecture:** Absorb FilesTab content into LibraryTab, update Sidebar to render 3 tabs instead of 4, update page.tsx routing defaults, add initial library fetch on mount.

**Tech Stack:** React, Next.js, TypeScript, shadcn/ui Tabs

---

### Task 1: Merge FilesTab into LibraryTab

**Files:**
- Modify: `src/components/converter/library-tab.tsx`
- Delete: `src/components/converter/files-tab.tsx`

- [ ] **Step 1: Update LibraryTab props to include all FilesTab props**

In `src/components/converter/library-tab.tsx`, replace the entire file with:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { type FileInfo } from "@/lib/types"

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
  // Upload / files
  files: FileInfo[]
  fileIdx: number
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  switchToFile: (index: number) => void
  removeFile: (index: number) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void
  setFiles: React.Dispatch<React.SetStateAction<FileInfo[]>>
  filesRef: React.MutableRefObject<FileInfo[]>
  setBookLoaded: (v: boolean) => void
  // Library
  libraryBooks: LibraryBook[]
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  deleteLibraryBook: (bookId: string) => void
}

export function LibraryTab({
  files, fileIdx, fileInputRef, addFiles, switchToFile, removeFile,
  dragOver, setDragOver, setFiles, filesRef, setBookLoaded,
  libraryBooks, libraryLoading, openLibraryEpub, deleteLibraryBook,
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

      {/* Loaded files list */}
      {files.length > 0 && (
        <div className="mb-3 rounded-lg border border-border/50 overflow-hidden bg-muted/20">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">{files.length} file{files.length > 1 ? "s" : ""}</span>
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => { setFiles([]); filesRef.current = []; setBookLoaded(false) }}>
              Clear
            </Button>
          </div>
          {files.map((f, i) => (
            <div
              key={f.name + i}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer border-t border-border/30 transition-colors ${
                i === fileIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
              }`}
              onClick={() => switchToFile(i)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
              <span className="truncate flex-1">{f.name}</span>
              <button className="ml-1 text-muted-foreground hover:text-destructive text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); removeFile(i) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

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
    </>
  )
}
```

- [ ] **Step 2: Delete files-tab.tsx**

```bash
rm src/components/converter/files-tab.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/library-tab.tsx
git rm src/components/converter/files-tab.tsx
git commit -m "feat: merge FilesTab content into LibraryTab"
```

---

### Task 2: Update Sidebar to use merged tab

**Files:**
- Modify: `src/components/converter/sidebar.tsx`

- [ ] **Step 1: Remove FilesTab import and update Sidebar**

In `src/components/converter/sidebar.tsx`:

1. Remove the `FilesTab` import line
2. Remove all Files-tab-only props from `SidebarProps` (none — all are shared since LibraryTab now accepts them)
3. Remove the `TabsTrigger value="files"` line
4. Remove the `TabsContent value="files"` block (lines 121-128)
5. Pass the files-related props to `LibraryTab` in addition to existing library props
6. In `onValueChange`, remove the `if (v === "library") fetchLibraryBooks()` since library is now the default tab and will fetch on mount

Updated `sidebar.tsx`:

```tsx
import React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { OptionsTab } from "@/components/converter/options-tab"
import { CalibreTab } from "@/components/converter/calibre-tab"
import { LibraryTab } from "@/components/converter/library-tab"
import { ExportBar } from "@/components/converter/export-bar"
import {
  type Settings, type BookMetadata, type TocItem, type FileInfo, type Renderer,
} from "@/lib/types"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

interface SidebarProps {
  initialTab: string

  // Files (upload + loaded list)
  files: FileInfo[]
  fileIdx: number
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  switchToFile: (index: number) => void
  removeFile: (index: number) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void
  setFiles: React.Dispatch<React.SetStateAction<FileInfo[]>>
  filesRef: React.MutableRefObject<FileInfo[]>
  setBookLoaded: (v: boolean) => void

  // Options tab
  s: Settings
  meta: BookMetadata
  toc: TocItem[]
  customFontName: string
  update: (patch: Partial<Settings>) => void
  updateAndReformat: (patch: Partial<Settings>) => void
  updateAndRender: (patch: Partial<Settings>) => void
  flushReformat: () => void
  flushRender: () => void
  handleFontChange: (fontName: string | null) => void
  handleQualityChange: (mode: "fast" | "hq") => void
  handleHyphenationChange: (val: number) => void
  handleHyphenLangChange: (lang: string | null) => void
  handleCustomFont: (e: React.ChangeEvent<HTMLInputElement>) => void
  fontInputRef: React.RefObject<HTMLInputElement | null>
  renderPreview: () => void
  rendererRef: React.MutableRefObject<Renderer>

  // Calibre tab
  calibreConnected: boolean
  opdsFeed: OpdsFeed | null
  opdsLoading: boolean
  opdsError: string
  opdsSearch: string
  opdsNavStack: string[]
  opdsDownloading: Set<string>
  setOpdsSettingsOpen: (v: boolean) => void
  setOpdsSearch: (v: string) => void
  setOpdsError: (v: string) => void
  opdsBrowse: (path?: string) => void
  opdsBack: () => void
  opdsDoSearch: () => void
  opdsImportBook: (entry: OpdsEntry) => void

  // Library
  libraryBooks: Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  deleteLibraryBook: (bookId: string) => void

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
}

export function Sidebar({
  initialTab,
  // Files
  files, fileIdx, fileInputRef, addFiles, switchToFile, removeFile,
  dragOver, setDragOver, setFiles, filesRef, setBookLoaded,
  // Options tab
  s, meta, toc, customFontName, update, updateAndReformat, updateAndRender,
  flushReformat, flushRender, handleFontChange, handleQualityChange,
  handleHyphenationChange, handleHyphenLangChange, handleCustomFont, fontInputRef,
  renderPreview, rendererRef,
  // Calibre tab
  calibreConnected, opdsFeed, opdsLoading, opdsError, opdsSearch, opdsNavStack,
  opdsDownloading, setOpdsSettingsOpen, setOpdsSearch, setOpdsError,
  opdsBrowse, opdsBack, opdsDoSearch, opdsImportBook,
  // Library
  libraryBooks, libraryLoading, openLibraryEpub, deleteLibraryBook,
  // Export bar
  bookLoaded, processing, showExport, exportPct, exportMsg,
  saving, saveMsg, handleExportXtc, handleExportAll,
  handleSaveToLibrary, handleSaveAllToLibrary,
}: SidebarProps) {
  return (
    <div className="w-[360px] border-r border-border/50 flex flex-col bg-card/50">
      <Tabs urlSync="tab" defaultValue={initialTab} onValueChange={(v) => { if (v === "calibre" && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse() }} className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="flex items-center px-4 py-2 border-b border-border/50">
          <TabsList className="w-full !h-7 p-0.5">
            <TabsTrigger value="library" className="text-[12px]">Library</TabsTrigger>
            <TabsTrigger value="options" className="text-[12px]">Options</TabsTrigger>
            <TabsTrigger value="calibre" className="text-[12px]">Calibre</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="library" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <LibraryTab
            files={files} fileIdx={fileIdx} fileInputRef={fileInputRef}
            addFiles={addFiles} switchToFile={switchToFile} removeFile={removeFile}
            dragOver={dragOver} setDragOver={setDragOver}
            setFiles={setFiles} filesRef={filesRef} setBookLoaded={setBookLoaded}
            libraryBooks={libraryBooks} libraryLoading={libraryLoading}
            openLibraryEpub={openLibraryEpub} deleteLibraryBook={deleteLibraryBook}
          />
        </TabsContent>

        <TabsContent value="options" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <OptionsTab
            s={s} meta={meta} toc={toc} customFontName={customFontName}
            update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
            flushReformat={flushReformat} flushRender={flushRender}
            handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
            handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
            handleCustomFont={handleCustomFont} fontInputRef={fontInputRef}
            renderPreview={renderPreview} rendererRef={rendererRef}
          />
        </TabsContent>

        <TabsContent value="calibre" className="flex-1 min-h-0 flex flex-col px-4 pt-3">
          <CalibreTab
            calibreConnected={calibreConnected} opdsFeed={opdsFeed}
            opdsLoading={opdsLoading} opdsError={opdsError}
            opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
            opdsDownloading={opdsDownloading}
            setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
            setOpdsError={setOpdsError}
            opdsBrowse={opdsBrowse} opdsBack={opdsBack}
            opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
          />
        </TabsContent>
      </Tabs>

      <ExportBar
        bookLoaded={bookLoaded} processing={processing} files={files}
        showExport={showExport} exportPct={exportPct} exportMsg={exportMsg}
        saving={saving} saveMsg={saveMsg}
        handleExportXtc={handleExportXtc} handleExportAll={handleExportAll}
        handleSaveToLibrary={handleSaveToLibrary} handleSaveAllToLibrary={handleSaveAllToLibrary}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/converter/sidebar.tsx
git commit -m "feat: update Sidebar to single Library tab (3 tabs)"
```

---

### Task 3: Update converter.tsx — remove fetchLibraryBooks prop, add initial fetch

**Files:**
- Modify: `src/components/converter/converter.tsx`

- [ ] **Step 1: Add useEffect to fetch library books on mount**

After the `fetchLibraryBooks` callback definition (around line 298), add:

```tsx
useEffect(() => {
  fetchLibraryBooks()
}, [fetchLibraryBooks])
```

- [ ] **Step 2: Remove fetchLibraryBooks from Sidebar props**

In the `<Sidebar>` JSX (around line 1022-1024), remove the `fetchLibraryBooks={fetchLibraryBooks}` prop line.

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/converter.tsx
git commit -m "feat: fetch library books on mount instead of tab switch"
```

---

### Task 4: Update page.tsx routing

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update VALID_TABS and default**

Change line 5 from:
```tsx
const VALID_TABS = new Set(["files", "options", "calibre", "library"])
```
to:
```tsx
const VALID_TABS = new Set(["library", "options", "calibre"])
```

Change line 13 from:
```tsx
const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "files"
```
to:
```tsx
const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "library"
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: update tab routing — default to library, remove files"
```

---

### Task 5: Verify

- [ ] **Step 1: Run the dev server and check**

```bash
pnpm dev
```

Open the app. Verify:
- Default tab is "Library"
- Upload drop zone appears at top
- Loading files shows the file list below the upload zone
- "Saved" separator appears below file list
- Library books appear below the separator
- Options and Calibre tabs work as before
- URL `?tab=library` works, `?tab=files` falls back to library

- [ ] **Step 2: Run type check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Final commit if any fixes needed**
