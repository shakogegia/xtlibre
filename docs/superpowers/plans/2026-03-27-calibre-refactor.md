# Calibre Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Library" to "Calibre" in the UI, move OPDS proxy routes to `/api/calibre/*`, and persist Calibre connection credentials server-side in SQLite instead of browser localStorage.

**Architecture:** Server-owned credentials model. The client configures Calibre once via a settings dialog; the server stores URL/username/password in a singleton SQLite table. All Calibre proxy routes read credentials from the DB — the client never sends raw passwords after initial setup. The client calls `/api/calibre/feed?path=...` and `/api/calibre/download?path=...`, passing only relative paths within the Calibre server.

**Tech Stack:** Next.js 16, better-sqlite3, fast-xml-parser, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-27-calibre-refactor-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/db.ts` | Add `calibre_config` table + CRUD functions |
| Modify | `src/lib/opds.ts` | Remove localStorage, simplify fetch/download to use server proxy, add config API helpers, change URL resolution to extract paths |
| Create | `src/app/api/calibre/config/route.ts` | GET/PUT/DELETE Calibre connection settings (auth-protected) |
| Create | `src/app/api/calibre/feed/route.ts` | Proxy OPDS feeds from configured Calibre server |
| Create | `src/app/api/calibre/download/route.ts` | Proxy binary downloads (EPUBs, images) from Calibre server |
| Delete | `src/app/api/opds/route.ts` | Replaced by feed + download routes |
| Modify | `src/app/page.tsx` | UI renames, replace localStorage state with server config, update all OPDS function signatures |

---

### Task 1: Add `calibre_config` table and DB functions

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add the table creation SQL**

After the existing `books` table creation (line 28), add:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS calibre_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    url TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)
```

- [ ] **Step 2: Add the CalibreConfig interface and prepared statements**

After the existing `stmts` object (line 56), add:

