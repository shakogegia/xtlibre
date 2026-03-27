# page.tsx Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 2584-line `src/app/page.tsx` into focused utility modules and presentational components while preserving identical behavior.

**Architecture:** Extract pure functions into `src/lib/` modules, extract JSX tab panels and UI sections into `src/components/converter/` components. All state remains in `page.tsx` and is passed down as props. No context providers, no hooks extraction.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (base-nova)

**Verification strategy:** After each task, run `pnpm build` to confirm zero TypeScript errors and no runtime regressions. This is a pure refactor — the app must render identically.

**Key rules:**
- `SelectItem` must always be wrapped in `SelectGroup`
- Imports use `@/*` path alias (maps to `src/*`)
- Read Next.js 16 docs in `node_modules/next/dist/docs/` if any routing/layout questions arise

---

### Task 1: Extract types and constants to `src/lib/types.ts`

**Files:**
- Create: `src/lib/types.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/lib/types.ts`**

Copy the following from `page.tsx` lines 90-197 and lines 1521-1531 into a new file:

```ts
import { type DeviceType } from "@/lib/config"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WasmModule = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Renderer = any

export interface TocItem {
  title: string
  page: number
  children?: TocItem[]
}

export interface FileInfo {
  file: File
  name: string
  loaded: boolean
  libraryBookId?: string
}

export interface BookMetadata {
  title?: string
  authors?: string
  language?: string
}

export interface Settings {
  deviceType: DeviceType
  orientation: number
  fontSize: number
  fontWeight: number
  lineHeight: number
  margin: number
  fontFace: string
  textAlign: number
  wordSpacing: number
  hyphenation: number
  hyphenationLang: string
  ignoreDocMargins: boolean
  qualityMode: "fast" | "hq"
  enableDithering: boolean
  ditherStrength: number
  enableNegative: boolean
  enableProgressBar: boolean
  progressPosition: "top" | "bottom"
  showProgressLine: boolean
  showChapterMarks: boolean
  showChapterProgress: boolean
  progressFullWidth: boolean
  showPageInfo: boolean
  showBookPercent: boolean
  showChapterPage: boolean
  showChapterPercent: boolean
  progressFontSize: number
  progressEdgeMargin: number
  progressSideMargin: number
  fontHinting: number
  fontAntialiasing: number
}

export const DEFAULT_SETTINGS: Settings = {
  deviceType: "x4",
  orientation: 0,
  fontSize: 22,
  fontWeight: 400,
  lineHeight: 120,
  margin: 20,
  fontFace: "Literata",
  textAlign: -1,
  wordSpacing: 100,
  hyphenation: 2,
  hyphenationLang: "auto",
  ignoreDocMargins: false,
  qualityMode: "fast",
  enableDithering: true,
  ditherStrength: 70,
  enableNegative: false,
  enableProgressBar: true,
  progressPosition: "bottom",
  showProgressLine: true,
  showChapterMarks: true,
  showChapterProgress: false,
  progressFullWidth: false,
  showPageInfo: true,
  showBookPercent: true,
  showChapterPage: true,
  showChapterPercent: false,
  progressFontSize: 14,
  progressEdgeMargin: 0,
  progressSideMargin: 0,
  fontHinting: 1,
  fontAntialiasing: 2,
}

export const PROGRESS_BAR_HEIGHT = 14
export const PROGRESS_BAR_HEIGHT_FULLWIDTH = 20
export const PROGRESS_BAR_HEIGHT_EXTENDED = 28

export const STORAGE_KEY_SETTINGS = "xtc-settings"
export const STORAGE_KEY_DEVICE_COLOR = "xtc-device-color"

export type DeviceColor = "black" | "white"

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch { return fallback }
}

// Slider value helper (base-ui returns number | readonly number[])
export const sv = (v: number | readonly number[]) => Array.isArray(v) ? v[0] : v

// Select display label helpers
export const deviceLabel: Record<string, string> = { x4: "X4 (480x800)", x3: "X3 (528x792)" }
export const orientLabel: Record<string, string> = { "0": "Portrait 0°", "90": "Landscape 90°", "180": "Portrait 180°", "270": "Landscape 270°" }
export const alignLabel: Record<string, string> = { "-1": "Default", "0": "Left", "1": "Right", "2": "Center", "3": "Justify" }
export const spacingLabel: Record<string, string> = { "50": "Small (50%)", "75": "Condensed", "100": "Normal", "125": "Expanded", "150": "Wide", "200": "Extra Wide" }
export const hyphLabel: Record<string, string> = { "0": "Off", "1": "Algorithmic", "2": "Dictionary" }
export const langLabel: Record<string, string> = { auto: "Auto", en: "English", "en-gb": "English (UK)", de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", ru: "Russian" }
export const qualLabel: Record<string, string> = { fast: "Fast (1-bit)", hq: "HQ (2-bit)" }
```

