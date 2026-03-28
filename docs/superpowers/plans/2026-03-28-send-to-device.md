# Send to Device — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to send XTC/XTCH files from XTLibre directly to an Xteink e-reader over WebSocket, with configurable Direct (browser) and Relay (server) transfer modes, UDP device discovery, and a new Device tab in the sidebar.

**Architecture:** The feature adds a 4th sidebar tab ("Device") for configuring the device connection (IP/port, transfer mode, remembered devices). XTC/XTCH books in the Library tab get a "Send to Device" button. Two transfer paths: Direct mode (browser fetches file from server, opens WebSocket to device) and Relay mode (server streams file from disk to device, reports progress via SSE). Device discovery uses server-side UDP broadcast.

**Tech Stack:** Next.js API routes, browser WebSocket API, Node.js `dgram` (UDP) and `ws` (WebSocket client for relay), Server-Sent Events, Zod schema extension, shadcn/ui components.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/device-client.ts` | Browser-side: WebSocket upload to device, connection test, types/interfaces |
| `src/lib/device-discovery.ts` | Server-side: UDP broadcast discovery logic |
| `src/components/converter/device-tab.tsx` | Device tab UI (connection form, transfer mode, remembered devices, active transfer) |
| `src/app/api/device/discover/route.ts` | API: UDP discovery endpoint |
| `src/app/api/device/send/route.ts` | API: Relay mode upload with SSE progress |
| `src/app/api/device/status/route.ts` | API: Quick connection test (server-side) |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/lib/settings-schema.ts` | Add device fields to Zod schema + defaults |
| `src/app/actions.ts` | No changes needed (saveSettings already handles full Settings object) |
| `src/components/converter/sidebar.tsx` | Add Device tab trigger + content, pass new props |
| `src/components/converter/library-tab.tsx` | Add "Send to Device" button on XTC/XTCH books |
| `src/components/converter/converter.tsx` | Add device state, sendToDevice callback, pass props to sidebar |

---

## Task 1: Extend Settings Schema with Device Fields

**Files:**
- Modify: `src/lib/settings-schema.ts:3-35` (add fields to schema)
- Modify: `src/lib/settings-schema.ts:39-71` (add defaults)

- [ ] **Step 1: Add device fields to the Zod schema**

In `src/lib/settings-schema.ts`, add these fields inside the `z.object({...})` at the end (after `fontAntialiasing`):

```typescript
  // Device
  deviceHost: z.string(),
  devicePort: z.number().min(1).max(65535),
  deviceUploadPath: z.string(),
  deviceTransferMode: z.enum(["direct", "relay"]),
  rememberedDevices: z.string(), // JSON array of { label?, host, port }
```

- [ ] **Step 2: Add defaults for the new fields**

In the `DEFAULT_SETTINGS` object, add after `fontAntialiasing: 2`:

```typescript
  deviceHost: "",
  devicePort: 81,
  deviceUploadPath: "/",
  deviceTransferMode: "direct" as const,
  rememberedDevices: "[]",
```

- [ ] **Step 3: Verify the app still builds**

Run: `pnpm build 2>&1 | tail -5`
Expected: Build succeeds (existing code uses `settingsSchema.parse()` which will apply defaults via the schema).

Note: The settings DB stores the full JSON blob. Existing rows won't have these new keys, but `getSettings()` in `db.ts` uses `settingsSchema.parse()` which will fail on missing keys. We need to handle this — the schema should use `.default()` for the new fields so parsing old data works.

- [ ] **Step 4: Make new fields optional with defaults in the schema**

Update the device fields to use `.default()` so old stored settings parse correctly:

```typescript
  // Device
  deviceHost: z.string().default(""),
  devicePort: z.number().min(1).max(65535).default(81),
  deviceUploadPath: z.string().default("/"),
  deviceTransferMode: z.enum(["direct", "relay"]).default("direct"),
  rememberedDevices: z.string().default("[]"),
```

- [ ] **Step 5: Rebuild and verify**

Run: `pnpm build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings-schema.ts
git commit -m "feat(device): add device settings fields to schema"
```

