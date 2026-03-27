import { XMLParser } from "fast-xml-parser"

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

const STORAGE_KEY = "xtc-opds-server"

// fast-xml-parser configured to preserve attributes and handle namespaces
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,       // Strip namespace prefixes (atom:title → title)
  isArray: (name) => {        // Always treat these as arrays even if single element
    return ["entry", "link", "author"].includes(name)
  },
})

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any

function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return ""
  return href.startsWith("http") ? href : new URL(href, baseUrl).href
}

function textOf(node: XmlNode): string {
  if (node == null) return ""
  if (typeof node === "string") return node.trim()
  if (typeof node === "number") return String(node)
  // fast-xml-parser may put text in #text for mixed content
  if (node["#text"] != null) return String(node["#text"]).trim()
  return ""
}

function parseFeed(xml: string, baseUrl: string): OpdsFeed {
  const doc = xmlParser.parse(xml)

  // The root element is typically <feed> (with or without namespace prefix)
  const feed = doc.feed ?? doc

  const title = textOf(feed.title) || "Library"

  // Links (always an array thanks to isArray config)
  const links: XmlNode[] = feed.link ?? []

  let searchUrl: string | null = null
  let nextUrl: string | null = null

  for (const link of links) {
    const rel = link["@_rel"] || ""
    const href = link["@_href"] || ""
    if (rel === "search" && href) {
      searchUrl = resolveUrl(href, baseUrl)
    } else if (rel === "next" && href) {
      nextUrl = resolveUrl(href, baseUrl)
    }
  }

  // Entries (always an array thanks to isArray config)
  const rawEntries: XmlNode[] = feed.entry ?? []
  const entries = rawEntries.map((e: XmlNode) => parseEntry(e, baseUrl))

  return { title, entries, nextUrl, searchUrl }
}

function parseEntry(entry: XmlNode, baseUrl: string): OpdsEntry {
  const id = textOf(entry.id)
  const title = textOf(entry.title)
  const updated = textOf(entry.updated)
  const summary = textOf(entry.summary) || textOf(entry.content)

  // Authors (always an array thanks to isArray config)
  const rawAuthors: XmlNode[] = entry.author ?? []
  const authors = rawAuthors
    .map((a: XmlNode) => textOf(a.name))
    .filter((n: string) => n.length > 0)

  // Links (always an array)
  const links: XmlNode[] = entry.link ?? []

  let coverUrl: string | null = null
  let thumbnailUrl: string | null = null
  const formats: { type: string; href: string }[] = []
  let navigationHref: string | null = null

  for (const link of links) {
    const rel: string = link["@_rel"] || ""
    const href: string = link["@_href"] || ""
    const type: string = link["@_type"] || ""

    if (rel.includes("http://opds-spec.org/image/thumbnail")) {
      thumbnailUrl = resolveUrl(href, baseUrl)
    } else if (rel.includes("http://opds-spec.org/image")) {
      coverUrl = resolveUrl(href, baseUrl)
    } else if (rel.includes("http://opds-spec.org/acquisition")) {
      formats.push({ type, href: resolveUrl(href, baseUrl) })
    } else if (
      rel === "subsection" ||
      (type.includes("application/atom+xml") && !rel.includes("acquisition"))
    ) {
      navigationHref = resolveUrl(href, baseUrl)
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