- [ ] **Step 2: Update `page.tsx` imports**

Remove the type/interface/constant definitions (lines 90-197, 1521-1531) from `page.tsx` and replace with:

```ts
import {
  type WasmModule, type Renderer, type TocItem, type FileInfo, type BookMetadata,
  type Settings, type DeviceColor,
  DEFAULT_SETTINGS, PROGRESS_BAR_HEIGHT, PROGRESS_BAR_HEIGHT_FULLWIDTH, PROGRESS_BAR_HEIGHT_EXTENDED,
  STORAGE_KEY_SETTINGS, STORAGE_KEY_DEVICE_COLOR,
  loadFromStorage, sv,
  deviceLabel, orientLabel, alignLabel, spacingLabel, hyphLabel, langLabel, qualLabel,
} from "@/lib/types"
```

Also remove the `sv` definition at line 1522 and the label records at lines 1525-1531.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/app/page.tsx
git commit -m "refactor: extract types and constants to src/lib/types.ts"
```

---

### Task 2: Extract device constants to `src/lib/device.ts`

**Files:**
- Create: `src/lib/device.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/lib/device.ts`**

Copy from `page.tsx` lines 34-88 and lines 209-218 into a new file:

```ts
import { DEVICE_SPECS, type DeviceType } from "@/lib/config"
import { type DeviceColor } from "@/lib/types"

// Device physical specs → bezel dimensions in device pixels (at 220 PPI)
// X4: 114×69mm body, 480×800 screen at 220 PPI → screen = 55.4×92.4mm
export const DEVICE_BEZELS: Record<DeviceType, {
  deviceWidthMm: number; deviceHeightMm: number
  side: number; top: number; chin: number
  bodyRadius: number; screenRadius: number
  sideButtons: { offsetPct: number; size: number }[]
  chinButtons: { widthPct: number; height: number; gap: number }
}> = {
  x4: {
    deviceWidthMm: 69, deviceHeightMm: 114,
    side: 59, top: 52, chin: 110,
    bodyRadius: 26, screenRadius: 8,
    sideButtons: [
      { offsetPct: 0.10, size: 18 },  // Power
    ],
    chinButtons: { widthPct: 0.35, height: 18, gap: 12 },
  },
  x3: {
    deviceWidthMm: 76, deviceHeightMm: 124,
    side: 64, top: 56, chin: 120,
    bodyRadius: 28, screenRadius: 8,
    sideButtons: [
      { offsetPct: 0.10, size: 20 },
    ],
    chinButtons: { widthPct: 0.35, height: 20, gap: 14 },
  },
}

export const DEVICE_COLORS: Record<DeviceColor, {
  body: string; button: string; slot: string
  highlight: string; screenBorder: string; shadow: string
}> = {
  black: {
    body: "linear-gradient(160deg, #3a3a44 0%, #2e2e38 35%, #232328 100%)",
    button: "linear-gradient(180deg, #333340 0%, #282834 100%)",
    slot: "rgba(0,0,0,0.3)",
    highlight: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
    screenBorder: "inset 0 0 0 1px rgba(0,0,0,0.5), inset 0 2px 6px rgba(0,0,0,0.2)",
    shadow: "0 25px 60px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)",
  },
  white: {
    body: "linear-gradient(160deg, #f0ede8 0%, #e8e5df 35%, #dedad4 100%)",
    button: "linear-gradient(180deg, #e8e5e0 0%, #ddd9d3 100%)",
    slot: "rgba(0,0,0,0.12)",
    highlight: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.06)",
    screenBorder: "inset 0 0 0 1px rgba(0,0,0,0.12), inset 0 2px 4px rgba(0,0,0,0.06)",
    shadow: "0 25px 60px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)",
  },
}

// Estimated CSS PPI for MacBook Retina displays (~127 CSS px/inch)
export const TRUE_LIFE_CSS_PPI = 127