---

## Task 2: Browser-Side Device Client

**Files:**
- Create: `src/lib/device-client.ts`

This module implements the CrossPoint WebSocket protocol using the browser's native `WebSocket` API. It handles both file upload and connection testing.

- [ ] **Step 1: Create `src/lib/device-client.ts`**

```typescript
/**
 * Browser-side WebSocket client for Xteink e-reader (CrossPoint protocol).
 *
 * Protocol:
 *   1. Connect ws://<host>:<port>/
 *   2. Send text: START:<filename>:<size>:<path>
 *   3. Wait for READY
 *   4. Send binary frames (chunked)
 *   5. Wait for DONE or ERROR:<message>
 */

export interface RememberedDevice {
  label?: string
  host: string
  port: number
}

export interface DeviceUploadOptions {
  host: string
  port: number
  uploadPath: string
  filename: string
  data: ArrayBuffer
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

export class DeviceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DeviceError"
  }
}

const CHUNK_SIZE = 16384 // 16 KB

export async function uploadToDevice(options: DeviceUploadOptions): Promise<void> {
  const { host, port, uploadPath, filename, data, onProgress, signal } = options

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DeviceError("Upload cancelled"))
      return
    }

    const ws = new WebSocket(`ws://${host}:${port}/`)
    ws.binaryType = "arraybuffer"
    let done = false

    const cleanup = () => {
      done = true
      try { ws.close() } catch {}
    }

    const onAbort = () => {
      cleanup()
      reject(new DeviceError("Upload cancelled"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })

    const timeout = setTimeout(() => {
      if (!done) {
        cleanup()
        reject(new DeviceError("Connection timed out"))
      }
    }, 10000)

    ws.onopen = () => {
      clearTimeout(timeout)
      ws.send(`START:${filename}:${data.byteLength}:${uploadPath}`)
    }

    ws.onmessage = (event) => {
      const msg = typeof event.data === "string" ? event.data : ""

      if (msg === "READY") {
        // Send file in chunks
        let sent = 0
        const sendNextChunk = () => {
          if (done) return
          if (sent >= data.byteLength) return // Wait for DONE from device

          const end = Math.min(sent + CHUNK_SIZE, data.byteLength)
          const chunk = data.slice(sent, end)
          ws.send(chunk)
          sent = end
          onProgress?.(sent, data.byteLength)

          // Use setTimeout to avoid blocking the UI thread
          if (sent < data.byteLength) {
            setTimeout(sendNextChunk, 0)
          }
        }
        sendNextChunk()
        return
      }

      if (msg === "DONE") {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        resolve()
        return
      }

      if (msg.startsWith("ERROR")) {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        reject(new DeviceError(msg.slice(6) || "Device error"))
        return
      }
    }

    ws.onerror = () => {
      if (!done) {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        reject(new DeviceError(`Could not connect to device at ${host}:${port}`))
      }
    }

    ws.onclose = (event) => {
      if (!done) {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        reject(new DeviceError(event.reason || "Connection closed unexpectedly"))
      }
    }
  })
}

/**
 * Test connectivity by opening and immediately closing a WebSocket.
 * Returns true if the handshake succeeds within the timeout.
 */
export async function testDeviceConnection(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}/`)
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      resolve(false)
    }, 5000)

    ws.onopen = () => {
      clearTimeout(timeout)
      ws.close()
      resolve(true)
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      resolve(false)
    }
  })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build 2>&1 | tail -5`
