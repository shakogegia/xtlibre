# Save EPUBs — Design Spec

## Goal

Persist EPUB files server-side so users can re-open previously uploaded or Calibre-downloaded EPUBs from the converter without re-uploading or re-fetching. EPUBs appear alongside XTC files in the existing library UI.

## Data Model

Extend the `books` table with one column:

```sql
ALTER TABLE books ADD COLUMN epub_filename TEXT;
```

- `epub_filename` holds `{uuid}.epub`, stored in `DATA_DIR/library/` alongside .xtc files
- A book row can have: only an EPUB, only an XTC, or both
- Deduplication: `original_epub_name` + `file_size` — if a match exists, skip insert

### Book row lifecycle

1. EPUB uploaded or downloaded from Calibre → row created with `epub_filename`, `title`, `author`, `original_epub_name`, `file_size`, `cover_thumbnail`; `filename` (xtc) is NULL
2. User exports to XTC → existing row updated with `filename` (xtc path) and `device_type`
3. Legacy path (no EPUB saved) → row created with `filename` only, `epub_filename` is NULL

## Auto-Save Flow

### On upload (client-side EPUB)

After `loadEpub` completes (CREngine has extracted metadata):

1. Capture cover thumbnail from preview canvas
2. `POST /api/library/epub` with FormData: epub file, title, author, original_epub_name, cover
3. Await response, store returned book ID in the file's state entry for later XTC linking
4. If the request fails, log to console — don't block the user's workflow

### On Calibre download

After `downloadEpub` returns the file, before passing to `addFiles`:

1. `POST /api/library/epub` with FormData: epub file, title (from OPDS entry), author (from OPDS entry), original_epub_name
2. Cover: fetch from OPDS entry's thumbnail URL via Calibre proxy, include in FormData if available
3. On success, store returned book ID
4. Pass file to `addFiles` as before

### Deduplication

Server checks `original_epub_name` + `file_size` before insert. If match exists, returns existing record (200, not error). Client treats this as success.

## API Changes

### New endpoints

#### `POST /api/library/epub`

- Auth required (session or Basic)
- Accepts FormData:
  - `file` — the .epub file (required)
  - `title` — book title (required)
  - `author` — book author (optional)
  - `original_epub_name` — original filename (required, used for dedup)
  - `cover` — JPEG thumbnail blob (optional)
- Generates UUID, stores EPUB as `{uuid}.epub` in `DATA_DIR/library/`
- Checks dedup: if `original_epub_name` + `file_size` match exists, returns existing row
- Returns `{ id, title, author, isExisting: boolean }`

#### `GET /api/library/{id}/epub`

- Auth required
- Returns stored EPUB file with `Content-Disposition: attachment; filename="{original_epub_name}"`
- 404 if book has no `epub_filename`

### Modified endpoints

#### `GET /api/library` (list)

- Response now includes `epub_filename` field (string or null) per book
- UI uses truthiness to show EPUB badge

#### `POST /api/library` (existing XTC upload)

- New optional field in FormData: `epub_book_id` — if provided, update that existing row with XTC data instead of creating a new row
- Fallback: if `epub_book_id` not provided, check `original_epub_name` match and update if found
- If no match, create new row as before (backward compatible)

#### `DELETE /api/library/{id}`

- Also deletes EPUB file from disk if `epub_filename` is set

## Library UI Changes

Unified book list (no tabs/filters):

- Each row shows badges: "EPUB" if `epub_filename` is truthy, "XTC" if `filename` is truthy
- **Open action** on EPUB books: fetches `GET /api/library/{id}/epub`, creates a `File` object, passes to `addFiles`/`loadEpub`
- Delete removes both files (EPUB + XTC) if present
- Sort order: `created_at DESC` (unchanged)

## DB Module Changes (`src/lib/db.ts`)

New column:

```sql
ALTER TABLE books ADD COLUMN epub_filename TEXT;
```

Applied as migration (check if column exists first, add if not).

New prepared statements:

- `insertEpub` — insert book row with epub_filename, no xtc filename
- `getByOriginalName` — find by `original_epub_name` + `file_size` for dedup
- `updateWithXtc` — set `filename`, `device_type` on existing row (for linking XTC to EPUB row)

Modified statements:

- `list` — include `epub_filename` in SELECT
- `getById` — already uses `SELECT *`, no change needed

New exports:

- `insertEpubBook(...)` — insert EPUB-only book row
- `findByOriginalEpub(name, size)` — dedup lookup
- `linkXtcToBook(id, filename, deviceType)` — update existing row with XTC

## File Storage

All files in `DATA_DIR/library/`:

- `{uuid}.xtc` or `{uuid}.xtch` — XTC exports (existing)
- `{uuid}.epub` — saved EPUB source files (new)

No separate directory. Same cleanup on delete.
