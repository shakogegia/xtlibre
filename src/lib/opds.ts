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
