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
