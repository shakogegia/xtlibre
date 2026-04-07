# Server-Side EPUB-to-XTC Conversion

## Summary

Move the EPUB-to-XTC conversion from the browser to a standalone server-side worker process. The user clicks "Generate XTC" as before, but the work happens on the server. The browser tab can be closed and the conversion continues. Progress is visible when the user returns.

## Motivation

- Conversion of large books ties up the browser tab for minutes
- User must keep the tab open for the entire duration
- Future: auto-convert Calibre library books without any UI interaction

## Architecture

```
┌─────────────────┐         ┌──────────┐         ┌─────────────────────┐
│   Browser UI    │         │  SQLite   │         │   Worker Script     │
│                 │         │           │         │   (convert.ts)      │
│  Click Generate ──POST──▶ │ jobs row  │ ◀─poll── │                     │
│                 │  /api/  │ (pending) │         │  Pick up job        │
│                 │ convert │           │         │  Load CREngine WASM │
│  Poll progress ◀──GET───▶ │ progress  │◀─update─│  Render pages       │
│                 │         │ updated_at│         │  Dither + quantize  │
│                 │         │           │         │  Assemble XTC       │
│  See result in  │         │ books row │◀─insert─│  Save to library    │
│  library        │         │ (xtc file)│         │  Mark completed     │
└─────────────────┘         └──────────┘         └─────────────────────┘
```

### What stays client-side

- EPUB loading and interactive preview (CREngine WASM in browser)
- Settings UI and live preview updates
- All existing preview/navigation behavior

### What moves to the server

- The page rendering loop (iterate all pages, dither, quantize, assemble XTC)
- XTC file generation and library storage

## Database: `conversion_jobs` Table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT (UUID) | Job ID |
| `book_id` | TEXT | FK to books table (the EPUB row) |
| `status` | TEXT | `pending` / `processing` / `completed` / `failed` |
| `progress` | INTEGER | Current page number (0 = not started) |
| `total_pages` | INTEGER | Total pages (set once rendering starts) |
| `settings` | TEXT (JSON) | Snapshot of rendering settings at submission time |
| `device_type` | TEXT | `x4` / `x3` |
| `error` | TEXT | Error message if failed |
| `created_at` | DATETIME | When submitted |
| `updated_at` | DATETIME | Last progress update |

Settings are snapshotted as JSON at submission time so in-flight jobs are not affected by settings changes in the UI.

## API Routes

### `POST /api/convert`

Submit a conversion job.

- **Request body:** `{ book_id: string }`
- **Response:** `{ job_id: string }`
- Validates the book exists and has an EPUB file on disk
- Reads current settings from SQLite, snapshots them as JSON into the job row
- Inserts `conversion_jobs` row with status `pending`
- Returns immediately

### `GET /api/convert/[jobId]`

Poll job status.

- **Response:** `{ status: string, progress: number, totalPages: number, error?: string }`
- Simple read from `conversion_jobs` table
- Client polls every ~500ms while job is active

## Worker Script

Standalone Node.js script at `src/worker/convert.ts`, run via `tsx src/worker/convert.ts` or compiled.

### Behavior

- Polls SQLite for `pending` jobs every 500ms
- Processes one job at a time (sequential to avoid memory pressure from multiple WASM instances)
- On pickup: sets status to `processing`, loads EPUB from disk, parses settings JSON
- Loads CREngine WASM from `public/lib/crengine.js` (Emscripten build has Node.js support)
- Loads fonts from `data/fonts/` (custom) and `public/fonts/` (built-in Literata)
- Loads hyphenation patterns from `public/hyph/`
- Uses `node-canvas` for: framebuffer to ImageData conversion, progress bar text drawing, page rotation
- Reuses existing pure-JS functions: `applyDitheringSyncToData`, `quantizeImageData`, `applyNegativeToData`
- Updates `progress` column after each page
- On completion: saves XTC to `data/library/`, updates `books` table, marks job `completed`
- On error: marks job `failed` with error message, continues polling

### Dependencies

- `canvas` (node-canvas) — Canvas 2D API for Node.js. Requires Cairo system library.
- CREngine WASM — loaded directly, no browser needed (Emscripten Node.js path)
- All other dependencies (better-sqlite3, etc.) already in the project

## Shared Modules (Extracted from converter.tsx)

### `src/lib/xtc-assembler.ts`

XTC file assembly: header (56 bytes), metadata (256 bytes), chapter index, page index, page data concatenation. Currently lives in `converter.tsx` lines 847-901. Extracted as a pure function:

```typescript
function assembleXtc(params: {
  pages: ArrayBuffer[]
  title: string
  author: string
  chapters: { name: string; startPage: number; endPage: number }[]
  deviceWidth: number
  deviceHeight: number
  isHQ: boolean
}): ArrayBuffer
```

Used by both the client-side converter and the server-side worker.

### `src/lib/progress-bar.ts`

Already exists. Uses Canvas 2D API for text/line drawing. Works with `node-canvas` without changes since `node-canvas` implements the same API.

### `src/lib/image-processing.ts`

Already exists. Dithering, quantization, negative functions operate on `Uint8ClampedArray` — fully portable. The `generateXtgData` and `generateXthData` functions currently take `HTMLCanvasElement` but only use `getImageData` — refactor to accept raw pixel data + dimensions instead.

## Client-Side Changes

### EPUB Upload

When the user loads an EPUB file, upload it to the library via `POST /api/library` (extended to accept EPUB files). This stores the EPUB on disk and returns a `book_id`. The EPUB must be on disk before the worker can access it.

### Generate Button (`handleGenerateXtc`)

Replace the ~170-line rendering loop with:

1. Save current settings to SQLite (already happens)
2. POST to `/api/convert` with `book_id`
3. Start polling `GET /api/convert/[jobId]` every 500ms
4. Show toast with "Rendering page X of Y..." from poll response
5. On completion, refresh library list and show success toast

### Resume on Page Load

On mount, check for any `processing` or `pending` jobs in the DB. If found, resume polling and show progress toast. This handles the "close tab and come back" case.

## Docker Considerations

The worker runs as a second process alongside Next.js. In Docker, the entrypoint script starts both:

```bash
#!/bin/sh
node worker/convert.js &
node server.js
```

The `node-canvas` package requires Cairo to be installed in the Docker image. Add to Dockerfile:

```dockerfile
RUN apk add --no-cache cairo-dev pango-dev jpeg-dev giflib-dev
```

## Future Extensions

- **Calibre auto-convert:** A cron or sync process inserts jobs into `conversion_jobs` for new Calibre books. The worker picks them up automatically.
- **Concurrent workers:** Run multiple worker instances for parallel conversion (each picks up different jobs with row locking).
- **Priority queue:** Add a `priority` column for user-initiated vs background jobs.
