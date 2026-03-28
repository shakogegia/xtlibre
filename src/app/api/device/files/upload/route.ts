import { requireAuth } from "@/lib/auth"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const host = formData.get("host") as string | null
    const path = (formData.get("path") as string) || "/"

    if (!host || !file) {
      return Response.json({ error: "host and file are required" }, { status: 400 })
    }

    // Forward to device's HTTP upload endpoint
    const deviceForm = new FormData()
    deviceForm.append("file", file)

    const url = `http://${host}/upload?path=${encodeURIComponent(path)}`
    const resp = await fetch(url, {
      method: "POST",
      body: deviceForm,
      signal: AbortSignal.timeout(120000), // 2 min for larger files
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => `Upload failed: ${resp.status}`)
      return Response.json({ error: text }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error("Device upload proxy error:", err)
    return Response.json({ error: "Failed to upload file to device" }, { status: 502 })
  }
}
