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

    // For binary downloads (epub files) and images, stream the response
    const contentType = resp.headers.get("content-type") || ""
    if (
      contentType.includes("application/epub") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/zip") ||
      contentType.startsWith("image/")
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