Expected: Build succeeds (module is not imported yet, but should have no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/device-client.ts
git commit -m "feat(device): add browser-side WebSocket client for CrossPoint protocol"
```

---

## Task 3: Server-Side UDP Discovery

**Files:**
- Create: `src/lib/device-discovery.ts`

- [ ] **Step 1: Create `src/lib/device-discovery.ts`**

```typescript
import dgram from "dgram"

const DISCOVERY_PORTS = [8134, 54982, 48123, 39001, 44044, 59678]
const DISCOVERY_MSG = Buffer.from("hello")
const DISCOVERY_ROUNDS = 3

export interface DiscoveredDevice {
  host: string
  port: number
}

/**
 * Broadcast UDP "hello" on known discovery ports.
 * Returns array of discovered devices (usually 0 or 1).
 */
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

      // Build target list
      const targets: Array<[string, number]> = []
      for (const port of DISCOVERY_PORTS) {
        targets.push(["255.255.255.255", port])
      }
      for (const host of extraHosts ?? []) {
        if (!host) continue
        for (const port of DISCOVERY_PORTS) {
          targets.push([host, port])
        }
        // Also try broadcast for the subnet
        const bcast = broadcastFromHost(host)
        if (bcast) {
          for (const port of DISCOVERY_PORTS) {
            targets.push([bcast, port])
          }
        }
      }

      // Send discovery rounds
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
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/device-discovery.ts
git commit -m "feat(device): add server-side UDP discovery for Xteink devices"
```

---

## Task 4: API Route — Device Discovery

**Files:**
- Create: `src/app/api/device/discover/route.ts`

- [ ] **Step 1: Create the discover route**

```typescript
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
```

- [ ] **Step 2: Create directory and verify build**

Run: `mkdir -p src/app/api/device/discover && pnpm build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/device/discover/route.ts
git commit -m "feat(device): add UDP discovery API route"
```

---

## Task 5: API Route — Device Status (Connection Test)

**Files:**
- Create: `src/app/api/device/status/route.ts`

This route does a quick TCP connection test to the device's WebSocket port from the server side (useful for relay mode validation).

- [ ] **Step 1: Create the status route**

```typescript
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
```

- [ ] **Step 2: Create directory and verify build**

Run: `mkdir -p src/app/api/device/status && pnpm build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/device/status/route.ts
git commit -m "feat(device): add device status/connectivity API route"
```

---

## Task 6: API Route — Relay Mode Send (SSE)

**Files:**
- Create: `src/app/api/device/send/route.ts`

This route reads the XTC file from disk, streams it to the device over WebSocket, and reports progress to the browser via Server-Sent Events. Requires installing the `ws` package for server-side WebSocket client.

- [ ] **Step 1: Install ws package**

Run: `pnpm add ws && pnpm add -D @types/ws`

- [ ] **Step 2: Create the send route**

```typescript
import { requireAuth } from "@/lib/auth"
import { getBook, getLibraryDir } from "@/lib/db"
import path from "path"
import fs from "fs"
import WebSocket from "ws"

export async function POST(request: Request) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body?.bookId || !body?.host || !body?.port) {
    return Response.json({ error: "bookId, host, and port are required" }, { status: 400 })
  }

  const { bookId, host, port, uploadPath = "/" } = body
  const book = getBook(bookId)
  if (!book?.filename) {
    return Response.json({ error: "Book not found or no XTC file" }, { status: 404 })
  }

  const filePath = path.join(getLibraryDir(), book.filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "File not found on disk" }, { status: 404 })
  }

  const fileData = fs.readFileSync(filePath)
  const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
  const filename = book.title.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 50) + ext

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const ws = new WebSocket(`ws://${host}:${port}/`)
      let done = false

      const timeout = setTimeout(() => {
        if (!done) {
          done = true
          send({ type: "error", message: "Connection timed out" })
          controller.close()
          try { ws.close() } catch {}
        }
      }, 10000)

      ws.on("open", () => {
        clearTimeout(timeout)
        ws.send(`START:${filename}:${fileData.byteLength}:${uploadPath}`)
      })

      ws.on("message", (data) => {
        const msg = data.toString()

        if (msg === "READY") {
          const chunkSize = 16384
          let sent = 0

          const sendChunk = () => {
            if (done) return
            if (sent >= fileData.byteLength) return

            const end = Math.min(sent + chunkSize, fileData.byteLength)
            ws.send(fileData.slice(sent, end))
            sent = end
            send({ type: "progress", sent, total: fileData.byteLength })

            if (sent < fileData.byteLength) {
              setImmediate(sendChunk)
            }
          }
          sendChunk()
          return
        }

        if (msg === "DONE") {
          done = true
          send({ type: "done" })
          controller.close()
          ws.close()
          return
        }

        if (msg.startsWith("ERROR")) {
          done = true
          send({ type: "error", message: msg.slice(6) || "Device error" })
          controller.close()
          ws.close()
          return
        }
      })

      ws.on("error", (err) => {
        if (!done) {
          done = true
          clearTimeout(timeout)
          send({ type: "error", message: `Connection failed: ${err.message}` })
          controller.close()
        }
      })

      ws.on("close", () => {
        if (!done) {
          done = true
          send({ type: "error", message: "Connection closed unexpectedly" })
          controller.close()
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

- [ ] **Step 3: Create directory and verify build**

Run: `mkdir -p src/app/api/device/send && pnpm build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/device/send/route.ts package.json pnpm-lock.yaml
git commit -m "feat(device): add relay mode send API route with SSE progress"
```

---

## Task 7: Device Tab Component

**Files:**
- Create: `src/components/converter/device-tab.tsx`

The Device tab provides the UI for configuring the device connection, choosing transfer mode, managing remembered devices, and showing active transfer progress.

- [ ] **Step 1: Create `src/components/converter/device-tab.tsx`**

```tsx
import React, { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectGroup, SelectItem,
} from "@/components/ui/select"
import { Smartphone, Wifi, WifiOff, Search, Trash2, Loader2, Radio } from "lucide-react"
import { type Settings } from "@/lib/types"
import { type RememberedDevice } from "@/lib/device-client"

interface DeviceTabProps {
  s: Settings
  update: (patch: Partial<Settings>) => void
  // Transfer state
  transferring: boolean
  transferProgress: { sent: number; total: number; filename: string } | null
  cancelTransfer: () => void
}

export function DeviceTab({
  s, update,
  transferring, transferProgress, cancelTransfer,
}: DeviceTabProps) {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "reachable" | "unreachable">("unknown")

  const rememberedDevices: RememberedDevice[] = (() => {
    try { return JSON.parse(s.rememberedDevices) } catch { return [] }
  })()

  const handleScan = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const resp = await fetch("/api/device/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraHosts: s.deviceHost ? [s.deviceHost] : [] }),
      })
      const data = await resp.json()
      if (data.devices?.length > 0) {
        const dev = data.devices[0]
        update({ deviceHost: dev.host, devicePort: dev.port })
        setScanResult(`Found device at ${dev.host}:${dev.port}`)
        setConnectionStatus("reachable")
      } else {
        setScanResult("No devices found")
      }
    } catch {
      setScanResult("Scan failed")
    } finally {
      setScanning(false)
    }
  }, [s.deviceHost, update])

  const handleTestConnection = useCallback(async () => {
    if (!s.deviceHost) return
    setTesting(true)
    setConnectionStatus("unknown")
    try {
      const resp = await fetch(`/api/device/status?host=${encodeURIComponent(s.deviceHost)}&port=${s.devicePort}`)
      const data = await resp.json()
      setConnectionStatus(data.reachable ? "reachable" : "unreachable")
    } catch {
      setConnectionStatus("unreachable")
    } finally {
      setTesting(false)
    }
  }, [s.deviceHost, s.devicePort])

  const saveDevice = useCallback(() => {
    if (!s.deviceHost) return
    const existing = rememberedDevices.find(d => d.host === s.deviceHost && d.port === s.devicePort)
    if (existing) return
    const updated = [...rememberedDevices, { host: s.deviceHost, port: s.devicePort }]
    update({ rememberedDevices: JSON.stringify(updated) })
  }, [s.deviceHost, s.devicePort, rememberedDevices, update])

  const removeDevice = useCallback((index: number) => {
    const updated = rememberedDevices.filter((_, i) => i !== index)
    update({ rememberedDevices: JSON.stringify(updated) })
  }, [rememberedDevices, update])

  const selectDevice = useCallback((dev: RememberedDevice) => {
    update({ deviceHost: dev.host, devicePort: dev.port })
    setConnectionStatus("unknown")
  }, [update])

  const progressPct = transferProgress
    ? Math.round((transferProgress.sent / transferProgress.total) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Connection */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Device Connection</span>
          <div className="flex-1" />
          {connectionStatus === "reachable" && (
            <Badge variant="outline" className="h-auto text-[9px] px-1.5 py-0 text-emerald-600 border-emerald-600/30">
              <Wifi className="w-2.5 h-2.5 mr-0.5" /> Connected
            </Badge>
          )}
          {connectionStatus === "unreachable" && (
            <Badge variant="outline" className="h-auto text-[9px] px-1.5 py-0 text-destructive border-destructive/30">
              <WifiOff className="w-2.5 h-2.5 mr-0.5" /> Unreachable
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div className="space-y-1">
            <Label htmlFor="device-host" className="text-[10px]">IP Address</Label>
            <Input
              id="device-host"
              placeholder="192.168.4.1"
              value={s.deviceHost}
              onChange={(e) => { update({ deviceHost: e.target.value }); setConnectionStatus("unknown") }}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="device-port" className="text-[10px]">Port</Label>
            <Input
              id="device-port"
              type="number"
              value={s.devicePort}
              onChange={(e) => { update({ devicePort: parseInt(e.target.value) || 81 }); setConnectionStatus("unknown") }}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="device-path" className="text-[10px]">Upload Path</Label>
          <Input
            id="device-path"
            placeholder="/"
            value={s.deviceUploadPath}
            onChange={(e) => update({ deviceUploadPath: e.target.value })}
            className="h-7 text-xs"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={handleScan} disabled={scanning}>
            {scanning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
            {scanning ? "Scanning..." : "Scan"}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={handleTestConnection} disabled={testing || !s.deviceHost}>
            {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Radio className="w-3 h-3 mr-1" />}
            {testing ? "Testing..." : "Test"}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={saveDevice} disabled={!s.deviceHost} title="Remember this device">
            +
          </Button>
        </div>

        {scanResult && (
          <p className="text-[10px] text-muted-foreground">{scanResult}</p>
        )}
      </div>

      {/* Separator */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mode</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* Transfer mode */}
      <div className="space-y-1.5">
        <Label className="text-[10px]">Transfer Mode</Label>
        <Select
          value={s.deviceTransferMode}
          onValueChange={(v) => update({ deviceTransferMode: v as "direct" | "relay" })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="direct" className="text-xs">Direct (Browser)</SelectItem>
              <SelectItem value="relay" className="text-xs">Relay (Server)</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {s.deviceTransferMode === "direct"
            ? "Browser connects to device directly. Use when the server is on a different network."
            : "Server streams the file to device. Use when both are on the same network."}
        </p>
      </div>

      {/* Remembered devices */}
      {rememberedDevices.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saved</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <div className="space-y-1">
            {rememberedDevices.map((dev, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 group/dev">
                <button
                  className="flex-1 text-left text-xs truncate"
                  onClick={() => selectDevice(dev)}
                >
                  {dev.label || `${dev.host}:${dev.port}`}
                </button>
                <Button
                  variant="ghost" size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover/dev:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => removeDevice(i)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Active transfer */}
      {transferring && transferProgress && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Transfer</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium truncate">{transferProgress.filename}</p>
            <Progress value={progressPct} className="h-1.5" />
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">{progressPct}%</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2 text-destructive" onClick={cancelTransfer}>
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds. Check if the `Progress` component exists; if not, we'll need to use a simple div-based progress bar instead.

- [ ] **Step 3: If `Progress` component doesn't exist, replace with inline progress bar**

Check: `ls src/components/ui/progress*`

If it doesn't exist, replace `<Progress value={progressPct} className="h-1.5" />` with:

```tsx
<div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
</div>
```

And remove the `Progress` import.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/device-tab.tsx
git commit -m "feat(device): add Device tab component"
```

---

## Task 8: Wire Device Tab into Sidebar

**Files:**
- Modify: `src/components/converter/sidebar.tsx`

Add the Device tab as the 4th tab in the sidebar. This requires adding new props and the tab content.

- [ ] **Step 1: Add import for DeviceTab and Smartphone icon**

At the top of `src/components/converter/sidebar.tsx`, add:

```typescript
import { DeviceTab } from "@/components/converter/device-tab"
import { Smartphone } from "lucide-react"
```

- [ ] **Step 2: Extend SidebarProps interface**

Add these props to the `SidebarProps` interface (after the Library section, around line 67):

```typescript
  // Device
  sendToDevice: (bookId: string) => void
  deviceConfigured: boolean
  transferring: boolean
  transferProgress: { sent: number; total: number; filename: string } | null
  cancelTransfer: () => void
```

- [ ] **Step 3: Destructure new props**

In the function signature, add the new props to the destructuring (around line 85):

```typescript
  // Device
  sendToDevice, deviceConfigured, transferring, transferProgress, cancelTransfer,
```

- [ ] **Step 4: Add Device tab trigger**

In the `TabsList` (line 90-94), add a 4th trigger after the Calibre trigger:

```tsx
<TabsTrigger value="device" className="text-[12px]">Device</TabsTrigger>
```

- [ ] **Step 5: Add Device tab content**

After the Calibre `TabsContent` block (after line 132), add:

```tsx
        <TabsContent value="device" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <DeviceTab
            s={s} update={update}
            transferring={transferring}
            transferProgress={transferProgress}
            cancelTransfer={cancelTransfer}
          />
        </TabsContent>
```

- [ ] **Step 6: Pass new props to LibraryTab**

Add `sendToDevice`, `deviceConfigured`, and `transferring` to the `<LibraryTab>` component (around line 98-106):

```tsx
          <LibraryTab
            fileInputRef={fileInputRef} addFiles={addFiles}
            dragOver={dragOver} setDragOver={setDragOver}
            opdsUrl={opdsUrl} activeBookId={activeBookId}
            libraryBooks={libraryBooks} libraryLoading={libraryLoading}
            openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
            deleteLibraryBook={deleteLibraryBook}
            updateLibraryBook={updateLibraryBook}
            sendToDevice={sendToDevice}
            deviceConfigured={deviceConfigured}
            transferring={transferring}
          />
```

- [ ] **Step 7: Verify build**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build will fail because converter.tsx doesn't pass these props yet. That's expected — we'll fix it in Task 10.

- [ ] **Step 8: Commit**

```bash
git add src/components/converter/sidebar.tsx
git commit -m "feat(device): wire Device tab into sidebar"
```

---

## Task 9: Add Send to Device Button in Library Tab

**Files:**
- Modify: `src/components/converter/library-tab.tsx`

Add a "Send to Device" button on books that have an XTC/XTCH file (books where `book.filename` is truthy).

- [ ] **Step 1: Extend LibraryTabProps**

Add these props to the `LibraryTabProps` interface (after `updateLibraryBook`, around line 39):

```typescript
  sendToDevice: (bookId: string) => void
  deviceConfigured: boolean
  transferring: boolean
```

- [ ] **Step 2: Destructure new props**

Add to the function destructuring (around line 44):

```typescript
  sendToDevice, deviceConfigured, transferring,
```

- [ ] **Step 3: Add Send to Device button**

In the book action buttons area (line 164-195), add a new button after the download button (after the `{book.filename && (` block that ends around line 172). Place it between the download button and the delete AlertDialog:

```tsx
                  {book.filename && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 w-6 p-0"
                      title={deviceConfigured ? "Send to device" : "Configure device in Device tab"}
                      disabled={!deviceConfigured || transferring}
                      onClick={() => sendToDevice(book.id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>
                    </Button>
                  )}
```

This uses the lucide "Send" icon as an inline SVG (consistent with the other buttons in this file which use inline SVGs).

- [ ] **Step 4: Verify file has no syntax errors**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build may fail since converter.tsx doesn't pass these props yet. That's fine.

- [ ] **Step 5: Commit**

```bash
git add src/components/converter/library-tab.tsx
git commit -m "feat(device): add Send to Device button in library tab"
```

---

## Task 10: Wire Everything into Converter Component

**Files:**
- Modify: `src/components/converter/converter.tsx`

This is the main integration task. Add device state, the `sendToDevice` callback (handling both Direct and Relay modes), and pass all new props to the Sidebar.

- [ ] **Step 1: Add imports**

At the top of `converter.tsx`, add:

```typescript
import { uploadToDevice, DeviceError } from "@/lib/device-client"
```

- [ ] **Step 2: Add device transfer state**

After the existing state declarations (around line 60-70 area, near the other useState calls), add:

```typescript
  // Device transfer state
  const [transferring, setTransferring] = useState(false)
  const [transferProgress, setTransferProgress] = useState<{ sent: number; total: number; filename: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
```

- [ ] **Step 3: Add cancelTransfer callback**

Add this callback near the other callbacks:

```typescript
  const cancelTransfer = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setTransferring(false)
    setTransferProgress(null)
  }, [])
```

- [ ] **Step 4: Add sendToDevice callback**

Add this callback after `cancelTransfer`. It handles both Direct and Relay modes:

```typescript
  const sendToDevice = useCallback(async (bookId: string) => {
    const settings = sRef.current
    if (!settings.deviceHost) {
      toast.error("No device configured. Go to the Device tab to set up your e-reader.")
      return
    }

    const book = libraryBooks.find(b => b.id === bookId)
    if (!book?.filename) return

    const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
    const filename = book.title.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 50) + ext
    const toastId = `send-${bookId}`

    setTransferring(true)
    setTransferProgress({ sent: 0, total: 0, filename: book.title })
    toast.loading(`Sending "${book.title}" to device...`, { id: toastId })

    try {
      if (settings.deviceTransferMode === "relay") {
        // Relay mode: server streams to device, progress via SSE
        const resp = await fetch("/api/device/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookId,
            host: settings.deviceHost,
            port: settings.devicePort,
            uploadPath: settings.deviceUploadPath,
          }),
        })

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Send failed" }))
          throw new DeviceError(err.error || "Send failed")
        }

        const reader = resp.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) throw new DeviceError("No response stream")

        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split("\n\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const match = line.match(/^data: (.+)$/m)
            if (!match) continue
            const event = JSON.parse(match[1])

            if (event.type === "progress") {
              setTransferProgress({ sent: event.sent, total: event.total, filename: book.title })
            } else if (event.type === "done") {
              setTransferring(false)
              setTransferProgress(null)
              toast.success(`Sent "${book.title}" to device`, { id: toastId, duration: 4000 })
              return
            } else if (event.type === "error") {
              throw new DeviceError(event.message)
            }
          }
        }
      } else {
        // Direct mode: browser fetches file, then streams to device via WebSocket
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        // Fetch the XTC file from server
        const resp = await fetch(`/api/library/${bookId}`)
        if (!resp.ok) throw new DeviceError("Failed to fetch file from server")
        const data = await resp.arrayBuffer()

        setTransferProgress({ sent: 0, total: data.byteLength, filename: book.title })

        // Upload to device
        await uploadToDevice({
          host: settings.deviceHost,
          port: settings.devicePort,
          uploadPath: settings.deviceUploadPath,
          filename,
          data,
          onProgress: (sent, total) => {
            setTransferProgress({ sent, total, filename: book.title })
          },
          signal: abortController.signal,
        })

        toast.success(`Sent "${book.title}" to device`, { id: toastId, duration: 4000 })
      }
    } catch (err) {
      const message = err instanceof DeviceError ? err.message : "Transfer failed"
      toast.error(message, { id: toastId, duration: 4000 })
    } finally {
      setTransferring(false)
      setTransferProgress(null)
      abortControllerRef.current = null
    }
  }, [libraryBooks])
```

- [ ] **Step 5: Add `deviceConfigured` derived value**

Near the bottom of the component, before the return statement (around line 926), add:

```typescript
  const deviceConfigured = !!s.deviceHost
```

- [ ] **Step 6: Pass new props to Sidebar**

In the `<Sidebar>` JSX (around line 930-955), add these props:

```typescript
        sendToDevice={sendToDevice}
        deviceConfigured={deviceConfigured}
        transferring={transferring}
        transferProgress={transferProgress}
        cancelTransfer={cancelTransfer}
```

Add them after the `updateLibraryBook` prop.

- [ ] **Step 7: Build and fix any type errors**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds. If there are type errors, fix them.

- [ ] **Step 8: Commit**

```bash
git add src/components/converter/converter.tsx
git commit -m "feat(device): wire sendToDevice into converter with Direct and Relay modes"
```

---

## Task 11: Verify Full Build and Manual Test

- [ ] **Step 1: Full build check**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify all new routes exist**

Run: `ls -la src/app/api/device/*/route.ts`
Expected: Three route files (discover, send, status).

- [ ] **Step 3: Verify new component and lib files exist**

Run: `ls -la src/lib/device-client.ts src/lib/device-discovery.ts src/components/converter/device-tab.tsx`
Expected: All three files exist.

- [ ] **Step 4: Commit any remaining fixes**

If any build fixes were needed:
```bash
git add -A
git commit -m "fix(device): resolve build issues"
```

---

## Task 12: Post-Generation Send Prompt

**Files:**
- Modify: `src/components/converter/converter.tsx`

After XTC generation succeeds, if a device is configured, show a toast with a "Send to Device" action button.

- [ ] **Step 1: Update the generation success toast**

In `converter.tsx`, find the success toast after generation (around line 768):

```typescript
toast.success(`Generated ${pageCount} pages in ${totalTime}s`, { id: toastId, duration: 4000 })
```

Replace it with:

```typescript
      const latestBooks = await fetchLibraryBooksReturn()
      const justSaved = latestBooks?.[0]
      if (justSaved?.filename && sRef.current.deviceHost) {
        toast.success(`Generated ${pageCount} pages in ${totalTime}s`, {
          id: toastId,
          duration: 8000,
          action: {
            label: "Send to device",
            onClick: () => sendToDevice(justSaved.id),
          },
        })
      } else {
        toast.success(`Generated ${pageCount} pages in ${totalTime}s`, { id: toastId, duration: 4000 })
      }
```

Note: This requires that `fetchLibraryBooks` returns the updated list. Check if it does. If `fetchLibraryBooks` is a void function that sets state, create a variant that returns the data:

Look at the existing `fetchLibraryBooks`. If it's:
```typescript
const fetchLibraryBooks = useCallback(async () => {
  const resp = await fetch("/api/library")
  const books = await resp.json()
  setLibraryBooks(books)
}, [])
```

Add a variant that also returns the data:
```typescript
const fetchLibraryBooksReturn = useCallback(async () => {
  const resp = await fetch("/api/library")
  const books = await resp.json()
  setLibraryBooks(books)
  return books
}, [])
```

Then use `fetchLibraryBooksReturn` in the generation flow (replace both the `await fetchLibraryBooks()` call and add the toast logic).

- [ ] **Step 2: Add sendToDevice to the handleGenerateXtc dependency array**

Update the dependency array of `handleGenerateXtc` to include `sendToDevice`:

```typescript
}, [saveToLibrary, fetchLibraryBooksReturn, renderPreview, sendToDevice])
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/converter/converter.tsx
git commit -m "feat(device): show Send to Device action in post-generation toast"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Extend settings schema with device fields |
| 2 | Browser-side WebSocket client (Direct mode) |
| 3 | Server-side UDP discovery logic |
| 4 | API route: device discovery |
| 5 | API route: connection test |
| 6 | API route: relay send with SSE progress |
| 7 | Device tab UI component |
| 8 | Wire Device tab into sidebar |
| 9 | Send to Device button in library tab |
| 10 | Main integration in converter.tsx |
| 11 | Full build verification |
| 12 | Post-generation send prompt |