export function getScreenDimensions(deviceType: DeviceType, orientation: number) {
  const device = DEVICE_SPECS[deviceType]
  const isLandscape = orientation === 90 || orientation === 270
  return {
    screenWidth: isLandscape ? device.height : device.width,
    screenHeight: isLandscape ? device.width : device.height,
    deviceWidth: device.width,
    deviceHeight: device.height,
  }
}
```

- [ ] **Step 2: Update `page.tsx`**

Remove lines 34-88 (`DEVICE_BEZELS`, `DeviceColor`, `DEVICE_COLORS`, `TRUE_LIFE_CSS_PPI`) and lines 209-218 (`getScreenDimensions`) from `page.tsx`. Add import:

```ts
import { DEVICE_BEZELS, DEVICE_COLORS, TRUE_LIFE_CSS_PPI, getScreenDimensions } from "@/lib/device"
```

Remove the now-redundant `DeviceColor` type from `page.tsx` (it's already exported from `types.ts` and re-used in `device.ts`).

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/device.ts src/app/page.tsx
git commit -m "refactor: extract device constants to src/lib/device.ts"
```

---

### Task 3: Extract image processing to `src/lib/image-processing.ts`

**Files:**
- Create: `src/lib/image-processing.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/lib/image-processing.ts`**

Copy from `page.tsx` lines 385-551 into a new file. These are pure functions with no React or WASM dependencies:

```ts
export function applyDitheringSyncToData(
  data: Uint8ClampedArray, width: number, height: number,
  bits: number, strength: number, xthMode = false
) {
  // ... exact copy of lines 389-425
}

export function quantizeImageData(
  data: Uint8ClampedArray, bits: number, xthMode = false
) {
  // ... exact copy of lines 430-445
}

export function applyNegativeToData(data: Uint8ClampedArray) {
  // ... exact copy of lines 448-451
}

export function generateXtgData(canvas: HTMLCanvasElement, bits: number): ArrayBuffer {
  // ... exact copy of lines 454-517
}

export function generateXthData(canvas: HTMLCanvasElement): ArrayBuffer {
  // ... exact copy of lines 519-541
}

export function downloadFile(data: ArrayBuffer, filename: string) {
  // ... exact copy of lines 543-550
}
```

Copy the full function bodies verbatim — do not modify any logic.

- [ ] **Step 2: Update `page.tsx`**

Remove lines 385-551 from `page.tsx`. Add import:

```ts
import {
  applyDitheringSyncToData, quantizeImageData, applyNegativeToData,
  generateXtgData, generateXthData, downloadFile,
} from "@/lib/image-processing"
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/image-processing.ts src/app/page.tsx
git commit -m "refactor: extract image processing to src/lib/image-processing.ts"
```

---

### Task 4: Extract progress bar to `src/lib/progress-bar.ts`

**Files:**
- Create: `src/lib/progress-bar.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/lib/progress-bar.ts`**

Copy from `page.tsx` lines 200-383 into a new file. These functions depend on types from `types.ts` and `config.ts`:

```ts
import { LANG_TO_PATTERN } from "@/lib/config"
import {
  type TocItem, type Settings,
  PROGRESS_BAR_HEIGHT, PROGRESS_BAR_HEIGHT_FULLWIDTH, PROGRESS_BAR_HEIGHT_EXTENDED,
} from "@/lib/types"

export function getPatternForLang(langTag: string): string {
  // ... exact copy of lines 200-207
}

export function getChapterInfoForPage(
  pageNum: number, toc: TocItem[], totalPages: number
): { title: string; startPage: number; endPage: number; index: number; totalCount: number } | null {
  // ... exact copy of lines 222-261
}

export function getChapterPositions(toc: TocItem[], totalPages: number): number[] {
  // ... exact copy of lines 263-273
}

export function drawProgressIndicator(
  ctx: CanvasRenderingContext2D, s: Settings, currentPage: number,
  totalPages: number, screenW: number, screenH: number, toc: TocItem[]
) {
  // ... exact copy of lines 275-383
}
```

Copy all function bodies verbatim.

- [ ] **Step 2: Update `page.tsx`**

Remove lines 198-383 from `page.tsx`. Add import:

```ts
import { getPatternForLang, drawProgressIndicator } from "@/lib/progress-bar"
```

