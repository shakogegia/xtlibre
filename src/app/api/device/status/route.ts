import { requireAuth } from "@/lib/auth"
import net from "net"

export async function GET(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const url = new URL(request.url)
  const host = url.searchParams.get("host")
  const port = parseInt(url.searchParams.get("port") || "81", 10)

  if (!host) {
    return Response.json({ error: "host is required" }, { status: 400 })
  }

  const reachable = await testConnection(host, port, 5000)
  return Response.json({ reachable })
}

function testConnection(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    sock.setTimeout(timeoutMs)
    sock.on("connect", () => { sock.destroy(); resolve(true) })
    sock.on("error", () => { sock.destroy(); resolve(false) })
    sock.on("timeout", () => { sock.destroy(); resolve(false) })
    sock.connect(port, host)
  })
}
