# page.tsx Refactoring — Design Spec

Pure code-organization refactor of `src/app/page.tsx` (2584 lines) into smaller, focused modules. No behavior changes.

## Approach

Extract pure utility functions into `src/lib/` modules, extract JSX panels into `src/components/converter/` components. State stays in `page.tsx`, passed down as props (one level, no context).

## File Structure

```
src/
  lib/
    types.ts              — shared types, interfaces, defaults, label lookups
    device.ts             — device bezel/color constants, screen dimension helper
    image-processing.ts   — dithering, quantize, negative, XTG/XTH generation
    progress-bar.ts       — progress indicator drawing, chapter helpers
  components/
    converter/
      files-tab.tsx       — upload drop zone + file list
      options-tab.tsx     — settings accordion (Device, Typography, Image, Progress, Chapters)
      calibre-tab.tsx     — OPDS browse/search UI
      library-tab.tsx     — saved books list with actions
      export-bar.tsx      — bottom export/save buttons + progress bar
      device-preview.tsx  — device frame, canvas, page scrubber
      toolbar.tsx         — top bar: nav, page counter, meta, device color toggle, theme
      calibre-dialog.tsx  — OPDS connection settings dialog
      chapter-list.tsx    — recursive ChapterList component
  app/
    page.tsx              — orchestrator (~400 lines): all state, WASM init, callbacks
```

## Module Contents

### src/lib/types.ts

- Type aliases: `WasmModule`, `Renderer`
- Interfaces: `TocItem`, `FileInfo`, `BookMetadata`, `Settings`
- Type: `DeviceColor`
- Constants: `DEFAULT_SETTINGS`, `PROGRESS_BAR_HEIGHT`, `PROGRESS_BAR_HEIGHT_FULLWIDTH`, `PROGRESS_BAR_HEIGHT_EXTENDED`, `STORAGE_KEY_SETTINGS`, `STORAGE_KEY_DEVICE_COLOR`
- Helper: `loadFromStorage<T>`
- Helper: `sv` (slider value coercion)
- Label records: `deviceLabel`, `orientLabel`, `alignLabel`, `spacingLabel`, `hyphLabel`, `langLabel`, `qualLabel`

### src/lib/device.ts

- `DEVICE_BEZELS` constant (device bezel specs)
- `DEVICE_COLORS` constant (color theme specs)
- `TRUE_LIFE_CSS_PPI` constant
- `getScreenDimensions(deviceType, orientation)` function

### src/lib/image-processing.ts

- `applyDitheringSyncToData(data, width, height, bits, strength, xthMode)`
- `quantizeImageData(data, bits, xthMode)`
- `applyNegativeToData(data)`
- `generateXtgData(canvas, bits)` — returns ArrayBuffer
- `generateXthData(canvas)` — returns ArrayBuffer
- `downloadFile(data, filename)`

### src/lib/progress-bar.ts

- `getPatternForLang(langTag)` — maps language tag to hyphenation pattern filename
- `getChapterInfoForPage(pageNum, toc, totalPages)` — returns chapter context
- `getChapterPositions(toc, totalPages)` — returns normalized positions array
- `drawProgressIndicator(ctx, settings, currentPage, totalPages, screenW, screenH, toc)`

## Component Props

Each component receives only what it needs from `page.tsx`. No context providers.

### files-tab

- `files`, `fileIdx`, `fileInputRef`
- `addFiles`, `switchToFile`, `removeFile`
- `dragOver`, `setDragOver`
- `setFiles`, `filesRef`, `setBookLoaded`

### options-tab

- `s` (settings), `meta` (book metadata), `toc`, `customFontName`
- `update`, `updateAndReformat`, `updateAndRender`
- `flushReformat`, `flushRender`
- `handleFontChange`, `handleQualityChange`, `handleHyphenationChange`, `handleHyphenLangChange`
- `handleCustomFont`, `fontInputRef`
- `renderPreview`, `rendererRef`
- `sv` (slider helper)

### calibre-tab

- `calibreConnected`, `opdsFeed`, `opdsLoading`, `opdsError`, `opdsSearch`, `opdsNavStack`, `opdsDownloading`
- `setOpdsSettingsOpen`, `setOpdsSearch`, `setOpdsError`
- `opdsBrowse`, `opdsBack`, `opdsDoSearch`, `opdsImportBook`

### library-tab

- `libraryBooks`, `libraryLoading`
- `openLibraryEpub`, `deleteLibraryBook`

### export-bar

- `bookLoaded`, `processing`, `files`
- `showExport`, `exportPct`, `exportMsg`
- `saving`, `saveMsg`
- `handleExportXtc`, `handleExportAll`, `handleSaveToLibrary`, `handleSaveAllToLibrary`

### toolbar

- `bookLoaded`, `page`, `pages`, `meta`
- `prevPage`, `nextPage`
- `deviceColor`, `setDeviceColor`
- `renderPreview`

### device-preview

- `canvasRef`, `dims` (screen dimensions)
- `s` (settings — needs `deviceType`, `orientation`)
- `deviceColor`
- `bookLoaded`, `loading`, `loadingMsg`, `wasmReady`
- `page`, `pages`, `goToPage`

### calibre-dialog

- `open`, `onOpenChange`
- `calibreConnected`
- `opdsSaveSettings`, `opdsDisconnect`

### chapter-list

- `items` (TocItem[]), `depth`, `onSelect` (already defined)

## Constraints

- No behavior changes — output must be identical
- All components are `"use client"` (they use browser APIs or receive callbacks)
- `page.tsx` remains the single `"use client"` entry point; child components don't need their own directive if only imported by page.tsx, but we add it to components that use hooks or event handlers directly
- Imports use `@/*` path alias
- `SelectItem` always wrapped in `SelectGroup`
