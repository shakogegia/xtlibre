# OPDS Book Import from Calibre-Web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users browse their Calibre-Web library via OPDS and import EPUBs directly into the XTC converter, without leaving the app.

**Architecture:** A Next.js route handler proxies OPDS requests to avoid CORS issues. A new `src/lib/opds.ts` module parses Atom/XML feeds into typed book entries. The UI adds a "Library" tab to the sidebar and a settings modal for server configuration. Books are fetched as `File` objects and fed into the existing `addFiles` pipeline.

**Tech Stack:** Native `fetch` (no axios — it's unnecessary for simple GET requests), `DOMParser` for XML parsing (built into browsers), Next.js route handlers for proxy, shadcn Dialog component for settings modal.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/lib/opds.ts` | OPDS XML parsing, types, feed fetching logic |
| Create | `src/app/api/opds/route.ts` | Server-side proxy to avoid CORS |
| Create | `src/components/ui/dialog.tsx` | shadcn Dialog component (needed for settings modal) |
| Modify | `src/app/page.tsx` | Add Library tab, settings modal, OPDS browse UI |

---

### Task 1: Add shadcn Dialog component

**Files:**
- Create: `src/components/ui/dialog.tsx`

This project uses shadcn/base-ui. We need to add the Dialog component for the settings modal.

- [ ] **Step 1: Generate the Dialog component**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm dlx shadcn@latest add dialog
```

If the CLI prompts, accept defaults. This creates `src/components/ui/dialog.tsx`.

- [ ] **Step 2: Verify the component was created**

Run:
```bash
ls -la src/components/ui/dialog.tsx
```

Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: add shadcn Dialog component for OPDS settings modal"
```

---

### Task 2: OPDS proxy route handler

**Files:**
- Create: `src/app/api/opds/route.ts`

The browser can't directly fetch from a user's Calibre-Web server (CORS). This route handler proxies requests server-side.

- [ ] **Step 1: Create the proxy route**

Create `src/app/api/opds/route.ts`:

```typescript
import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")
  if (!url) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 })
  }

  // Validate URL format
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 })
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Response.json({ error: "Only HTTP(S) URLs allowed" }, { status: 400 })
  }

  // Forward auth header if provided
  const headers: HeadersInit = {
    Accept: "application/atom+xml, application/xml, text/xml",
  }
  const auth = request.headers.get("authorization")
  if (auth) {
    headers["Authorization"] = auth
  }

  try {
    const resp = await fetch(url, { headers })

    // For binary downloads (epub files), stream the response
    const contentType = resp.headers.get("content-type") || ""
    if (
      contentType.includes("application/epub") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/zip")
    ) {
      return new Response(resp.body, {
        status: resp.status,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition":
            resp.headers.get("content-disposition") || "",
        },
      })
    }

    // For XML feeds, return as text
    const text = await resp.text()
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": contentType || "application/xml" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed"
    return Response.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: Verify the dev server starts without errors**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm dev &
sleep 3
curl -s "http://localhost:3000/api/opds" | head -5
kill %1
```

Expected: `{"error":"Missing url parameter"}` with 400 status.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/opds/route.ts
git commit -m "feat: add OPDS proxy route handler for CORS-free Calibre-Web access"
```

---

### Task 3: OPDS parsing library

**Files:**
- Create: `src/lib/opds.ts`

Parses Calibre-Web OPDS Atom feeds into typed structures. Uses `DOMParser` (browser built-in) — no external XML library needed.

- [ ] **Step 1: Create the OPDS module**

Create `src/lib/opds.ts`:

```typescript
// ── Types ────────────────────────────────────────────────────────────

export interface OpdsServer {
  url: string       // Base URL, e.g. "https://books.example.com"
  username: string
  password: string
}

export interface OpdsEntry {
  id: string
  title: string
  authors: string[]
  summary: string
  updated: string
  coverUrl: string | null
  thumbnailUrl: string | null
  formats: { type: string; href: string }[]  // All acquisition links
  hasEpub: boolean
  epubHref: string | null  // Direct link to EPUB download
}

export interface OpdsFeed {
  title: string
  entries: OpdsEntry[]
  nextUrl: string | null  // Pagination
  searchUrl: string | null  // OpenSearch template URL
}

// ── Constants ────────────────────────────────────────────────────────

const ATOM_NS = "http://www.w3.org/2005/Atom"
const OPDS_NS = "http://opds-spec.org/2010/catalog"

const STORAGE_KEY = "xtc-opds-server"

// ── Storage ──────────────────────────────────────────────────────────

export function loadServer(): OpdsServer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OpdsServer
  } catch {
    return null
  }
}

