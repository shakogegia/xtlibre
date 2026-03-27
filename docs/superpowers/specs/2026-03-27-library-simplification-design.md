# Library Simplification & XTC Generation Redesign

## Overview

Simplify the library tab by removing the "loaded files" / working copy concept. All uploaded EPUBs go straight to the Saved list. Replace the sidebar export bar with a "Generate XTC" button in the preview area. Show generation progress via Sonner toast. OPDS feed serves only books with generated XTC files.

## Changes

### 1. Library Tab — Remove Loaded Files List

**Current:** Upload area + loaded files list (working copy) + Saved section.
**New:** Upload area + Saved section only.

- Remove the "loaded files" list (lines 73-98 in `library-tab.tsx`)
- Remove props: `files`, `fileIdx`, `switchToFile`, `removeFile`, `setFiles`, `filesRef`, `setBookLoaded`
- Keep: `fileInputRef`, `addFiles`, `dragOver`, `setDragOver` (upload area still needs these)
- When user uploads an EPUB, it auto-saves to library (already happens) and loads in preview
- When user opens a book from Saved list, it replaces whatever is currently loaded
- One book open at a time — no multi-file switching

### 2. Remove Export Bar

**Current:** Bottom of sidebar has "Export XTC", "Export All", "Save to Library", "Save All" buttons + progress bar.
**New:** Export bar removed entirely.

- Delete or gut `export-bar.tsx`
- Remove `handleSaveToLibrary`, `handleSaveAllToLibrary`, `handleExportAll` from converter
- Remove related state: `saving`, `saveMsg`
- The "Export XTC" and "Save to Library" functions merge into a single "Generate XTC" action

### 3. Generate XTC Button — Preview Area

- Add a "Generate XTC" button below the page navigation controls in the preview/main area
- Enabled when a book is loaded, disabled during generation
- Clicking triggers XTC generation and auto-saves to library alongside the EPUB
- No separate download step — the XTC is saved to library. User can download from the Saved list.

### 4. Sonner Toast for Generation Progress

- Add `sonner` package to the project
- Add `<Toaster />` component in the app layout
- Generation progress shown as a custom toast that updates in-place:
  - "Generating XTC... Page 12/45" with a progress bar
  - Success state with checkmark when complete
  - Optional cancel button
- Replace the current `showExport`/`exportPct`/`exportMsg` state with toast-based updates
- The sidebar progress bar and export message are removed

### 5. Live Badge Update

- After XTC generation completes and is saved, call `fetchLibraryBooks()` to refresh the library list
- The book's entry in the Saved list updates to show the green "XTC" badge (already works this way when `filename` is set)

### 6. Multi-File Removal (Internal)

- Keep the `files[]` array in converter state but limit to length 1
- `addFiles()` replaces the current file instead of appending
- Remove "Export All" / "Save All" buttons and handlers
- Remove `switchToFile` logic from the library tab (still needed internally for `openLibraryEpub`)

### 7. OPDS Feed — XTC Only

**File:** `src/app/opds/route.ts`

- Filter `listBooks()` results to only include books where `filename IS NOT NULL`
- This means only books with a generated XTC file appear in the OPDS feed
- EPUBs without XTC are not served via OPDS

## Files Affected

| File | Change |
|------|--------|
| `src/components/converter/library-tab.tsx` | Remove loaded files list, simplify props |
| `src/components/converter/export-bar.tsx` | Remove or delete entirely |
| `src/components/converter/converter.tsx` | Remove export bar, add Generate XTC to preview area, integrate Sonner, simplify multi-file state |
| `src/app/layout.tsx` or root layout | Add `<Toaster />` from Sonner |
| `src/app/opds/route.ts` | Filter to XTC-only books |
| `package.json` | Add `sonner` dependency |

## Out of Scope

- Splitting `converter.tsx` into smaller files (per CLAUDE.md, this is a separate decision)
- Changing the XTC generation algorithm itself
- Modifying the database schema
- Changing how Calibre import works (it already auto-saves EPUBs)