Note: `getChapterInfoForPage` and `getChapterPositions` are only called from within `drawProgressIndicator`, so they don't need to be imported into `page.tsx` — they're internal to `progress-bar.ts`.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/progress-bar.ts src/app/page.tsx
git commit -m "refactor: extract progress bar to src/lib/progress-bar.ts"
```

---

### Task 5: Extract `ChapterList` to `src/components/converter/chapter-list.tsx`

**Files:**
- Create: `src/components/converter/chapter-list.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/chapter-list.tsx`**

Copy from `page.tsx` lines 2561-2584:

```tsx
import { type TocItem } from "@/lib/types"

export function ChapterList({ items, depth, onSelect }: {
  items: TocItem[]; depth: number; onSelect: (page: number) => void
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${depth}-${i}`}>
          <div
            className="px-3 py-1.5 text-[12px] cursor-pointer hover:bg-accent/50 border-b border-border/20 truncate transition-colors"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => onSelect(item.page)}
          >
            {item.title}
          </div>
          {item.children && item.children.length > 0 && (
            <ChapterList items={item.children} depth={depth + 1} onSelect={onSelect} />
          )}
        </div>
      ))}
    </>
  )
}
```

- [ ] **Step 2: Update `page.tsx`**

Remove lines 2560-2584 from `page.tsx`. Add import:

```ts
import { ChapterList } from "@/components/converter/chapter-list"
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/chapter-list.tsx src/app/page.tsx
git commit -m "refactor: extract ChapterList to converter/chapter-list.tsx"
```

---

### Task 6: Extract `FilesTab` to `src/components/converter/files-tab.tsx`

**Files:**
- Create: `src/components/converter/files-tab.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/files-tab.tsx`**

Extract the `TabsContent value={0}` block (page.tsx lines 1570-1626). Define the props interface:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { type FileInfo } from "@/lib/types"

interface FilesTabProps {
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
}

export function FilesTab({
  files, fileIdx, fileInputRef, addFiles, switchToFile, removeFile,
  dragOver, setDragOver, setFiles, filesRef, setBookLoaded,
}: FilesTabProps) {
  return (
    <>
      {/* Upload area — exact copy of lines 1572-1598 */}
      {/* File list — exact copy of lines 1601-1625 */}
    </>
  )
}
```

Copy the full JSX from the `TabsContent value={0}` body (the inner content, not the `TabsContent` wrapper itself — that stays in `page.tsx`).

- [ ] **Step 2: Update `page.tsx`**

Replace the inner content of `<TabsContent value={0}>` with:

```tsx
<TabsContent value={0} className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
  <FilesTab
    files={files} fileIdx={fileIdx} fileInputRef={fileInputRef}
    addFiles={addFiles} switchToFile={switchToFile} removeFile={removeFile}
    dragOver={dragOver} setDragOver={setDragOver}
    setFiles={setFiles} filesRef={filesRef} setBookLoaded={setBookLoaded}
  />
</TabsContent>
```

Add import: `import { FilesTab } from "@/components/converter/files-tab"`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/files-tab.tsx src/app/page.tsx
git commit -m "refactor: extract FilesTab to converter/files-tab.tsx"
```

---

### Task 7: Extract `OptionsTab` to `src/components/converter/options-tab.tsx`

**Files:**
- Create: `src/components/converter/options-tab.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/options-tab.tsx`**

Extract the `TabsContent value={1}` block (page.tsx lines 1628-2012). This is the largest tab — contains 4 accordion sections (Device, Typography, Image, Progress Bar) plus the Chapters section. Define the props interface:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { FONT_FAMILIES, type DeviceType } from "@/lib/config"
import {
  type Settings, type BookMetadata, type TocItem, type Renderer,
  sv, deviceLabel, orientLabel, alignLabel, spacingLabel, hyphLabel, langLabel, qualLabel,
} from "@/lib/types"
import { ChapterList } from "@/components/converter/chapter-list"

interface OptionsTabProps {
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
}

export function OptionsTab({ ... }: OptionsTabProps) {
  return (
    <>
      <Accordion multiple defaultValue={["device", "text"]} className="space-y-1">
        {/* Device — exact copy of lines 1631-1668 */}
        {/* Typography — exact copy of lines 1671-1823 */}
        {/* Image — exact copy of lines 1826-1869 */}
        {/* Progress Bar — exact copy of lines 1872-1986 */}
        {/* Chapters — exact copy of lines 1989-2008 */}
      </Accordion>
      <div className="h-3" />
    </>
  )
}
```

Copy all accordion sections verbatim. The `ChapterList` `onSelect` callback uses `rendererRef` and `renderPreview`, so pass them as props.

- [ ] **Step 2: Update `page.tsx`**

Replace the inner content of `<TabsContent value={1}>` with:

```tsx
<TabsContent value={1} className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
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
```

Add import: `import { OptionsTab } from "@/components/converter/options-tab"`

Remove shadcn imports from `page.tsx` that are now only used in `options-tab.tsx` (Accordion*, Slider, Switch, Checkbox, Separator, ScrollArea). Keep them if still used elsewhere in `page.tsx`.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/options-tab.tsx src/app/page.tsx
git commit -m "refactor: extract OptionsTab to converter/options-tab.tsx"
```

---

### Task 8: Extract `CalibreTab` to `src/components/converter/calibre-tab.tsx`

**Files:**
- Create: `src/components/converter/calibre-tab.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/calibre-tab.tsx`**

Extract the `TabsContent value={2}` block (page.tsx lines 2014-2203). Define the props interface:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

interface CalibreTabProps {
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
}

export function CalibreTab({ ... }: CalibreTabProps) {
  return (
    <>
      {/* Header with settings gear — exact copy of lines 2015-2029 */}
      {/* Conditional: not connected — exact copy of lines 2031-2044 */}
      {/* Conditional: connected — exact copy of lines 2046-2201 */}
    </>
  )
}
```

Copy all JSX verbatim from within the `TabsContent value={2}` wrapper.

- [ ] **Step 2: Update `page.tsx`**

Replace the inner content of `<TabsContent value={2}>` with:

```tsx
<TabsContent value={2} className="flex-1 min-h-0 flex flex-col px-4 pt-3">
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
```

Add import: `import { CalibreTab } from "@/components/converter/calibre-tab"`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/calibre-tab.tsx src/app/page.tsx
git commit -m "refactor: extract CalibreTab to converter/calibre-tab.tsx"
```

---

### Task 9: Extract `LibraryTab` to `src/components/converter/library-tab.tsx`

**Files:**
- Create: `src/components/converter/library-tab.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/library-tab.tsx`**

Extract the `TabsContent value={3}` block (page.tsx lines 2204-2252). Define the props interface:

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
  libraryBooks: LibraryBook[]
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  deleteLibraryBook: (bookId: string) => void
}

export function LibraryTab({
  libraryBooks, libraryLoading, openLibraryEpub, deleteLibraryBook,
}: LibraryTabProps) {
  return (
    <>
      {/* Loading/empty/list — exact copy of lines 2205-2251 */}
    </>
  )
}
```

Copy all JSX verbatim.

- [ ] **Step 2: Update `page.tsx`**

Replace the inner content of `<TabsContent value={3}>` with:

```tsx
<TabsContent value={3} className="flex-1 min-h-0 flex flex-col px-4 pt-3">
  <LibraryTab
    libraryBooks={libraryBooks} libraryLoading={libraryLoading}
    openLibraryEpub={openLibraryEpub} deleteLibraryBook={deleteLibraryBook}
  />
</TabsContent>
```

Add import: `import { LibraryTab } from "@/components/converter/library-tab"`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/library-tab.tsx src/app/page.tsx
git commit -m "refactor: extract LibraryTab to converter/library-tab.tsx"
```

---

### Task 10: Extract `ExportBar` to `src/components/converter/export-bar.tsx`

**Files:**
- Create: `src/components/converter/export-bar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/export-bar.tsx`**

Extract the pinned bottom section (page.tsx lines 2255-2293). Define the props interface:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { type FileInfo } from "@/lib/types"

interface ExportBarProps {
  bookLoaded: boolean
  processing: boolean
  files: FileInfo[]
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

export function ExportBar({
  bookLoaded, processing, files, showExport, exportPct, exportMsg,
  saving, saveMsg, handleExportXtc, handleExportAll,
  handleSaveToLibrary, handleSaveAllToLibrary,
}: ExportBarProps) {
  return (
    <div className="px-4 py-3 border-t border-border/50 space-y-2 bg-card/80">
      {/* Exact copy of lines 2257-2292 */}
    </div>
  )
}
```

Copy all JSX verbatim.

- [ ] **Step 2: Update `page.tsx`**

Replace lines 2255-2293 with:

```tsx
<ExportBar
  bookLoaded={bookLoaded} processing={processing} files={files}
  showExport={showExport} exportPct={exportPct} exportMsg={exportMsg}
  saving={saving} saveMsg={saveMsg}
  handleExportXtc={() => handleExportXtc()} handleExportAll={handleExportAll}
  handleSaveToLibrary={handleSaveToLibrary} handleSaveAllToLibrary={handleSaveAllToLibrary}
/>
```

Add import: `import { ExportBar } from "@/components/converter/export-bar"`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/export-bar.tsx src/app/page.tsx
git commit -m "refactor: extract ExportBar to converter/export-bar.tsx"
```

---

### Task 11: Extract `Toolbar` to `src/components/converter/toolbar.tsx`

**Files:**
- Create: `src/components/converter/toolbar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/toolbar.tsx`**

Extract the toolbar (page.tsx lines 2298-2341). Define the props interface:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { type BookMetadata, type DeviceColor } from "@/lib/types"

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
}

export function Toolbar({
  bookLoaded, page, pages, meta, prevPage, nextPage,
  deviceColor, setDeviceColor, renderPreview,
}: ToolbarProps) {
  return (
    <div className="flex items-center border-b border-border/50 px-4 py-2 gap-4">
      {/* Exact copy of lines 2300-2340 */}
    </div>
  )
}
```

Copy all JSX verbatim.

- [ ] **Step 2: Update `page.tsx`**

Replace lines 2298-2341 with:

```tsx
<Toolbar
  bookLoaded={bookLoaded} page={page} pages={pages} meta={meta}
  prevPage={prevPage} nextPage={nextPage}
  deviceColor={deviceColor} setDeviceColor={setDeviceColor}
  renderPreview={renderPreview}
/>
```

Add import: `import { Toolbar } from "@/components/converter/toolbar"`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/toolbar.tsx src/app/page.tsx
git commit -m "refactor: extract Toolbar to converter/toolbar.tsx"
```

---

### Task 12: Extract `DevicePreview` to `src/components/converter/device-preview.tsx`

**Files:**
- Create: `src/components/converter/device-preview.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/device-preview.tsx`**

Extract the preview area (page.tsx lines 2343-2477). This is the device frame with canvas, side buttons, chin buttons, page scrubber, loading overlay, and empty state. The bezel layout math (lines 1540-1554) moves into this component since it's only used here. Define the props interface:

```tsx
import React from "react"
import { Slider } from "@/components/ui/slider"
import { type Settings, type DeviceColor } from "@/lib/types"
import { DEVICE_BEZELS, DEVICE_COLORS, TRUE_LIFE_CSS_PPI, getScreenDimensions } from "@/lib/device"

interface DevicePreviewProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  s: Settings
  deviceColor: DeviceColor
  bookLoaded: boolean
  loading: boolean
  loadingMsg: string
  wasmReady: boolean
  page: number
  pages: number
  goToPage: (pg: number) => void
}

export function DevicePreview({
  canvasRef, s, deviceColor, bookLoaded, loading, loadingMsg, wasmReady,
  page, pages, goToPage,
}: DevicePreviewProps) {
  const dims = getScreenDimensions(s.deviceType, s.orientation)

  // Compute bezel layout — exact copy of lines 1541-1554
  const bz = DEVICE_BEZELS[s.deviceType]
  const dc = DEVICE_COLORS[deviceColor]
  const chinSide: "top" | "right" | "bottom" | "left" =
    s.orientation === 0 ? "bottom" : s.orientation === 90 ? "right" : s.orientation === 180 ? "top" : "left"
  const bezelTop    = chinSide === "top"    ? bz.chin : chinSide === "bottom" ? bz.top : bz.side
  const bezelRight  = chinSide === "right"  ? bz.chin : chinSide === "left"   ? bz.top : bz.side
  const bezelBottom = chinSide === "bottom" ? bz.chin : chinSide === "top"    ? bz.top : bz.side
  const bezelLeft   = chinSide === "left"   ? bz.chin : chinSide === "right"  ? bz.top : bz.side
  const totalW = bezelLeft + dims.screenWidth + bezelRight
  const totalH = bezelTop + dims.screenHeight + bezelBottom
  const isLandscape = s.orientation === 90 || s.orientation === 270
  const trueLifeW = (isLandscape ? bz.deviceHeightMm : bz.deviceWidthMm) / 25.4 * TRUE_LIFE_CSS_PPI
  const trueLifeH = (isLandscape ? bz.deviceWidthMm : bz.deviceHeightMm) / 25.4 * TRUE_LIFE_CSS_PPI

  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden" style={{ background: "radial-gradient(ellipse at center, hsl(var(--muted)) 0%, hsl(var(--background)) 70%)" }}>
      {/* Empty state — exact copy of lines 2345-2358 */}
      {/* Device frame + scrubber — exact copy of lines 2361-2467 */}
      {/* Loading overlay — exact copy of lines 2469-2476 */}
    </div>
  )
}
```

Copy all JSX verbatim.

- [ ] **Step 2: Update `page.tsx`**

Remove the bezel layout math (lines 1540-1554) and the preview `<div>` (lines 2343-2477) from `page.tsx`. Replace with:

```tsx
<DevicePreview
  canvasRef={canvasRef} s={s} deviceColor={deviceColor}
  bookLoaded={bookLoaded} loading={loading} loadingMsg={loadingMsg} wasmReady={wasmReady}
  page={page} pages={pages} goToPage={goToPage}
/>
```

Add import: `import { DevicePreview } from "@/components/converter/device-preview"`

The `dims` variable at line 1538 is still needed in `page.tsx` for the `useEffect` that resizes the canvas — keep that one, but remove the bezel-specific vars that are now inside `DevicePreview`.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/device-preview.tsx src/app/page.tsx
git commit -m "refactor: extract DevicePreview to converter/device-preview.tsx"
```

---

### Task 13: Extract `CalibreDialog` to `src/components/converter/calibre-dialog.tsx`

**Files:**
- Create: `src/components/converter/calibre-dialog.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/converter/calibre-dialog.tsx`**

Extract the OPDS settings dialog (page.tsx lines 2480-2556). Define the props interface:

```tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

interface CalibreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  calibreConnected: boolean
  opdsSaveSettings: (config: { url: string; username: string; password: string }) => void
  opdsDisconnect: () => void
}

