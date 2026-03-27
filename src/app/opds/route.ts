import { listBooks, type BookListItem } from "@/lib/db"
import { requireAuth, createDownloadToken } from "@/lib/auth"

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function toRfc3339(sqliteDatetime: string): string {
  // SQLite datetime('now') → "2026-03-27 15:30:00", needs "T" separator + "Z"
  return sqliteDatetime.replace(" ", "T") + "Z"
}

function bookEntry(book: BookListItem, baseUrl: string, token: string): string {
  const xtcHref = `${baseUrl}/api/library/${book.id}?token=${token}`
  const coverHref = `${baseUrl}/api/library/${book.id}/cover?token=${token}`
  const ext = book.filename!.endsWith(".xtch") ? ".xtch" : ".xtc"

  return `
  <entry>
    <title>${escapeXml(book.title)}</title>
    <id>urn:uuid:${book.id}</id>
    <updated>${toRfc3339(book.created_at)}</updated>
    ${book.author ? `<author><name>${escapeXml(book.author)}</name></author>` : ""}
    <content type="text">${escapeXml(book.title)}${book.author ? ` by ${escapeXml(book.author)}` : ""}</content>
    <link rel="http://opds-spec.org/acquisition/open-access" href="${xtcHref}" type="application/octet-stream" title="${escapeXml(ext.slice(1).toUpperCase())}"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${coverHref}" type="image/jpeg"/>
    ${book.device_type ? `<category term="${escapeXml(book.device_type)}" label="${escapeXml(book.device_type.toUpperCase())}"/>` : ""}
  </entry>`
}

export async function GET(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const url = new URL(request.url)
  const baseUrl = (process.env.PUBLIC_URL || `${url.protocol}//${url.host}`).replace(/\/+$/, "")
  const books = listBooks().filter(b => b.filename)
  const latestDate = books.length > 0 ? toRfc3339(books[0].created_at) : new Date().toISOString()
  const token = await createDownloadToken()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:xtc-library</id>
  <title>XTLibre Library</title>
  <updated>${latestDate}</updated>
  <author><name>XTLibre</name></author>
  <link rel="self" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
${books.map((b) => bookEntry(b, baseUrl, token)).join("\n")}
</feed>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml;charset=utf-8",
    },
  })
}
