import { requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const body = await request.json()
    const { host, path, name } = body

    if (!host || !path || !name) {
      return Response.json({ error: "host, path, and name are required" }, { status: 400 })
    }

    // Device HTTP server always runs on port 80
    const url = `http://${host}/rename`
    const params = new URLSearchParams({ path, name })
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => `Rename failed: ${resp.status}`)
      return Response.json({ error: text }, { status: resp.status === 409 ? 409 : 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error("Device rename proxy error:", err)
    return Response.json({ error: "Failed to rename file on device" }, { status: 502 })
  }
}