export function CalibreDialog({
  open, onOpenChange, calibreConnected, opdsSaveSettings, opdsDisconnect,
}: CalibreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        {/* Exact copy of lines 2483-2555 */}
      </DialogContent>
    </Dialog>
  )
}
```

Copy all JSX verbatim.

- [ ] **Step 2: Update `page.tsx`**

Replace lines 2480-2556 with:

```tsx
<CalibreDialog
  open={opdsSettingsOpen} onOpenChange={setOpdsSettingsOpen}
  calibreConnected={calibreConnected}
  opdsSaveSettings={opdsSaveSettings} opdsDisconnect={opdsDisconnect}
/>
```

Add import: `import { CalibreDialog } from "@/components/converter/calibre-dialog"`

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/calibre-dialog.tsx src/app/page.tsx
git commit -m "refactor: extract CalibreDialog to converter/calibre-dialog.tsx"
```

---

### Task 14: Clean up `page.tsx` imports

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Remove unused imports from `page.tsx`**

After all extractions, many shadcn imports are no longer used directly in `page.tsx`. Audit and remove unused imports. Likely removals:

- `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger` (moved to options-tab)
- `ScrollArea` (moved to options-tab, library-tab)
- `Slider` (moved to options-tab, device-preview)
- `Switch` (moved to options-tab)
- `Label` (moved to options-tab, calibre-dialog)
- `Checkbox` (moved to options-tab)
- `Separator` (moved to options-tab)
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` (moved to calibre-dialog)
- `Input` (moved to calibre-tab, calibre-dialog)
- `Progress` (moved to export-bar)
- `ThemeToggle` (moved to toolbar)

Keep: `Button` (if still used), `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

Also remove label records and `sv` from `page.tsx` imports if they were only used in options-tab (they're now imported directly in options-tab from `@/lib/types`).

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor: clean up unused imports in page.tsx"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: Build succeeds, zero errors.

- [ ] **Step 2: Verify page.tsx line count**

Run: `wc -l src/app/page.tsx`
Expected: ~350-450 lines (down from 2584).

- [ ] **Step 3: Verify all new files exist**

Run: `ls -la src/lib/types.ts src/lib/device.ts src/lib/image-processing.ts src/lib/progress-bar.ts src/components/converter/`
Expected: All 13 files present (4 lib + 9 components).

- [ ] **Step 4: Start dev server and smoke test**

Run: `pnpm dev`
Open the app in browser. Verify:
- Sidebar tabs render (Files, Options, Calibre, Library)
- Device preview frame renders
- Loading an EPUB still works (if one is available)
- All accordion sections in Options expand/collapse
