# Merge Files + Library Tabs

## Summary

Combine the "Files" and "Library" sidebar tabs into a single "Library" tab. The two tabs serve overlapping purposes (sourcing EPUBs) and the merge reduces tab count from 4 to 3.

## Layout (top to bottom)

1. **Upload drop zone** — drag & drop / click to browse, unchanged behavior
2. **Loaded files list** — current working set with switch/remove/clear actions, unchanged
3. **Separator** — visual divider between ephemeral and persistent sections
4. **Library books list** — server-side saved books with open/download/delete actions, unchanged

## Changes

### Tab structure (`sidebar.tsx`)
- Remove `TabsTrigger` for "files" and "library"
- Add single `TabsTrigger` value="library" labeled "Library"
- Remove `TabsContent` for "files" — merge its content into the "library" tab content
- Tab order: Library | Options | Calibre

### Merged component (`library-tab.tsx`)
- Absorb all props/content from `files-tab.tsx` into `library-tab.tsx`
- Render upload zone + loaded files list at top, separator, then library books below
- Delete `files-tab.tsx`

### URL/routing (`page.tsx`)
- `VALID_TABS`: remove "files", keep "library", "options", "calibre"
- Default tab: "library" (was "files")

### Data fetching
- Library books currently fetched on tab switch (`onValueChange`). Since "library" becomes the default tab, fetch on mount instead (or keep the onValueChange but also trigger on initial render).

### Sidebar props
- Props stay the same — both FilesTab and LibraryTab props are already passed to Sidebar. No changes to `converter.tsx` beyond removing the files-tab import.

## What stays the same

- All upload, drag & drop, file switching, remove, clear functionality
- All library open/download/delete functionality
- ExportBar
- State management in converter.tsx
- Options and Calibre tabs
