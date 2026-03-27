import { NextRequest } from "next/server"
import { getCalibreConfig } from "@/lib/db"

export async function GET(request: NextRequest) {
  const config = getCalibreConfig()
  if (!config) {
    return Response.json({ error: "Calibre not configured" }, { status: 404 })
  }

  // Default to /opds root feed
  const path = request.nextUrl.searchParams.get("path") || "/opds"

  // Validate path to prevent SSRF — must stay on the configured Calibre origin
  if (!path.startsWith("/")) {
    return Response.json({ error: "Path must be absolute" }, { status: 400 })
  }
  const target = new URL(path, config.url)
  if (target.origin !== new URL(config.url).origin) {
    return Response.json({ error: "Invalid path" }, { status: 400 })
  }
  const targetUrl = target.href

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
