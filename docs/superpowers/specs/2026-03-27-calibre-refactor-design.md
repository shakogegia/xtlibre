# Calibre Refactor Design

Rename "Library" to "Calibre" in the UI, move OPDS routes to `/api/calibre/*`, and persist Calibre credentials server-side in SQLite.

## 1. UI Rename: Library → Calibre

**Tab trigger** (`page.tsx:1417`): Change `"Library"` → `"Calibre"`.

**Header label** (`page.tsx:1869`): Change from `opdsServer ? "Calibre-Web" : "OPDS Library"` to `opdsServer ? "Calibre-Web" : "Calibre"`.

**Settings button title** (`page.tsx:1876`): `"Library settings"` → `"Calibre settings"`.

**Empty state text** (`page.tsx:1889-1890`):
- `"Connect to your library"` → `"Connect to Calibre"`
- `"Browse and import books from Calibre-Web via OPDS"` → `"Browse and import books from your Calibre-Web server"`

**Dialog title** (`page.tsx:2284`): `"Library Connection"` → `"Calibre Connection"`.

**Dialog description** (`page.tsx:2286`): `"Connect to a Calibre-Web server via OPDS feed."` → `"Connect to your Calibre-Web server."`

## 2. Route Rename: `/api/opds` → `/api/calibre`

### Current routes
- `src/app/api/opds/route.ts` — OPDS proxy (forwards URL + auth to external server)

### New routes
- `src/app/api/calibre/feed/route.ts` — Browse/fetch OPDS feeds from the configured Calibre server
- `src/app/api/calibre/download/route.ts` — Download EPUB (and images) from the configured Calibre server
- `src/app/api/calibre/config/route.ts` — GET/PUT Calibre connection settings

### Route behavior changes

**`/api/calibre/feed`** (GET):
- Accepts `?path=/opds/...` (relative path within the Calibre server)
- Reads Calibre URL + credentials from SQLite
- Constructs the full URL, adds Basic auth header, fetches the OPDS feed
- Returns the XML as-is (client parses it)
- Returns 404 if no Calibre config exists

**`/api/calibre/download`** (GET):
- Accepts `?path=/opds/...` (relative path for the EPUB/image)
- Reads credentials from SQLite, proxies the binary response
- Streams response with correct Content-Type and Content-Disposition

**`/api/calibre/config`** (GET/PUT):
- Requires app auth (existing `requireAuth()` middleware)
- GET: Returns `{ url, username }` (never returns password)
- PUT: Accepts `{ url, username, password }`, validates URL format, saves to SQLite
- DELETE: Removes Calibre config from SQLite

### Deleted route
- `src/app/api/opds/route.ts` — replaced by the new routes above

## 3. SQLite: `calibre_config` Table

Add to `src/lib/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS calibre_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  url TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
)
```

Singleton pattern (`id = 1`) — only one Calibre server is supported.

### New DB functions

```typescript
export interface CalibreConfig {
  url: string
  username: string
  password: string
}

export function getCalibreConfig(): CalibreConfig | null
export function setCalibreConfig(config: CalibreConfig): void
export function deleteCalibreConfig(): void
```

Password is stored in plaintext in SQLite. This is acceptable because:
- The DB is local to the server, same trust boundary as `.env.local`
- The password is for the user's own Calibre-Web instance
- Encrypting it would require a key stored in the same environment, adding complexity without real security benefit

## 4. Client Changes (`src/lib/opds.ts`)

### Remove
- `loadServer()`, `saveServer()`, `clearServer()` — localStorage functions
- `makeAuthHeader()` — server handles auth now
- `STORAGE_KEY` constant

### Modify

**`fetchFeed(path: string)`** — no longer takes a `server` param:
```typescript
export async function fetchFeed(path?: string): Promise<OpdsFeed> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ""
  const resp = await fetch(`/api/calibre/feed${params}`)
  if (!resp.ok) throw new Error(`Feed fetch failed (${resp.status})`)
  const xml = await resp.text()
  return parseFeed(xml)
}
```

**`downloadEpub(path: string)`** — no longer takes a `server` param:
```typescript
export async function downloadEpub(path: string): Promise<File> {
  const resp = await fetch(`/api/calibre/download?path=${encodeURIComponent(path)}`)
  // ... same blob/filename logic, but no auth header needed
}
```

**`parseFeed(xml: string)`** — `baseUrl` param removed. Links in the feed (thumbnails, acquisition URLs) are either absolute (`https://calibre.example.com/opds/cover/123`) or relative (`/opds/cover/123`). The parser should store the path portion (e.g., `/opds/cover/123`) so the client can pass it as `?path=` to the API routes. For absolute URLs, extract the pathname; for relative URLs, use as-is.

### New

**`fetchCalibreConfig()`** — GET `/api/calibre/config`, returns `{ url, username } | null`

**`saveCalibreConfig(config)`** — PUT `/api/calibre/config`

**`deleteCalibreConfig()`** — DELETE `/api/calibre/config`

## 5. Client Changes (`page.tsx`)

### State changes
- Remove `opdsServer` state (was `OpdsServer | null` loaded from localStorage)
- Replace with `calibreConnected: boolean` and optionally `calibreConfig: { url: string, username: string } | null` for display purposes
- On mount, fetch `/api/calibre/config` to check if configured

### Connection dialog
- Form submits to PUT `/api/calibre/config` instead of saving to localStorage
- "Disconnect" calls DELETE `/api/calibre/config`
- Password field: on edit, show empty (since GET doesn't return it). Only send password if user types a new one. The PUT endpoint treats empty/missing password as "keep existing password" — so edits to URL or username don't require re-entering the password.

### Image/thumbnail URLs
- Currently: `src={/api/opds?url=${encodeURIComponent(entry.thumbnailUrl)}}`
- New: `src={/api/calibre/download?path=${encodeURIComponent(entry.thumbnailPath)}}`

## 6. Unchanged

- **`src/app/opds/route.ts`** — The local OPDS feed endpoint (serves the app's own library as OPDS). This is unrelated to the Calibre proxy and stays as-is.
- **`src/app/api/library/*`** — Local library CRUD routes. Unchanged.
- **`fast-xml-parser`** — Already in use, no changes needed.
- **Auth middleware** — `requireAuth()` applied to config endpoint only. Feed/download routes are unauthenticated (they proxy to the Calibre server which has its own auth, managed server-side).
