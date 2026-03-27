# Docker + XTC Library + OPDS Feed

**Date:** 2026-03-27
**Status:** Approved

## Goal

Dockerize the XTC Converter and add server-side XTC file storage with an OPDS 1.2 catalog endpoint, so Xteink e-readers can browse and download converted books directly.

**Use case:** Self-hosted personal tool on a home server/VPS, accessible from any device.

## Storage & Data Model

### File storage

- All XTC files stored in `/data/library/` inside the container
- Filenames: `{uuid}.xtc` (avoids collisions, original title lives in DB)
- Docker volume mounts `/data/` for persistence across container restarts

### SQLite schema (`/data/library.db`)

```sql
CREATE TABLE books (
  id TEXT PRIMARY KEY,           -- UUID
  title TEXT NOT NULL,
  author TEXT,
  filename TEXT NOT NULL,        -- {uuid}.xtc on disk
  original_epub_name TEXT,       -- e.g. "moby-dick.epub"
  file_size INTEGER,
  cover_thumbnail BLOB,          -- small JPEG/PNG for OPDS
  created_at TEXT DEFAULT (datetime('now')),
  device_type TEXT               -- 'x4' or 'x3'
);
```

- Driver: `better-sqlite3` (synchronous, fast, no ORM)
- Single table, no relations needed

## API Routes

All routes are Next.js App Router API routes under `src/app/api/`.

### `POST /api/library`

Save XTC to library.

- Input: `multipart/form-data` with XTC file + JSON metadata (title, author, device_type, original_epub_name, optional cover thumbnail)
- Server generates UUID, writes file to `/data/library/{uuid}.xtc`, inserts row into SQLite
- Returns: `{ id, title, author }`

### `GET /api/library`

List library contents.

- Returns JSON array: `[{ id, title, author, device_type, file_size, created_at }]`
- Used by the web UI to show what's in the library

### `GET /api/library/[id]`

Download a single XTC file.

- Streams file from disk with `Content-Disposition: attachment; filename="{title}.xtc"`
- Used by both OPDS clients and web UI

### `DELETE /api/library/[id]`

Remove from library.

- Deletes file from disk + row from SQLite

### `GET /opds`

OPDS 1.2 Atom catalog feed.

- Lists all books as `<entry>` elements
- Each entry has title, author, acquisition link (`/api/library/{id}`), optional cover thumbnail link
- Sorted by `created_at` descending
- Flat catalog (no subcategories/navigation feeds)
- MIME type for XTC: `application/octet-stream`

### `GET /api/library/[id]/cover`

Serve cover thumbnail.

- Returns the BLOB from SQLite as `image/jpeg`
- Referenced by OPDS feed entries

## OPDS Feed Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:{catalog-uuid}</id>
  <title>XTC Library</title>
  <updated>{latest book date}</updated>
  <author><name>XTC Converter</name></author>

  <entry>
    <title>{book title}</title>
    <author><name>{book author}</name></author>
    <id>urn:uuid:{book-id}</id>
    <updated>{created_at}</updated>
    <link rel="http://opds-spec.org/acquisition"
          href="/api/library/{id}"
          type="application/octet-stream"/>
    <link rel="http://opds-spec.org/image/thumbnail"
          href="/api/library/{id}/cover"
          type="image/jpeg"/>
  </entry>
</feed>
```

## Web UI Changes

Changes are in `src/app/page.tsx` (no new pages):

### "Save to Library" button

- Appears after successful XTC conversion, next to the existing download button
- Sends XTC ArrayBuffer + metadata (title, author, device_type, cover) to `POST /api/library`
- Shows spinner while uploading, checkmark/toast on success

### "Save All to Library"

- Alongside existing "Export All" button
- Batch saves all converted XTCs

### Library count indicator

- Optional for v1: small badge in sidebar showing number of books in library
- Can rely on OPDS clients (e-reader) to browse the full library

## Docker Setup

### Dockerfile (multi-stage)

**Build stage:**
- Base: `node:22-alpine`
- Install pnpm, run `pnpm install`, `pnpm build`
- `better-sqlite3` compiled with native bindings here

**Production stage:**
- Base: `node:22-alpine`
- Copy `.next/standalone` output + `public/` directory
- Copy compiled `better-sqlite3` native binding
- Create `/data/library/` directory
- `VOLUME /data`
- `EXPOSE 3000`

### Next.js config change

Set `output: "standalone"` in `next.config.ts` for self-contained production build.

### Usage

```bash
docker build -t xtc .
docker run -d -p 3000:3000 -v xtc-data:/data xtc
```

## Makefile

Convenience targets for building, running, and publishing:

```makefile
IMAGE_NAME = xtc
DOCKER_REPO = <user>/xtc    # user fills in their Docker Hub username

dev          # pnpm dev
build        # docker build -t $(IMAGE_NAME) .
run          # docker run with volume mount, port 3000
stop         # stop and remove the container
logs         # tail container logs
publish      # docker push to Docker Hub
clean        # remove container, image, and volume
```

## No Auth

No authentication for v1. This is a personal tool on a local network. Auth can be added later (basic auth via env var, or reverse proxy).

## Future: Server-Side Conversion

Not in scope for this spec. The current design stores XTC files that were converted client-side. Server-side EPUB-to-XTC conversion (using CREngine WASM in Node.js or a headless browser) is a future enhancement.
