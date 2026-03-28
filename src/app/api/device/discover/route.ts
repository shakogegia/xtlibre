import { requireAuth } from "@/lib/auth"
import { discoverDevices } from "@/lib/device-discovery"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const extraHosts = Array.isArray(body.extraHosts) ? body.extraHosts : []

    const devices = await discoverDevices(3000, extraHosts)
    return Response.json({ devices })
  } catch (err) {
    console.error("Device discovery error:", err)
    return Response.json({ error: "Discovery failed" }, { status: 500 })
  }
}
