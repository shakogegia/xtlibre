import { requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const body = await request.json()
    const { host, path = "/" } = body

    if (!host) {
      return Response.json({ error: "host is required" }, { status: 400 })
    }

    // Device HTTP server always runs on port 80
    const url = `http://${host}/api/files?path=${encodeURIComponent(path)}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })

    if (!resp.ok) {
      return Response.json({ error: `Device returned ${resp.status}` }, { status: 502 })
    }

    const data = await resp.json()
    return Response.json(data)
  } catch (err) {
    console.error("Device files proxy error:", err)
    return Response.json({ error: "Failed to list files from device" }, { status: 502 })
  }
}
