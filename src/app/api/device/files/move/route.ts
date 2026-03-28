import { requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const body = await request.json()
    const { host, path, dest } = body

    if (!host || !path || !dest) {
      return Response.json({ error: "host, path, and dest are required" }, { status: 400 })
    }

    // Device HTTP server always runs on port 80
    const url = `http://${host}/move`
    const params = new URLSearchParams({ path, dest })
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => `Move failed: ${resp.status}`)
      return Response.json({ error: text }, { status: resp.status === 409 ? 409 : 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error("Device move proxy error:", err)
    return Response.json({ error: "Failed to move file on device" }, { status: 502 })
  }
}