export function saveServer(server: OpdsServer) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(server))
}

export function clearServer() {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Fetching (via proxy) ─────────────────────────────────────────────

function makeAuthHeader(server: OpdsServer): string | null {
  if (!server.username) return null
  return "Basic " + btoa(`${server.username}:${server.password}`)
}

export async function fetchFeed(
  feedUrl: string,
  server: OpdsServer
): Promise<OpdsFeed> {
  // Resolve relative URLs against the server base
  const absoluteUrl = feedUrl.startsWith("http")
    ? feedUrl
    : new URL(feedUrl, server.url).href

  const proxyUrl = `/api/opds?url=${encodeURIComponent(absoluteUrl)}`
  const headers: HeadersInit = {}
  const auth = makeAuthHeader(server)
  if (auth) headers["Authorization"] = auth

  const resp = await fetch(proxyUrl, { headers })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`OPDS fetch failed (${resp.status}): ${body}`)
  }

  const xml = await resp.text()
  return parseFeed(xml, server.url)
}

export async function downloadEpub(
  href: string,
  server: OpdsServer
): Promise<File> {
  const absoluteUrl = href.startsWith("http")
    ? href
    : new URL(href, server.url).href

  const proxyUrl = `/api/opds?url=${encodeURIComponent(absoluteUrl)}`
  const headers: HeadersInit = {}
  const auth = makeAuthHeader(server)
  if (auth) headers["Authorization"] = auth

  const resp = await fetch(proxyUrl, { headers })
  if (!resp.ok) {
    throw new Error(`Download failed (${resp.status})`)
  }

  const blob = await resp.blob()

  // Extract filename from Content-Disposition or URL
  const disposition = resp.headers.get("content-disposition")
  let filename = "book.epub"
  if (disposition) {
    const match = disposition.match(/filename[*]?=(?:UTF-8''|"?)([^";]+)/i)
    if (match) filename = decodeURIComponent(match[1].replace(/"/g, ""))
  } else {
    const urlPath = new URL(absoluteUrl).pathname
    const last = urlPath.split("/").pop()
    if (last && last.includes(".")) filename = decodeURIComponent(last)
  }

  // Ensure .epub extension
  if (!filename.toLowerCase().endsWith(".epub")) filename += ".epub"

  return new File([blob], filename, { type: "application/epub+zip" })
}

// ── XML Parsing ──────────────────────────────────────────────────────

function parseFeed(xml: string, baseUrl: string): OpdsFeed {
  const doc = new DOMParser().parseFromString(xml, "application/xml")

  const parseError = doc.querySelector("parsererror")
  if (parseError) {
    throw new Error("Invalid XML in OPDS feed")
  }

  const feed = doc.documentElement

  // Feed title
  const titleEl = feed.getElementsByTagNameNS(ATOM_NS, "title")[0]
    ?? feed.getElementsByTagName("title")[0]
  const title = titleEl?.textContent ?? "Library"

  // Search URL (OpenSearch)
  let searchUrl: string | null = null
  const links = feed.getElementsByTagNameNS(ATOM_NS, "link")
  const linksAlt = feed.getElementsByTagName("link")
  const allLinks = links.length > 0 ? links : linksAlt

  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i]
    const rel = link.getAttribute("rel") || ""
    if (rel === "search") {
      const href = link.getAttribute("href")
      if (href) {
        searchUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href
      }
    }
  }

  // Next page URL (pagination)
  let nextUrl: string | null = null
  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i]
    if (link.getAttribute("rel") === "next") {
      const href = link.getAttribute("href")
      if (href) {
        nextUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href
      }
    }
  }

  // Entries
  const entryEls = feed.getElementsByTagNameNS(ATOM_NS, "entry")
  const entryElsAlt = feed.getElementsByTagName("entry")
  const rawEntries = entryEls.length > 0 ? entryEls : entryElsAlt

  const entries: OpdsEntry[] = []
  for (let i = 0; i < rawEntries.length; i++) {
    entries.push(parseEntry(rawEntries[i], baseUrl))
  }

  return { title, entries, nextUrl, searchUrl }
}

