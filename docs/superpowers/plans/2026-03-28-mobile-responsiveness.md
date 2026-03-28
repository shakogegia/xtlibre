# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make XTLibre responsive on mobile with full-screen tab views and bottom navigation, prioritizing library/Calibre browsing.

**Architecture:** On screens below `md` (768px), the desktop sidebar+preview layout is hidden and replaced by a `MobileLayout` component that renders each tab full-screen with a bottom navigation bar. Both layouts share the same state from `converter.tsx` — no duplication. The existing `Tabs` urlSync mechanism (`?tab=`) is reused so deep links and tab state stay consistent.

**Tech Stack:** React 19, Tailwind CSS 4 responsive classes (`md:` prefix), lucide-react icons, existing shadcn/base-ui Tabs component.

---

### Task 1: Add viewport-fit=cover to layout.tsx

**Files:**
- Modify: `src/app/layout.tsx:29-34`

- [ ] **Step 1: Update the html/head to include viewport-fit**

In `src/app/layout.tsx`, add a viewport export. Next.js 16 uses the `metadata` export for viewport config. Update the existing `metadata` export and add a `viewport` export:

```tsx
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
}
```

Add this directly below the existing `metadata` export (after line 21).

- [ ] **Step 2: Verify the app still builds**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: add viewport-fit=cover for mobile safe areas"
```

---

### Task 2: Create MobileLayout component

**Files:**
- Create: `src/components/converter/mobile-layout.tsx`

- [ ] **Step 1: Create the mobile-layout.tsx file**

This component receives the same props as Sidebar + DevicePreview + Toolbar and renders them in a full-screen tab view with a bottom nav bar. It reuses the existing tab content components directly.

```tsx
"use client"

import React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LibraryTab } from "@/components/converter/library-tab"
import { CalibreTab } from "@/components/converter/calibre-tab"
import { OptionsTab } from "@/components/converter/options-tab"
import { DeviceTab } from "@/components/converter/device-tab"
import { DevicePreview } from "@/components/converter/device-preview"
import { Toolbar } from "@/components/converter/toolbar"
import { Library, BookOpen, SlidersHorizontal, Tablet, Eye } from "lucide-react"
import {
  type Settings, type BookMetadata, type TocItem, type Renderer, type DeviceColor,
} from "@/lib/types"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

const TABS = [
  { value: "library", label: "Library", icon: Library },
  { value: "calibre", label: "Calibre", icon: BookOpen },
  { value: "options", label: "Options", icon: SlidersHorizontal },
  { value: "device", label: "Device", icon: Tablet },
  { value: "preview", label: "Preview", icon: Eye },
] as const

interface MobileLayoutProps {
  initialTab: string
  opdsUrl: string | null

  // Files (upload)
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void

  // Options tab
  s: Settings
  meta: BookMetadata
  toc: TocItem[]
  customFonts: Array<{ id: string; name: string; filename: string }>
  uploadCustomFont: (file: File) => Promise<{ id: string; name: string; filename: string }>
  deleteCustomFont: (id: string) => Promise<void>
  update: (patch: Partial<Settings>) => void
  updateAndReformat: (patch: Partial<Settings>) => void
  updateAndRender: (patch: Partial<Settings>) => void
  flushReformat: () => void
  flushRender: () => void
  handleFontChange: (fontName: string | null) => void
  handleQualityChange: (mode: "fast" | "hq") => void
  handleHyphenationChange: (val: number) => void
  handleHyphenLangChange: (lang: string | null) => void
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
  opdsBrowse: (path?: string, append?: boolean) => void
  opdsBack: () => void
  opdsDoSearch: () => void
  opdsImportBook: (entry: OpdsEntry) => void

  // Library
  activeBookId: string | null
  libraryBooks: Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  downloadXtc: (bookId: string) => void
  deleteLibraryBook: (bookId: string) => void
  updateLibraryBook: (bookId: string, title: string, author: string | null) => void

  // Device
  sendToDevice: (bookId: string) => void
  deviceConfigured: boolean
  transferring: boolean
  transferProgress: { sent: number; total: number; filename: string } | null
  cancelTransfer: () => void

  // Preview
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  deviceColor: DeviceColor
  bookLoaded: boolean
  loading: boolean
  loadingMsg: string
  wasmReady: boolean
  page: number
  pages: number
  goToPage: (pg: number) => void
  prevPage: () => void
  nextPage: () => void
  processing: boolean
  handleGenerateXtc: () => void
  setDeviceColor: React.Dispatch<React.SetStateAction<DeviceColor>>
}

