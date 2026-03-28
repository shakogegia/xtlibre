import { requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const body = await request.json()
    const { host, path } = body

    if (!host || !path) {
      return Response.json({ error: "host and path are required" }, { status: 400 })
    }

    // Device HTTP server always runs on port 80
    const url = `http://${host}/delete`
    const params = new URLSearchParams({ path, type: "file" })
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      return Response.json({ error: `Delete failed: ${resp.status}` }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error("Device delete proxy error:", err)
    return Response.json({ error: "Failed to delete file from device" }, { status: 502 })
  }
}