function parseEntry(entry: Element, baseUrl: string): OpdsEntry {
  const text = (tag: string) => {
    const el = entry.getElementsByTagNameNS(ATOM_NS, tag)[0]
      ?? entry.getElementsByTagName(tag)[0]
    return el?.textContent?.trim() ?? ""
  }

  const id = text("id")
  const title = text("title")
  const updated = text("updated")
  const summary = text("summary") || text("content")

  // Authors
  const authorEls = entry.getElementsByTagNameNS(ATOM_NS, "author")
  const authorElsAlt = entry.getElementsByTagName("author")
  const rawAuthors = authorEls.length > 0 ? authorEls : authorElsAlt
  const authors: string[] = []
  for (let i = 0; i < rawAuthors.length; i++) {
    const nameEl = rawAuthors[i].getElementsByTagNameNS(ATOM_NS, "name")[0]
      ?? rawAuthors[i].getElementsByTagName("name")[0]
    if (nameEl?.textContent) authors.push(nameEl.textContent.trim())
  }

  // Links
  const linkEls = entry.getElementsByTagNameNS(ATOM_NS, "link")
  const linkElsAlt = entry.getElementsByTagName("link")
  const allLinks = linkEls.length > 0 ? linkEls : linkElsAlt

  let coverUrl: string | null = null
  let thumbnailUrl: string | null = null
  const formats: { type: string; href: string }[] = []
  let navigationHref: string | null = null

  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i]
    const rel = link.getAttribute("rel") || ""
    const href = link.getAttribute("href") || ""
    const type = link.getAttribute("type") || ""

    if (rel.includes("http://opds-spec.org/image/thumbnail")) {
      thumbnailUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href
    } else if (rel.includes("http://opds-spec.org/image")) {
      coverUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href
    } else if (rel.includes("http://opds-spec.org/acquisition")) {
      const absHref = href.startsWith("http") ? href : new URL(href, baseUrl).href
      formats.push({ type, href: absHref })
    } else if (
      rel === "subsection" ||
      (type.includes("application/atom+xml") && !rel.includes("acquisition"))
    ) {
      // Navigation link — this entry is a category/shelf, not a book
      navigationHref = href
    }
  }

  const epubFormat = formats.find(
    (f) => f.type === "application/epub+zip" || f.href.toLowerCase().includes("/epub/")
  )

  return {
    id,
    title,
    authors,
    summary,
    updated,
    coverUrl,
    thumbnailUrl,
    formats,
    hasEpub: !!epubFormat,
    epubHref: epubFormat?.href ?? null,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && npx tsc --noEmit src/lib/opds.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/opds.ts
git commit -m "feat: add OPDS feed parser with types, fetch, and download helpers"
```

---

### Task 4: Library tab and settings modal in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

This is the main task. We add:
1. A third "Library" tab in the sidebar
2. A settings modal (triggered by gear icon in the Library tab, or auto-shown on first use)
3. Browse/search UI showing books from the OPDS catalog
4. Import button that downloads EPUB and feeds it into `addFiles`

**Important:** `page.tsx` is a large single-file component by design (see CLAUDE.md). All changes go here.

- [ ] **Step 1: Add imports**

At the top of `src/app/page.tsx`, add the OPDS and Dialog imports. After the existing import block (around line 22), add:

```typescript
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  type OpdsServer, type OpdsEntry, type OpdsFeed,
  loadServer, saveServer, clearServer, fetchFeed, downloadEpub,
} from "@/lib/opds"
```

- [ ] **Step 2: Add OPDS state variables**

Inside the `EpubToXtcConverter` component, after the existing UI state block (after line ~580, near `const [dragOver, setDragOver] = useState(false)`), add:

```typescript
  // OPDS state
  const [opdsServer, setOpdsServer] = useState<OpdsServer | null>(null)
  const [opdsSettingsOpen, setOpdsSettingsOpen] = useState(false)
  const [opdsFeed, setOpdsFeed] = useState<OpdsFeed | null>(null)
  const [opdsLoading, setOpdsLoading] = useState(false)
  const [opdsError, setOpdsError] = useState("")
  const [opdsSearch, setOpdsSearch] = useState("")
  const [opdsNavStack, setOpdsNavStack] = useState<string[]>([])
  const [opdsDownloading, setOpdsDownloading] = useState<Set<string>>(new Set())
