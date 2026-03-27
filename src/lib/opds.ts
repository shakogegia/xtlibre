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
  navigationHref: string | null  // For catalog navigation (categories, shelves)
}

export interface OpdsFeed {
  title: string
  entries: OpdsEntry[]
  nextUrl: string | null  // Pagination
  searchUrl: string | null  // OpenSearch template URL
}

// ── Constants ────────────────────────────────────────────────────────

const ATOM_NS = "http://www.w3.org/2005/Atom"

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

function getElements(parent: Element, tagName: string): Element[] {
  const nsEls = parent.getElementsByTagNameNS(ATOM_NS, tagName)
  const plainEls = parent.getElementsByTagName(tagName)
  const els = nsEls.length > 0 ? nsEls : plainEls
  return Array.from(els)
}

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

  // Links
  const allLinks = getElements(feed, "link")

  // Search URL (OpenSearch)
  let searchUrl: string | null = null
  for (const link of allLinks) {
    if (link.getAttribute("rel") === "search") {
      const href = link.getAttribute("href")
      if (href) {
        searchUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href
      }
    }
  }

  // Next page URL (pagination)
  let nextUrl: string | null = null
  for (const link of allLinks) {
    if (link.getAttribute("rel") === "next") {
      const href = link.getAttribute("href")
      if (href) {
        nextUrl = href.startsWith("http") ? href : new URL(href, baseUrl).href
      }
    }
  }

  // Entries
  const rawEntries = getElements(feed, "entry")
  const entries: OpdsEntry[] = rawEntries.map(e => parseEntry(e, baseUrl))

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
  const rawAuthors = getElements(entry, "author")
  const authors: string[] = []
  for (const authorEl of rawAuthors) {
    const nameEl = authorEl.getElementsByTagNameNS(ATOM_NS, "name")[0]
      ?? authorEl.getElementsByTagName("name")[0]
    if (nameEl?.textContent) authors.push(nameEl.textContent.trim())
  }

  // Links
  const allLinks = getElements(entry, "link")

  let coverUrl: string | null = null
  let thumbnailUrl: string | null = null
  const formats: { type: string; href: string }[] = []
  let navigationHref: string | null = null

  for (const link of allLinks) {
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
      navigationHref = href.startsWith("http") ? href : new URL(href, baseUrl).href
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
    navigationHref,
  }
}
