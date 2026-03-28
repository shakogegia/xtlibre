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
import { DeviceFileBrowser } from "@/components/converter/device-file-browser"

interface DeviceTabProps {
  s: Settings
  update: (patch: Partial<Settings>) => void
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
            <SelectValue>{s.deviceTransferMode === "direct" ? "Direct (Browser)" : "Relay (Server)"}</SelectValue>
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

      {/* File browser — shown when device is reachable */}
      {s.deviceHost && connectionStatus === "reachable" && (
        <DeviceFileBrowser host={s.deviceHost} port={s.devicePort} />
      )}
    </div>
  )
}