```

- [ ] **Step 3: Add OPDS localStorage hydration**

In the existing `useEffect` that hydrates from localStorage (the one that loads `STORAGE_KEY_SETTINGS`, around line 583), add at the end of the effect body:

```typescript
    const savedOpds = loadServer()
    if (savedOpds) setOpdsServer(savedOpds)
```

- [ ] **Step 4: Add OPDS helper functions**

After the `flushRender` callback (around line 798), add the OPDS callbacks:

```typescript
  // ── OPDS functions ──

  const opdsBrowse = useCallback(async (url?: string) => {
    const server = opdsServer ?? loadServer()
    if (!server) { setOpdsSettingsOpen(true); return }
    setOpdsLoading(true); setOpdsError("")
    try {
      const feedUrl = url || `${server.url}/opds`
      const feed = await fetchFeed(feedUrl, server)
      setOpdsFeed(feed)
      if (url && url !== `${server.url}/opds`) {
        setOpdsNavStack(prev => [...prev, feedUrl])
      }
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Failed to connect")
    } finally {
      setOpdsLoading(false)
    }
  }, [opdsServer])

  const opdsBack = useCallback(() => {
    if (opdsNavStack.length <= 1) {
      setOpdsNavStack([])
      opdsBrowse()
      return
    }
    const prev = [...opdsNavStack]
    prev.pop()
    const url = prev[prev.length - 1]
    setOpdsNavStack(prev)
    const server = opdsServer ?? loadServer()
    if (!server) return
    setOpdsLoading(true); setOpdsError("")
    fetchFeed(url, server)
      .then(feed => setOpdsFeed(feed))
      .catch(err => setOpdsError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setOpdsLoading(false))
  }, [opdsNavStack, opdsServer, opdsBrowse])

  const opdsDoSearch = useCallback(async () => {
    if (!opdsSearch.trim()) return
    const server = opdsServer ?? loadServer()
    if (!server) return
    setOpdsLoading(true); setOpdsError("")
    try {
      const feed = await fetchFeed(
        `${server.url}/opds/search?query=${encodeURIComponent(opdsSearch.trim())}`,
        server
      )
      setOpdsFeed(feed)
      setOpdsNavStack([`${server.url}/opds/search?query=${encodeURIComponent(opdsSearch.trim())}`])
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setOpdsLoading(false)
    }
  }, [opdsSearch, opdsServer])

  const opdsImportBook = useCallback(async (entry: OpdsEntry) => {
    if (!entry.epubHref) return
    const server = opdsServer ?? loadServer()
    if (!server) return
    setOpdsDownloading(prev => new Set(prev).add(entry.id))
    try {
      const file = await downloadEpub(entry.epubHref, server)
      addFiles([file])
    } catch (err) {
      console.error("OPDS download failed:", err)
      setOpdsError(`Failed to download "${entry.title}"`)
    } finally {
      setOpdsDownloading(prev => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }, [opdsServer, addFiles])

  const opdsSaveSettings = useCallback((server: OpdsServer) => {
    saveServer(server)
    setOpdsServer(server)
    setOpdsSettingsOpen(false)
    setOpdsFeed(null)
    setOpdsNavStack([])
    setOpdsError("")
  }, [])

  const opdsDisconnect = useCallback(() => {
    clearServer()
    setOpdsServer(null)
    setOpdsFeed(null)
    setOpdsNavStack([])
    setOpdsError("")
    setOpdsSearch("")
  }, [])
```

- [ ] **Step 5: Add the Library tab trigger**

In the `<TabsList>` (around line 1234), add a third tab trigger. Change:

```typescript
              <TabsTrigger value={0} className="text-[12px]">Files</TabsTrigger>
              <TabsTrigger value={1} className="text-[12px]">Options</TabsTrigger>
```

To:

```typescript
              <TabsTrigger value={0} className="text-[12px]">Files</TabsTrigger>
              <TabsTrigger value={1} className="text-[12px]">Options</TabsTrigger>
              <TabsTrigger value={2} className="text-[12px]">Library</TabsTrigger>
```

- [ ] **Step 6: Add the Library tab content**

After the Options `</TabsContent>` closing tag (around line 1682) and before `</Tabs>`, add the Library tab:

```tsx
          <TabsContent value={2} className="flex-1 min-h-0 flex flex-col px-4 pt-3">
            {/* Header with settings gear */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-medium text-muted-foreground">
                {opdsServer ? "Calibre-Web" : "OPDS Library"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setOpdsSettingsOpen(true)}
                title="Library settings"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              </Button>
            </div>

            {!opdsServer ? (
              /* No server configured — prompt to connect */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
                  </div>
                  <p className="text-[12px] font-medium text-muted-foreground mb-1">Connect to your library</p>
                  <p className="text-[11px] text-muted-foreground/60 mb-3">Browse and import books from Calibre-Web via OPDS</p>
                  <Button size="sm" className="h-7 text-[12px]" onClick={() => setOpdsSettingsOpen(true)}>
                    Connect
                  </Button>
                </div>
              </div>
            ) : (
              /* Connected — show browse UI */
              <>
                {/* Search bar */}
                <div className="flex gap-1.5 mb-3">
                  <Input
                    placeholder="Search books..."
                    className="h-7 text-[12px]"
                    value={opdsSearch}
                    onChange={(e) => setOpdsSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && opdsDoSearch()}
                  />
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={opdsDoSearch} disabled={opdsLoading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  </Button>
                </div>

                {/* Nav breadcrumb */}
                {opdsNavStack.length > 0 && (
                  <button
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-2 transition-colors"
                    onClick={opdsBack}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Back
                  </button>
                )}

                {/* Error */}
                {opdsError && (
                  <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1.5 mb-2">
                    {opdsError}
                    <button className="ml-2 underline" onClick={() => setOpdsError("")}>dismiss</button>
                  </div>
                )}

                {/* Loading */}
                {opdsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  </div>
                )}

                {/* Book list */}
                {!opdsLoading && opdsFeed && (
                  <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4">
                    {opdsFeed.entries.length === 0 && (
                      <p className="text-[11px] text-muted-foreground text-center py-4">No results</p>
                    )}
                    {opdsFeed.entries.map((entry) => {
                      const isNav = entry.formats.length === 0 && !entry.hasEpub
                      const isDownloading = opdsDownloading.has(entry.id)
                      return (
                        <div
                          key={entry.id}
                          className={`flex items-start gap-2.5 py-2 border-b border-border/30 last:border-0 ${
                            isNav ? "cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors" : ""
                          }`}
                          onClick={isNav ? () => {
                            // Find navigation link
                            const linkEls = entry as OpdsEntry & { _navHref?: string }
                            // Navigation entries have subsection links — re-fetch via OPDS
                            const navLink = entry.formats[0]?.href
                            // For navigation entries without formats, construct from id
                            const href = navLink || entry.id
                            opdsBrowse(href)
                          } : undefined}
                        >
                          {/* Thumbnail */}
                          {entry.thumbnailUrl && opdsServer && (
                            <img
                              src={`/api/opds?url=${encodeURIComponent(entry.thumbnailUrl)}&auth=${encodeURIComponent(opdsServer.username ? btoa(`${opdsServer.username}:${opdsServer.password}`) : "")}`}
                              alt=""
                              className="w-8 h-11 rounded-sm object-cover bg-muted shrink-0"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                            />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{entry.title}</div>
                            {entry.authors.length > 0 && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                {entry.authors.join(", ")}
                              </div>
                            )}
                            {/* Format badges */}
                            {entry.formats.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {entry.formats.map((f, i) => {
                                  const label = f.type.includes("epub") ? "EPUB"
                                    : f.type.includes("pdf") ? "PDF"
                                    : f.type.includes("mobi") ? "MOBI"
                                    : f.type.includes("fb2") ? "FB2"
                                    : f.type.split("/").pop()?.toUpperCase() || "?"
                                  return (
                                    <span
                                      key={i}
                                      className={`text-[10px] px-1 py-0.5 rounded ${
                                        label === "EPUB"
                                          ? "bg-primary/10 text-primary font-medium"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {label}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Import button — only for books with EPUB */}
                          {entry.hasEpub && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0 mt-0.5"
                              disabled={isDownloading}
                              onClick={(e) => { e.stopPropagation(); opdsImportBook(entry) }}
                              title="Import EPUB"
                            >
                              {isDownloading ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              )}
                            </Button>
                          )}

                          {/* Chevron for navigation entries */}
                          {isNav && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground mt-1"><path d="m9 18 6-6-6-6"/></svg>
                          )}
                        </div>
                      )
                    })}

                    {/* Load more (pagination) */}
                    {opdsFeed.nextUrl && (
                      <div className="py-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] text-muted-foreground"
                          onClick={() => opdsBrowse(opdsFeed.nextUrl!)}
                          disabled={opdsLoading}
                        >
                          Load more...
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Browse button — shown when no feed loaded yet */}
                {!opdsLoading && !opdsFeed && !opdsError && (
                  <div className="flex-1 flex items-center justify-center">
                    <Button size="sm" className="h-7 text-[12px]" onClick={() => opdsBrowse()}>
                      Browse Library
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
```

- [ ] **Step 7: Add the settings dialog**

Right before the closing `</div>` of the root element (the very end of the JSX return, before `</div>` that matches `<div className="flex h-screen bg-background">`), add the settings dialog:

```tsx
      {/* OPDS Settings Dialog */}
      <Dialog open={opdsSettingsOpen} onOpenChange={setOpdsSettingsOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Library Connection</DialogTitle>
            <DialogDescription className="text-[12px]">
              Connect to a Calibre-Web server via OPDS feed.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3 mt-2"
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
          >
            <div className="space-y-1.5">
              <Label className="text-[12px]">Server URL</Label>
              <Input
                name="url"
                placeholder="https://books.example.com"
                defaultValue={opdsServer?.url ?? ""}
                className="h-8 text-[12px]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Username</Label>
              <Input
                name="username"
                placeholder="Optional"
                defaultValue={opdsServer?.username ?? ""}
                className="h-8 text-[12px]"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Password</Label>
              <Input
                name="password"
                type="password"
                placeholder="Optional"
                defaultValue={opdsServer?.password ?? ""}
                className="h-8 text-[12px]"
                autoComplete="current-password"
              />
            </div>
            <div className="flex justify-between pt-1">
              {opdsServer && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-destructive hover:text-destructive"
                  onClick={() => { opdsDisconnect(); setOpdsSettingsOpen(false) }}
                >
                  Disconnect
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setOpdsSettingsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="h-7 text-[12px]">
                  Connect
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 8: Verify the app builds**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Library tab with OPDS browse, search, and import from Calibre-Web"
```

---

### Task 5: Handle navigation entries properly

**Files:**
- Modify: `src/lib/opds.ts`
- Modify: `src/app/page.tsx`

Calibre-Web OPDS uses "navigation" entries (categories, shelves, authors) that link to sub-feeds, not book downloads. The parser needs to expose these navigation hrefs so the UI can drill into them.

- [ ] **Step 1: Add `navigationHref` to `OpdsEntry` type**

In `src/lib/opds.ts`, update the `OpdsEntry` interface to add:

```typescript
  navigationHref: string | null  // For catalog navigation (categories, shelves)
```

- [ ] **Step 2: Return `navigationHref` from `parseEntry`**

In the `parseEntry` function in `src/lib/opds.ts`, the `navigationHref` variable is already extracted but not returned. Update the return object to include it:

```typescript
  return {
    id,
    title,
    authors,
    summary,
    updated,
    coverUrl,
    thumbnailUrl,
    formats,
    hasEpub: !!epubFormat,
    epubHref: epubFormat?.href ?? null,
    navigationHref,
  }
```

- [ ] **Step 3: Update navigation click handler in page.tsx**

In the Library tab's entry click handler, replace the navigation logic. Change the `onClick` for navigation entries from:

```typescript
                          onClick={isNav ? () => {
                            // Find navigation link
                            const linkEls = entry as OpdsEntry & { _navHref?: string }
                            // Navigation entries have subsection links — re-fetch via OPDS
                            const navLink = entry.formats[0]?.href
                            // For navigation entries without formats, construct from id
                            const href = navLink || entry.id
                            opdsBrowse(href)
                          } : undefined}
```

To:

```typescript
                          onClick={isNav ? () => {
                            if (entry.navigationHref) opdsBrowse(entry.navigationHref)
                          } : undefined}
```

And update the `isNav` check from:

```typescript
                      const isNav = entry.formats.length === 0 && !entry.hasEpub
```

To:

```typescript
                      const isNav = !!entry.navigationHref
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/opds.ts src/app/page.tsx
git commit -m "fix: properly handle OPDS navigation entries for catalog browsing"
```

---

### Task 6: Handle thumbnail images through proxy

**Files:**
- Modify: `src/app/api/opds/route.ts`

Cover thumbnails from Calibre-Web also need auth and CORS proxying. The current proxy only handles XML and EPUB. We need to also pass through image content types.

- [ ] **Step 1: Update proxy to handle images**

In `src/app/api/opds/route.ts`, update the binary response check. Change:

```typescript
    if (
      contentType.includes("application/epub") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/zip")
    ) {
```

To:

```typescript
    if (
      contentType.includes("application/epub") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/zip") ||
      contentType.startsWith("image/")
    ) {
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/opds/route.ts
git commit -m "fix: proxy image responses for OPDS cover thumbnails"
```

---

### Task 7: Auto-browse on Library tab activation

**Files:**
- Modify: `src/app/page.tsx`

When the user clicks the Library tab and has a server configured, automatically load the feed if it hasn't been loaded yet.

- [ ] **Step 1: Track active tab and auto-browse**

Add a controlled tab state. Find the existing `<Tabs defaultValue={0}` and change it to use controlled state. Add a state variable near the other UI state:

```typescript
  const [activeTab, setActiveTab] = useState(0)
```

Change `<Tabs defaultValue={0}` to `<Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as number); if (v === 2 && opdsServer && !opdsFeed && !opdsLoading) opdsBrowse() }}`.

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: auto-browse OPDS feed when switching to Library tab"
```

---

### Task 8: Final manual test and cleanup

- [ ] **Step 1: Run the dev server and test end-to-end**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm dev
```

Manually verify:
1. The Library tab appears in the sidebar
2. Clicking it when no server is configured shows the "Connect" prompt
3. The settings modal opens and accepts URL/credentials
4. After connecting, the OPDS catalog loads
5. Navigation entries (categories, authors) are clickable and drill into sub-feeds
6. Books show format badges (EPUB highlighted)
7. The import button downloads and loads the EPUB into the converter
8. Search works
9. Back navigation works
10. Disconnect removes the server from localStorage

- [ ] **Step 2: Run lint**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm lint
```

Fix any issues that come up.

- [ ] **Step 3: Run production build**

Run:
```bash
cd /Users/gego/conductor/workspaces/xtc/indianapolis && pnpm build
```

Expected: clean build with no errors.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: lint fixes and cleanup for OPDS integration"
```
