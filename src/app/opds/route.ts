import { listBooks, type BookListItem } from "@/lib/db"
import { verifyBasicAuth, verifySessionCookie } from "@/lib/auth"

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function bookEntry(book: BookListItem, baseUrl: string): string {
  const acqHref = `${baseUrl}/api/library/${book.id}`
  const coverHref = `${baseUrl}/api/library/${book.id}/cover`

  return `
  <entry>
    <title>${escapeXml(book.title)}</title>
    <id>urn:uuid:${book.id}</id>
    <updated>${book.created_at}Z</updated>
    ${book.author ? `<author><name>${escapeXml(book.author)}</name></author>` : ""}
    <link rel="http://opds-spec.org/acquisition" href="${acqHref}" type="application/octet-stream"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${coverHref}" type="image/jpeg"/>
    ${book.device_type ? `<category term="${escapeXml(book.device_type)}" label="${escapeXml(book.device_type.toUpperCase())}"/>` : ""}
  </entry>`
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const hasBasicAuth = verifyBasicAuth(authHeader)
  const hasSession = await verifySessionCookie()

  if (!hasBasicAuth && !hasSession) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="XTLibre OPDS"' },
    })
  }

  const url = new URL(request.url)
  const baseUrl = (process.env.PUBLIC_URL || `${url.protocol}//${url.host}`).replace(/\/+$/, "")
  const books = listBooks()
  const latestDate = books.length > 0 ? books[0].created_at + "Z" : new Date().toISOString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:xtc-library</id>
  <title>XTLibre Library</title>
  <updated>${latestDate}</updated>
  <author><name>XTLibre</name></author>
  <link rel="self" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
${books.map((b) => bookEntry(b, baseUrl)).join("\n")}
</feed>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml;charset=utf-8",
    },
  })
}
