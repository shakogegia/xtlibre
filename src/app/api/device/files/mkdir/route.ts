import { requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const body = await request.json()
    const { host, path = "/", name } = body

    if (!host || !name) {
      return Response.json({ error: "host and name are required" }, { status: 400 })
    }

    // Device HTTP server always runs on port 80
    const url = `http://${host}/mkdir`
    const params = new URLSearchParams({ name, path })
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      return Response.json({ error: `Create folder failed: ${resp.status}` }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error("Device mkdir proxy error:", err)
    return Response.json({ error: "Failed to create folder on device" }, { status: 502 })
  }
}