```typescript
export interface CalibreConfig {
  url: string
  username: string
  password: string
}

const calibreStmts = {
  get: db.prepare(`SELECT url, username, password FROM calibre_config WHERE id = 1`),
  upsert: db.prepare(`
    INSERT INTO calibre_config (id, url, username, password, updated_at)
    VALUES (1, @url, @username, @password, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      url = @url,
      username = @username,
      password = @password,
      updated_at = datetime('now')
  `),
  delete: db.prepare(`DELETE FROM calibre_config WHERE id = 1`),
  getPassword: db.prepare(`SELECT password FROM calibre_config WHERE id = 1`),
}
```

- [ ] **Step 3: Add the CRUD functions**

After `calibreStmts`, add:

```typescript
export function getCalibreConfig(): CalibreConfig | null {
  return (calibreStmts.get.get() as CalibreConfig) ?? null
}

export function setCalibreConfig(config: CalibreConfig): void {
  calibreStmts.upsert.run(config)
}

export function deleteCalibreConfig(): void {
  calibreStmts.delete.run()
}

export function getCalibrePassword(): string | null {
  const row = calibreStmts.getPassword.get() as { password: string } | undefined
  return row?.password ?? null
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/gego/conductor/workspaces/xtc/berlin-v2 && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to db.ts

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add calibre_config table and CRUD functions"
```

---

### Task 2: Create `/api/calibre/config` route

**Files:**
- Create: `src/app/api/calibre/config/route.ts`

- [ ] **Step 1: Create the config route**

```typescript
import { NextRequest } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getCalibreConfig, setCalibreConfig, deleteCalibreConfig, getCalibrePassword } from "@/lib/db"

export async function GET(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const config = getCalibreConfig()
  if (!config) return Response.json(null)

  // Never return the password
  return Response.json({ url: config.url, username: config.username })
}

export async function PUT(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const body = await request.json()
  const { url, username, password } = body as {
    url?: string
    username?: string
    password?: string
  }

  if (!url || typeof url !== "string") {
    return Response.json({ error: "url is required" }, { status: 400 })
  }

  // Validate URL format
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return Response.json({ error: "Only HTTP(S) URLs allowed" }, { status: 400 })
    }
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 })
  }

  // If password is empty/missing, keep the existing one
  let finalPassword = password ?? ""
  if (!finalPassword) {
    finalPassword = getCalibrePassword() ?? ""
  }

  setCalibreConfig({
    url: url.replace(/\/+$/, ""),
    username: username ?? "",
    password: finalPassword,
  })

  return Response.json({ url: url.replace(/\/+$/, ""), username: username ?? "" })
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  deleteCalibreConfig()
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/gego/conductor/workspaces/xtc/berlin-v2 && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calibre/config/route.ts
git commit -m "feat: add /api/calibre/config route for managing Calibre settings"
```

---

### Task 3: Create `/api/calibre/feed` and `/api/calibre/download` routes

**Files:**
- Create: `src/app/api/calibre/feed/route.ts`
- Create: `src/app/api/calibre/download/route.ts`

- [ ] **Step 1: Create the feed proxy route**

```typescript
import { NextRequest } from "next/server"
import { getCalibreConfig } from "@/lib/db"

export async function GET(request: NextRequest) {
  const config = getCalibreConfig()
  if (!config) {
    return Response.json({ error: "Calibre not configured" }, { status: 404 })
  }

  // Default to /opds root feed
  const path = request.nextUrl.searchParams.get("path") || "/opds"

  const targetUrl = `${config.url}${path}`

  const headers: HeadersInit = {
    Accept: "application/atom+xml, application/xml, text/xml",
  }
  if (config.username) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${config.username}:${config.password}`).toString("base64")
  }

  try {
    const resp = await fetch(targetUrl, { headers })
    const text = await resp.text()
    const contentType = resp.headers.get("content-type") || "application/xml"
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": contentType },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed"
    return Response.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: Create the download proxy route**

```typescript
import { NextRequest } from "next/server"
import { getCalibreConfig } from "@/lib/db"

export async function GET(request: NextRequest) {
  const config = getCalibreConfig()
  if (!config) {
    return Response.json({ error: "Calibre not configured" }, { status: 404 })
  }

  const path = request.nextUrl.searchParams.get("path")
  if (!path) {
    return Response.json({ error: "Missing path parameter" }, { status: 400 })
  }

  const targetUrl = `${config.url}${path}`

  const headers: HeadersInit = {}
  if (config.username) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${config.username}:${config.password}`).toString("base64")
  }

  try {
    const resp = await fetch(targetUrl, { headers })

    const contentType = resp.headers.get("content-type") || "application/octet-stream"
    const responseHeaders: HeadersInit = {
      "Content-Type": contentType,
    }
    const disposition = resp.headers.get("content-disposition")
    if (disposition) {
      responseHeaders["Content-Disposition"] = disposition
    }

    return new Response(resp.body, {
      status: resp.status,
      headers: responseHeaders,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed"
    return Response.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/gego/conductor/workspaces/xtc/berlin-v2 && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/calibre/feed/route.ts src/app/api/calibre/download/route.ts
git commit -m "feat: add /api/calibre/feed and /api/calibre/download proxy routes"
```

---

### Task 4: Delete the old `/api/opds` route

**Files:**
- Delete: `src/app/api/opds/route.ts`

- [ ] **Step 1: Remove the file**

```bash
rm src/app/api/opds/route.ts
rmdir src/app/api/opds
```

- [ ] **Step 2: Commit**

```bash
git add -A src/app/api/opds
git commit -m "chore: remove old /api/opds proxy route"
```

---

### Task 5: Refactor `src/lib/opds.ts` — remove localStorage, simplify API

**Files:**
- Modify: `src/lib/opds.ts`

This is the biggest change. The file needs to:
1. Remove `OpdsServer` type, `STORAGE_KEY`, `loadServer`, `saveServer`, `clearServer`, `makeAuthHeader`
2. Change `resolveUrl` to extract paths instead of building absolute URLs
3. Change `fetchFeed` and `downloadEpub` to call the new `/api/calibre/*` routes without auth
4. Add config API helpers
5. Keep `OpdsFeed`, `OpdsEntry`, XML parsing, `parseFeed`, `parseEntry` intact (with path extraction changes)

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/lib/opds.ts` with:

```typescript
import { XMLParser } from "fast-xml-parser"

// ── Types ────────────────────────────────────────────────────────────

export interface OpdsEntry {
  id: string
  title: string
  authors: string[]
  summary: string
  updated: string
  coverPath: string | null       // was coverUrl — now a relative path
  thumbnailPath: string | null   // was thumbnailUrl — now a relative path
  formats: { type: string; path: string }[]  // href → path
  hasEpub: boolean
  epubPath: string | null        // was epubHref — now a relative path
  navigationPath: string | null  // was navigationHref — now a relative path
}

export interface OpdsFeed {
  title: string
  entries: OpdsEntry[]
  nextPath: string | null    // was nextUrl — now a relative path
  searchPath: string | null  // was searchUrl — now a relative path
}

export interface CalibreConfigPublic {
  url: string
  username: string
}

// ── XML Parser ──────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => {
    return ["entry", "link", "author"].includes(name)
  },
})

// ── Calibre Config API ──────────────────────────────────────────────

export async function fetchCalibreConfig(): Promise<CalibreConfigPublic | null> {
  const resp = await fetch("/api/calibre/config")
  if (!resp.ok) return null
  return resp.json()
}

export async function saveCalibreConfig(config: {
  url: string
  username: string
  password: string
}): Promise<CalibreConfigPublic> {
  const resp = await fetch("/api/calibre/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: "Save failed" }))
    throw new Error(body.error || "Save failed")
  }
  return resp.json()
}

export async function deleteCalibreConfig(): Promise<void> {
  await fetch("/api/calibre/config", { method: "DELETE" })
}

// ── Feed Fetching ───────────────────────────────────────────────────

export async function fetchFeed(path?: string): Promise<OpdsFeed> {
  const params = path ? `?path=${encodeURIComponent(path)}` : ""
  const resp = await fetch(`/api/calibre/feed${params}`)
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Feed fetch failed (${resp.status}): ${body}`)
  }
  const xml = await resp.text()
  return parseFeed(xml)
}

export async function downloadEpub(path: string): Promise<File> {
  const resp = await fetch(`/api/calibre/download?path=${encodeURIComponent(path)}`)
  if (!resp.ok) {
    throw new Error(`Download failed (${resp.status})`)
  }

  const blob = await resp.blob()

  // Extract filename from Content-Disposition or path
  const disposition = resp.headers.get("content-disposition")
  let filename = "book.epub"
  if (disposition) {
    const match = disposition.match(/filename[*]?=(?:UTF-8''|"?)([^";]+)/i)
    if (match) filename = decodeURIComponent(match[1].replace(/"/g, ""))
  } else {
    const last = path.split("/").pop()
    if (last && last.includes(".")) filename = decodeURIComponent(last)
  }

  if (!filename.toLowerCase().endsWith(".epub")) filename += ".epub"

  return new File([blob], filename, { type: "application/epub+zip" })
}

// ── XML Parsing ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any

/** Extract the path portion from a URL. Relative paths pass through as-is.
 *  Absolute URLs (http://...) get their pathname + search extracted. */
function extractPath(href: string): string {
  if (!href) return ""
  if (href.startsWith("http")) {
    try {
      const u = new URL(href)
      return u.pathname + u.search
    } catch {
      return href
    }
  }
  return href
}

function textOf(node: XmlNode): string {
  if (node == null) return ""
  if (typeof node === "string") return node.trim()
  if (typeof node === "number") return String(node)
  if (node["#text"] != null) return String(node["#text"]).trim()
  return ""
}

function parseFeed(xml: string): OpdsFeed {
  const doc = xmlParser.parse(xml)
  const feed = doc.feed ?? doc

  const title = textOf(feed.title) || "Calibre"

  const links: XmlNode[] = feed.link ?? []

  let searchPath: string | null = null
  let nextPath: string | null = null

  for (const link of links) {
    const rel = link["@_rel"] || ""
    const href = link["@_href"] || ""
    if (rel === "search" && href) {
      searchPath = extractPath(href)
    } else if (rel === "next" && href) {
      nextPath = extractPath(href)
    }
  }

  const rawEntries: XmlNode[] = feed.entry ?? []
  const entries = rawEntries.map((e: XmlNode) => parseEntry(e))

  return { title, entries, nextPath, searchPath }
}

function parseEntry(entry: XmlNode): OpdsEntry {
  const id = textOf(entry.id)
  const title = textOf(entry.title)
  const updated = textOf(entry.updated)
  const summary = textOf(entry.summary) || textOf(entry.content)

  const rawAuthors: XmlNode[] = entry.author ?? []
  const authors = rawAuthors
    .map((a: XmlNode) => textOf(a.name))
    .filter((n: string) => n.length > 0)

  const links: XmlNode[] = entry.link ?? []

  let coverPath: string | null = null
  let thumbnailPath: string | null = null
  const formats: { type: string; path: string }[] = []
  let navigationPath: string | null = null

  for (const link of links) {
    const rel: string = link["@_rel"] || ""
    const href: string = link["@_href"] || ""
    const type: string = link["@_type"] || ""

    if (rel.includes("http://opds-spec.org/image/thumbnail")) {
      thumbnailPath = extractPath(href)
    } else if (rel.includes("http://opds-spec.org/image")) {
      coverPath = extractPath(href)
    } else if (rel.includes("http://opds-spec.org/acquisition")) {
      formats.push({ type, path: extractPath(href) })
    } else if (
      rel === "subsection" ||
      (type.includes("application/atom+xml") && !rel.includes("acquisition"))
    ) {
      navigationPath = extractPath(href)
    }
  }

  const epubFormat = formats.find(
    (f) => f.type === "application/epub+zip" || f.path.toLowerCase().includes("/epub/")
  )

  return {
    id,
    title,
    authors,
    summary,
    updated,
    coverPath,
    thumbnailPath,
    formats,
    hasEpub: !!epubFormat,
    epubPath: epubFormat?.path ?? null,
    navigationPath,
  }
}
```

- [ ] **Step 2: Verify it compiles (expect page.tsx errors — that's fine, Task 6 fixes them)**

Run: `cd /Users/gego/conductor/workspaces/xtc/berlin-v2 && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Errors only in `page.tsx` (referencing removed types/functions). No errors in `opds.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/opds.ts
git commit -m "refactor: rewrite opds.ts for server-owned credentials, remove localStorage"
```

---

### Task 6: Update `page.tsx` — state, functions, UI labels

**Files:**
- Modify: `src/app/page.tsx`

This task updates all the consumer code in page.tsx. Changes are grouped by area.

- [ ] **Step 1: Update imports (line 29-31)**

Replace:

```typescript
  type OpdsServer, type OpdsEntry, type OpdsFeed,
  loadServer, saveServer, clearServer, fetchFeed, downloadEpub,
```

With:

```typescript
  type OpdsEntry, type OpdsFeed,
  fetchCalibreConfig, saveCalibreConfig, deleteCalibreConfig,
  fetchFeed, downloadEpub,
```

- [ ] **Step 2: Replace `opdsServer` state (line 591)**

Replace:

```typescript
  const [opdsServer, setOpdsServer] = useState<OpdsServer | null>(null)
```

With:

```typescript
  const [calibreConnected, setCalibreConnected] = useState(false)
```

- [ ] **Step 3: Update the useEffect that loads saved server on mount (line 608-609)**

Replace:

```typescript
    const savedOpds = loadServer()
    if (savedOpds) setOpdsServer(savedOpds)
```

With:

```typescript
    fetchCalibreConfig().then(config => {
      if (config) setCalibreConnected(true)
    })
```

- [ ] **Step 4: Rewrite `opdsBrowse` (lines 882-898)**

Replace the entire `opdsBrowse` callback with:

```typescript
  const opdsBrowse = useCallback(async (path?: string) => {
    if (!calibreConnected) { setOpdsSettingsOpen(true); return }
    setOpdsLoading(true); setOpdsError("")
    try {
      const feed = await fetchFeed(path)
      setOpdsFeed(feed)
      if (path) {
        setOpdsNavStack(prev => [...prev, path])
      }
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Failed to connect")
    } finally {
      setOpdsLoading(false)
    }
  }, [calibreConnected])
```

- [ ] **Step 5: Rewrite `opdsBack` (lines 900-917)**

Replace the entire `opdsBack` callback with:

```typescript
  const opdsBack = useCallback(() => {
    if (opdsNavStack.length <= 1) {
      setOpdsNavStack([])
      opdsBrowse()
      return
    }
    const prev = [...opdsNavStack]
    prev.pop()
    const path = prev[prev.length - 1]
    setOpdsNavStack(prev)
    setOpdsLoading(true); setOpdsError("")
    fetchFeed(path)
      .then(feed => setOpdsFeed(feed))
      .catch(err => setOpdsError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setOpdsLoading(false))
  }, [opdsNavStack, opdsBrowse])
```

- [ ] **Step 6: Rewrite `opdsDoSearch` (lines 919-936)**

Replace the entire `opdsDoSearch` callback with:

```typescript
  const opdsDoSearch = useCallback(async () => {
    if (!opdsSearch.trim()) return
    if (!calibreConnected) return
    setOpdsLoading(true); setOpdsError("")
    try {
      const searchPath = `/opds/search?query=${encodeURIComponent(opdsSearch.trim())}`
      const feed = await fetchFeed(searchPath)
      setOpdsFeed(feed)
      setOpdsNavStack([searchPath])
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setOpdsLoading(false)
    }
  }, [opdsSearch, calibreConnected])
```

- [ ] **Step 7: Rewrite `opdsImportBook` (lines 938-956)**

Replace the entire `opdsImportBook` callback with:

```typescript
  const opdsImportBook = useCallback(async (entry: OpdsEntry) => {
    if (!entry.epubPath) return
    setOpdsDownloading(prev => new Set(prev).add(entry.id))
    try {
      const file = await downloadEpub(entry.epubPath)
      addFiles([file])
    } catch (err) {
      console.error("Calibre download failed:", err)
      setOpdsError(`Failed to download "${entry.title}"`)
    } finally {
      setOpdsDownloading(prev => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }, [addFiles])
```

- [ ] **Step 8: Rewrite `opdsSaveSettings` (lines 958-965)**

Replace the entire `opdsSaveSettings` callback with:

```typescript
  const opdsSaveSettings = useCallback(async (config: { url: string; username: string; password: string }) => {
    try {
      await saveCalibreConfig(config)
      setCalibreConnected(true)
      setOpdsSettingsOpen(false)
      setOpdsFeed(null)
      setOpdsNavStack([])
      setOpdsError("")
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Failed to save settings")
    }
  }, [])
```

- [ ] **Step 9: Rewrite `opdsDisconnect` (lines 967-969+)**

Replace the entire `opdsDisconnect` callback with:

```typescript
  const opdsDisconnect = useCallback(async () => {
    await deleteCalibreConfig()
    setCalibreConnected(false)
    setOpdsFeed(null)
    setOpdsNavStack([])
    setOpdsError("")
    setOpdsSearch("")
  }, [])
```

- [ ] **Step 10: Update the Tabs onValueChange (line 1412)**

Replace `opdsServer` with `calibreConnected`:

```typescript
if (v === 2 && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse()
```

- [ ] **Step 11: Update UI labels**

Line 1417 — tab trigger:
```
"Library" → "Calibre"
```

Line 1869 — header label:
```typescript
{opdsServer ? "Calibre-Web" : "OPDS Library"}
```
→
```typescript
{calibreConnected ? "Calibre-Web" : "Calibre"}
```

Line 1876 — settings button title:
```
"Library settings" → "Calibre settings"
```

Line 1882 — empty state condition:
```typescript
{!opdsServer ? (
```
→
```typescript
{!calibreConnected ? (
```

Line 1889 — connect prompt:
```
"Connect to your library" → "Connect to Calibre"
```

Line 1890 — description:
```
"Browse and import books from Calibre-Web via OPDS" → "Browse and import books from your Calibre-Web server"
```

Line 1957 — thumbnail condition:
```typescript
{entry.thumbnailUrl && opdsServer && (
```
→
```typescript
{entry.thumbnailPath && (
```

Line 1960 — thumbnail src:
```typescript
src={`/api/opds?url=${encodeURIComponent(entry.thumbnailUrl)}`}
```
→
```typescript
src={`/api/calibre/download?path=${encodeURIComponent(entry.thumbnailPath)}`}
```

Line 2048 — browse button:
```
"Browse Library" → "Browse Calibre"
```

Line 2284 — dialog title:
```
"Library Connection" → "Calibre Connection"
```

Line 2286 — dialog description:
```
"Connect to a Calibre-Web server via OPDS feed." → "Connect to your Calibre-Web server."
```

- [ ] **Step 12: Update the connection dialog form (lines 2289-2300)**

Replace the form onSubmit handler:

```typescript
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const data = new FormData(form)
              opdsSaveSettings({
                url: (data.get("url") as string).replace(/\/+$/, ""),
                username: data.get("username") as string,
                password: data.get("password") as string,
              })
            }}
```

(No change to the handler shape — `opdsSaveSettings` already accepts `{ url, username, password }` after Step 8.)

- [ ] **Step 13: Update dialog form defaultValues (lines 2307, 2317, 2328)**

Remove the `defaultValue` props that referenced `opdsServer`:

Line 2307: `defaultValue={opdsServer?.url ?? ""}` → `defaultValue=""`
Line 2317: `defaultValue={opdsServer?.username ?? ""}` → `defaultValue=""`
Line 2328: `defaultValue={opdsServer?.password ?? ""}` → `defaultValue=""`

The dialog doesn't pre-fill from server config (password is never returned). Users re-enter when editing. This is acceptable for a rarely-used settings dialog.

- [ ] **Step 14: Update disconnect button condition (line 2334)**

```typescript
{opdsServer && (
```
→
```typescript
{calibreConnected && (
```

- [ ] **Step 15: Update field references for `navigationHref` → `navigationPath`**

Line 1946 (`isNav` check):
```typescript
const isNav = !!entry.navigationHref
```
→
```typescript
const isNav = !!entry.navigationPath
```

Line 1954 (onClick):
```typescript
onClick={isNav ? () => { if (entry.navigationHref) opdsBrowse(entry.navigationHref) } : undefined}
```
→
```typescript
onClick={isNav ? () => { if (entry.navigationPath) opdsBrowse(entry.navigationPath) } : undefined}
```

Line 2028 (pagination nextUrl → nextPath):
```typescript
{opdsFeed.nextUrl && (
```
→
```typescript
{opdsFeed.nextPath && (
```

Line 2034 (pagination click):
```typescript
onClick={() => opdsBrowse(opdsFeed.nextUrl!)}
```
→
```typescript
onClick={() => opdsBrowse(opdsFeed.nextPath!)}
```

- [ ] **Step 16: Update `epubHref` references to `epubPath`**

In the import button (around line 2002):
```typescript
{entry.hasEpub && (
```
This stays the same — `hasEpub` is still a boolean.

The `opdsImportBook` already uses `entry.epubPath` (updated in Step 7).

- [ ] **Step 17: Verify the full project compiles**

Run: `cd /Users/gego/conductor/workspaces/xtc/berlin-v2 && npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors

- [ ] **Step 18: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor: update page.tsx for Calibre rename and server-owned credentials"
```

---

### Task 7: Smoke test and verify

- [ ] **Step 1: Start the dev server and verify it builds**

Run: `cd /Users/gego/conductor/workspaces/xtc/berlin-v2 && pnpm dev`
Expected: Server starts without build errors.

- [ ] **Step 2: Verify no remaining references to old routes or types**

Run these searches:

```bash
# Should return no results:
grep -r "api/opds" src/
grep -r "loadServer\|saveServer\|clearServer\|OpdsServer" src/
grep -r "thumbnailUrl\|coverUrl\|epubHref\|navigationHref\|nextUrl\|searchUrl" src/lib/opds.ts
```

- [ ] **Step 3: Commit any fixes if needed, then stop dev server**