export function MobileLayout({
  initialTab, opdsUrl,
  fileInputRef, addFiles, dragOver, setDragOver,
  s, meta, toc, customFonts, uploadCustomFont, deleteCustomFont,
  update, updateAndReformat, updateAndRender,
  flushReformat, flushRender, handleFontChange, handleQualityChange,
  handleHyphenationChange, handleHyphenLangChange,
  renderPreview, rendererRef,
  calibreConnected, opdsFeed, opdsLoading, opdsError, opdsSearch, opdsNavStack,
  opdsDownloading, setOpdsSettingsOpen, setOpdsSearch, setOpdsError,
  opdsBrowse, opdsBack, opdsDoSearch, opdsImportBook,
  activeBookId, libraryBooks, libraryLoading, openLibraryEpub, downloadXtc, deleteLibraryBook, updateLibraryBook,
  sendToDevice, deviceConfigured, transferring, transferProgress, cancelTransfer,
  canvasRef, deviceColor, bookLoaded, loading, loadingMsg, wasmReady,
  page, pages, goToPage, prevPage, nextPage, processing, handleGenerateXtc, setDeviceColor,
}: MobileLayoutProps) {
  return (
    <Tabs
      urlSync="tab"
      defaultValue={initialTab}
      onValueChange={(v) => {
        if (v === "calibre" && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse()
      }}
      className="flex-1 flex flex-col min-h-0"
    >
      {/* Tab content area — fills available space above the bottom bar */}
      <div className="flex-1 min-h-0 flex flex-col">
        <TabsContent value="library" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <LibraryTab
            fileInputRef={fileInputRef} addFiles={addFiles}
            dragOver={dragOver} setDragOver={setDragOver}
            opdsUrl={opdsUrl} activeBookId={activeBookId}
            libraryBooks={libraryBooks} libraryLoading={libraryLoading}
            openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
            deleteLibraryBook={deleteLibraryBook}
            updateLibraryBook={updateLibraryBook}
            sendToDevice={sendToDevice}
            deviceConfigured={deviceConfigured}
            transferring={transferring}
          />
        </TabsContent>

        <TabsContent value="options" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <OptionsTab
            s={s} meta={meta} toc={toc}
            customFonts={customFonts} uploadCustomFont={uploadCustomFont} deleteCustomFont={deleteCustomFont}
            update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
            flushReformat={flushReformat} flushRender={flushRender}
            handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
            handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
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

        <TabsContent value="device" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <DeviceTab
            s={s} update={update}
            transferring={transferring}
            transferProgress={transferProgress}
            cancelTransfer={cancelTransfer}
          />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
          <Toolbar
            bookLoaded={bookLoaded} page={page} pages={pages} meta={meta}
            prevPage={prevPage} nextPage={nextPage}
            deviceColor={deviceColor} setDeviceColor={setDeviceColor}
            renderPreview={renderPreview}
            compact
          />
          <DevicePreview
            canvasRef={canvasRef} s={s} deviceColor={deviceColor}
            bookLoaded={bookLoaded} loading={loading} loadingMsg={loadingMsg} wasmReady={wasmReady}
            page={page} pages={pages} goToPage={goToPage}
            processing={processing} handleGenerateXtc={handleGenerateXtc}
          />
        </TabsContent>
      </div>

      {/* Bottom navigation bar */}
      <BottomNav />
    </Tabs>
  )
}

function BottomNav() {
  return (
    <div
      className="border-t border-border/50 bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <TabsList className="w-full h-auto bg-transparent rounded-none p-0">
        {TABS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-none h-auto text-muted-foreground data-active:text-primary data-active:bg-transparent data-active:shadow-none dark:data-active:bg-transparent dark:data-active:border-transparent"
          >
            <Icon size={20} />
            <span className="text-[10px]">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit 2>&1 | tail -20`
Expected: No errors (the component isn't imported yet, so this just checks syntax).

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/mobile-layout.tsx
git commit -m "feat: add MobileLayout component with bottom tab navigation"
```

---

### Task 3: Add compact prop to Toolbar

**Files:**
- Modify: `src/components/converter/toolbar.tsx`

- [ ] **Step 1: Add the compact prop to ToolbarProps and update button sizes**

In `src/components/converter/toolbar.tsx`, add `compact?: boolean` to the interface and use it to conditionally size buttons:

Update the interface (line 6-16):

```tsx
interface ToolbarProps {
  bookLoaded: boolean
  page: number
  pages: number
  meta: BookMetadata
  prevPage: () => void
  nextPage: () => void
  deviceColor: DeviceColor
  setDeviceColor: React.Dispatch<React.SetStateAction<DeviceColor>>
  renderPreview: () => void
  compact?: boolean
}
```

Update the function signature (line 18):

```tsx
export function Toolbar({ bookLoaded, page, pages, meta, prevPage, nextPage, deviceColor, setDeviceColor, renderPreview, compact }: ToolbarProps) {
  const btnSize = compact ? "h-9 w-9" : "h-7 w-7"
  const iconSize = compact ? "16" : "14"
  return (
```

Then replace all `className="h-7 w-7 p-0"` with `className={\`${btnSize} p-0\`}` and all `width="14" height="14"` inside the buttons with `width={iconSize} height={iconSize}`.

Specifically, update these lines:

Line 22 (prev button):
```tsx
<Button variant="outline" size="sm" className={`${btnSize} p-0`} disabled={!bookLoaded || page <= 0} onClick={prevPage}>
  <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
</Button>
```

Line 25 (next button):
```tsx
<Button variant="outline" size="sm" className={`${btnSize} p-0`} disabled={!bookLoaded || page >= pages - 1} onClick={nextPage}>
  <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
</Button>
```

Line 43-50 (device color toggle):
```tsx
<Button
  variant="ghost"
  size="sm"
  className={`${btnSize} p-0`}
  disabled={!bookLoaded}
  onClick={() => setDeviceColor(prev => prev === "black" ? "white" : "black")}
  title={deviceColor === "black" ? "Space Black" : "Frost White"}
>
  <svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
```

Line 57 (refresh button):
```tsx
<Button variant="ghost" size="sm" className={`${btnSize} p-0`} disabled={!bookLoaded} onClick={() => renderPreview()}>
  <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
</Button>
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit 2>&1 | tail -20`
Expected: No errors. The existing `<Toolbar ... />` calls don't pass `compact` and the prop is optional, so they continue to work.

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/toolbar.tsx
git commit -m "feat: add compact prop to Toolbar for mobile touch targets"
```

---

### Task 4: Update DevicePreview width calculation

**Files:**
- Modify: `src/components/converter/device-preview.tsx:73`

- [ ] **Step 1: Remove the 420px assumption from the width calc**

In `src/components/converter/device-preview.tsx`, line 73 has this width calc:

```tsx
width: `min(${trueLifeW.toFixed(1)}px, calc(100vw - 420px), calc((100vh - 100px) * ${(totalW / totalH).toFixed(6)}))`,
```

The `420px` assumes the 360px sidebar is always present. Change it to use a CSS custom property with a fallback so the same component works in both layouts:

```tsx
width: `min(${trueLifeW.toFixed(1)}px, calc(100vw - var(--preview-inset, 32px)), calc((100vh - 100px) * ${(totalW / totalH).toFixed(6)}))`,
```

Then in `converter.tsx`, on the desktop content wrapper div (line 1110), add the CSS variable:

```tsx
<div className="hidden md:flex flex-1 flex-col min-w-0" style={{ "--preview-inset": "420px" } as React.CSSProperties}>
```

The mobile layout doesn't set this variable, so it falls back to `32px` (16px padding each side), giving the preview nearly full width on mobile.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/converter/device-preview.tsx
git commit -m "feat: use CSS variable for preview width inset, mobile-friendly fallback"
```

---

### Task 5: Wire up responsive layout in converter.tsx

**Files:**
- Modify: `src/components/converter/converter.tsx:1074-1134`

- [ ] **Step 1: Add the MobileLayout import**

At the top of `converter.tsx`, add the import alongside the existing component imports (near line 8):

```tsx
import { MobileLayout } from "@/components/converter/mobile-layout"
```

- [ ] **Step 2: Replace the render block with responsive layout**

Replace the render JSX (lines 1074-1134) from:

```tsx
  return (
    <DeviceProvider settings={s} updateSettings={update}>
    <div className="flex h-screen bg-background">
      <Sidebar
        ...
      />

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <Toolbar ... />
        {/* Preview */}
        <DevicePreview ... />
      </div>

      <CalibreDialog ... />
    </div>
    </DeviceProvider>
  )
```

With:

```tsx
  return (
    <DeviceProvider settings={s} updateSettings={update}>
    <div className="flex h-screen flex-col md:flex-row bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar
        className="hidden md:flex"
        initialTab={initialTab}
        opdsUrl={opdsUrl}
        fileInputRef={fileInputRef}
        addFiles={addFiles} dragOver={dragOver} setDragOver={setDragOver}
        s={s} meta={meta} toc={toc}
        update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
        flushReformat={flushReformat} flushRender={flushRender}
        handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
        handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
        customFonts={customFonts} uploadCustomFont={uploadCustomFont} deleteCustomFont={deleteCustomFont}
        renderPreview={renderPreview} rendererRef={rendererRef}
        calibreConnected={calibreConnected} opdsFeed={opdsFeed}
        opdsLoading={opdsLoading} opdsError={opdsError}
        opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
        opdsDownloading={opdsDownloading}
        setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
        setOpdsError={setOpdsError}
        opdsBrowse={opdsBrowse} opdsBack={opdsBack}
        opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
        activeBookId={files[0]?.libraryBookId ?? null}
        libraryBooks={libraryBooks} libraryLoading={libraryLoading}
        openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
        deleteLibraryBook={deleteLibraryBook}
        updateLibraryBook={updateLibraryBook}
        sendToDevice={sendToDevice}
        deviceConfigured={deviceConfigured}
        transferring={transferring}
        transferProgress={transferProgress}
        cancelTransfer={cancelTransfer}
      />

      {/* Desktop content area — hidden on mobile */}
      <div className="hidden md:flex flex-1 flex-col min-w-0" style={{ "--preview-inset": "420px" } as React.CSSProperties}>
        <Toolbar
          bookLoaded={bookLoaded} page={page} pages={pages} meta={meta}
          prevPage={prevPage} nextPage={nextPage}
          deviceColor={deviceColor} setDeviceColor={setDeviceColor}
          renderPreview={renderPreview}
        />
        <DevicePreview
          canvasRef={canvasRef} s={s} deviceColor={deviceColor}
          bookLoaded={bookLoaded} loading={loading} loadingMsg={loadingMsg} wasmReady={wasmReady}
          page={page} pages={pages} goToPage={goToPage}
          processing={processing} handleGenerateXtc={handleGenerateXtc}
        />
      </div>

      {/* Mobile layout — hidden on desktop */}
      <MobileLayout
        className="flex md:hidden flex-1 flex-col"
        initialTab={initialTab}
        opdsUrl={opdsUrl}
        fileInputRef={fileInputRef}
        addFiles={addFiles} dragOver={dragOver} setDragOver={setDragOver}
        s={s} meta={meta} toc={toc}
        update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
        flushReformat={flushReformat} flushRender={flushRender}
        handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
        handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
        customFonts={customFonts} uploadCustomFont={uploadCustomFont} deleteCustomFont={deleteCustomFont}
        renderPreview={renderPreview} rendererRef={rendererRef}
        calibreConnected={calibreConnected} opdsFeed={opdsFeed}
        opdsLoading={opdsLoading} opdsError={opdsError}
        opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
        opdsDownloading={opdsDownloading}
        setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
        setOpdsError={setOpdsError}
        opdsBrowse={opdsBrowse} opdsBack={opdsBack}
        opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
        activeBookId={files[0]?.libraryBookId ?? null}
        libraryBooks={libraryBooks} libraryLoading={libraryLoading}
        openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
        deleteLibraryBook={deleteLibraryBook}
        updateLibraryBook={updateLibraryBook}
        sendToDevice={sendToDevice}
        deviceConfigured={deviceConfigured}
        transferring={transferring}
        transferProgress={transferProgress}
        cancelTransfer={cancelTransfer}
        canvasRef={canvasRef}
        deviceColor={deviceColor}
        bookLoaded={bookLoaded}
        loading={loading}
        loadingMsg={loadingMsg}
        wasmReady={wasmReady}
        page={page}
        pages={pages}
        goToPage={goToPage}
        prevPage={prevPage}
        nextPage={nextPage}
        processing={processing}
        handleGenerateXtc={handleGenerateXtc}
        setDeviceColor={setDeviceColor}
      />

      <CalibreDialog
        open={opdsSettingsOpen} onOpenChange={setOpdsSettingsOpen}
        calibreConnected={calibreConnected} calibreConfig={calibreConfig}
        opdsSaveSettings={opdsSaveSettings} opdsDisconnect={opdsDisconnect}
      />
    </div>
    </DeviceProvider>
  )
```

**Note:** The `MobileLayout` component also needs a `className` prop. Add it to the `MobileLayoutProps` interface and apply it to the root element:

In `mobile-layout.tsx`, add to the interface:
```tsx
className?: string
```

And update the root `<Tabs>` wrapper:
```tsx
<Tabs
  urlSync="tab"
  defaultValue={initialTab}
  onValueChange={...}
  className={cn("flex-1 flex flex-col min-h-0", className)}
>
```

Import `cn` from `@/lib/utils` at the top of `mobile-layout.tsx`.

- [ ] **Step 3: Update Sidebar to accept and apply className**

In `src/components/converter/sidebar.tsx`, add `className?: string` to `SidebarProps` (after line 14):

```tsx
interface SidebarProps {
  className?: string
  initialTab: string
  // ... rest unchanged
```

Update the destructuring (line 77):
```tsx
export function Sidebar({
  className,
  initialTab, opdsUrl,
  // ... rest unchanged
```

Update the root div (line 97):
```tsx
<div className={cn("w-[360px] border-r border-border/50 flex flex-col bg-card/50", className)}>
```

Add the `cn` import at top:
```tsx
import { cn } from "@/lib/utils"
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | tail -30`
Expected: No errors.

- [ ] **Step 5: Verify the app builds**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/converter/converter.tsx src/components/converter/sidebar.tsx src/components/converter/mobile-layout.tsx
git commit -m "feat: wire up responsive layout with mobile/desktop split"
```

---

### Task 6: Update library upload text for mobile

**Files:**
- Modify: `src/components/converter/library-tab.tsx:72`

- [ ] **Step 1: Change the upload text to be touch-aware**

In `src/components/converter/library-tab.tsx`, line 72 currently says:

```tsx
<div className="text-xs font-medium">Drop EPUB files here</div>
<div className="text-[11px] text-muted-foreground mt-0.5">or click to browse</div>
```

Replace with responsive text using Tailwind `hidden`/`md:inline`:

```tsx
<div className="text-xs font-medium">
  <span className="hidden md:inline">Drop EPUB files here</span>
  <span className="md:hidden">Tap to upload EPUB</span>
</div>
<div className="text-[11px] text-muted-foreground mt-0.5">
  <span className="hidden md:inline">or click to browse</span>
  <span className="md:hidden">Select files from your device</span>
</div>
```

- [ ] **Step 2: Make library book action buttons always visible on mobile**

On line 170, the action buttons use `opacity-0 group-hover/lib:opacity-100` which relies on hover (doesn't work on touch). Add a responsive override so they're always visible on mobile:

Change:
```tsx
<div className="flex gap-1 opacity-0 group-hover/lib:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
```

To:
```tsx
<div className="flex gap-1 md:opacity-0 md:group-hover/lib:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
```

This makes the buttons always visible on mobile (no `opacity-0`) but keeps the hover-reveal behavior on desktop.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/library-tab.tsx
git commit -m "feat: mobile-friendly upload text and always-visible book actions"
```

---

### Task 7: Manual mobile testing

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test desktop layout is unchanged**

Open `http://localhost:3000` in a desktop browser at full width. Verify:
- Sidebar appears on the left at 360px width
- Device preview fills the remaining space
- Toolbar is at the top of the content area
- All tabs (Library, Options, Calibre, Device) work in the sidebar

- [ ] **Step 3: Test mobile layout**

Open Chrome DevTools, toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M), select iPhone 14 or similar. Verify:
- Bottom tab bar appears with 5 icons (Library, Calibre, Options, Device, Preview)
- Library tab is shown by default (full screen)
- Upload area says "Tap to upload EPUB"
- Book action buttons are always visible (not hidden behind hover)
- Tapping each tab switches full-screen content
- Preview tab shows the device mockup + toolbar with larger buttons
- The device preview scales to fit the mobile width
- Bottom bar respects safe area (notch padding)
- Desktop sidebar is NOT visible

- [ ] **Step 4: Test URL sync**

Navigate to `http://localhost:3000?tab=preview` on mobile. Verify:
- Preview tab is selected on load
- Switching tabs updates the URL `?tab=` param

- [ ] **Step 5: Test breakpoint transition**

Slowly resize the browser from desktop to mobile width. Verify:
- At 768px the layout switches cleanly between desktop and mobile
- No flash or layout jump

- [ ] **Step 6: Commit (if any fixes were needed)**

```bash
git add -u
git commit -m "fix: mobile responsiveness polish from manual testing"
```
