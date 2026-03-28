import dgram from "dgram"

const DISCOVERY_PORTS = [8134, 54982, 48123, 39001, 44044, 59678]
const DISCOVERY_MSG = Buffer.from("hello")
const DISCOVERY_ROUNDS = 3

export interface DiscoveredDevice {
  host: string
  port: number
}

export async function discoverDevices(
  timeoutMs = 3000,
  extraHosts?: string[]
): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const devices: DiscoveredDevice[] = []
    const seen = new Set<string>()

    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true })
    sock.on("error", () => { /* ignore */ })

    sock.bind(0, () => {
      try {
        sock.setBroadcast(true)
      } catch {
        // Some environments don't support broadcast
      }

      const targets: Array<[string, number]> = []
      for (const port of DISCOVERY_PORTS) {
        targets.push(["255.255.255.255", port])
      }
      for (const host of extraHosts ?? []) {
        if (!host) continue
        for (const port of DISCOVERY_PORTS) {
          targets.push([host, port])
        }
        const bcast = broadcastFromHost(host)
        if (bcast) {
          for (const port of DISCOVERY_PORTS) {
            targets.push([bcast, port])
          }
        }
      }

      let round = 0
      const sendRound = () => {
        for (const [host, port] of targets) {
          try {
            sock.send(DISCOVERY_MSG, port, host)
          } catch {
            // ignore send errors
          }
        }
        round++
        if (round < DISCOVERY_ROUNDS) {
          setTimeout(sendRound, 500)
        }
      }
      sendRound()
    })

    sock.on("message", (data, rinfo) => {
      const text = data.toString("utf-8")
      let wsPort = 81
      const semi = text.indexOf(";")
      if (semi !== -1) {
        const parsed = parseInt(text.slice(semi + 1).split(",")[0], 10)
        if (!isNaN(parsed)) wsPort = parsed
      }

      const key = `${rinfo.address}:${wsPort}`
      if (!seen.has(key)) {
        seen.add(key)
        devices.push({ host: rinfo.address, port: wsPort })
      }
    })

    setTimeout(() => {
      sock.close()
      resolve(devices)
    }, timeoutMs)
  })
}

function broadcastFromHost(host: string): string | null {
  const parts = host.split(".")
  if (parts.length !== 4) return null
  if (parts.some(p => isNaN(Number(p)))) return null
  parts[3] = "255"
  return parts.join(".")
}
