import { requireAuth } from "@/lib/auth"

export interface DeviceStatus {
  reachable: boolean
  version?: string
  ip?: string
  mode?: string // "STA" (WiFi) or "AP" (access point)
  rssi?: number // WiFi signal strength in dBm
  freeHeap?: number
  uptime?: number
}

export async function GET(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const url = new URL(request.url)
  const host = url.searchParams.get("host")
  const port = url.searchParams.get("port") || "80"

  if (!host) {
    return Response.json({ error: "host is required" }, { status: 400 })
  }

  try {
    // Try to fetch /api/status from the device's HTTP server (port 80)
    const resp = await fetch(`http://${host}:${port}/api/status`, {
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) {
      const data = await resp.json()
      return Response.json({
        reachable: true,
        version: data.version,
        ip: data.ip,
        mode: data.mode,
        rssi: data.rssi,
        freeHeap: data.freeHeap,
        uptime: data.uptime,
      } satisfies DeviceStatus)
    }
    // HTTP responded but not 200 — still reachable
    return Response.json({ reachable: true } satisfies DeviceStatus)
  } catch {
    return Response.json({ reachable: false } satisfies DeviceStatus)
  }
}
