import React, { useState, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert"
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectGroup, SelectItem,
} from "@/components/ui/select"
import { Smartphone, Wifi, WifiOff, Search, Trash2, Loader2, Radio, Info, Signal, HardDrive, Clock } from "lucide-react"
import { type Settings } from "@/lib/types"
import { type RememberedDevice } from "@/lib/device-client"
import { DeviceFileBrowser } from "@/components/converter/device-file-browser"

interface DeviceStatus {
  reachable: boolean
  version?: string
  ip?: string
  mode?: string
  rssi?: number
  freeHeap?: number
  uptime?: number
}

interface DeviceTabProps {
  s: Settings
  update: (patch: Partial<Settings>) => void
  transferring: boolean
  transferProgress: { sent: number; total: number; filename: string } | null
  cancelTransfer: () => void
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function signalLabel(rssi: number): string {
  if (rssi >= -50) return "Excellent"
  if (rssi >= -60) return "Good"
  if (rssi >= -70) return "Fair"
  return "Weak"
}

export function DeviceTab({
  s, update,
  transferring, transferProgress, cancelTransfer,
}: DeviceTabProps) {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "reachable" | "unreachable">("unknown")
  const [deviceInfo, setDeviceInfo] = useState<DeviceStatus | null>(null)
  const [infoDismissed, setInfoDismissed] = useState(false)

  const rememberedDevices: RememberedDevice[] = useMemo(() => {
    try { return JSON.parse(s.rememberedDevices) } catch { return [] }
  }, [s.rememberedDevices])

  const fetchDeviceStatus = useCallback(async (host: string, port: number) => {
    try {
      // Device HTTP server runs on port 80, not the WebSocket port
      const resp = await fetch(`/api/device/status?host=${encodeURIComponent(host)}&port=80`)
      const data: DeviceStatus = await resp.json()
      setDeviceInfo(data)
      setConnectionStatus(data.reachable ? "reachable" : "unreachable")
      return data.reachable
    } catch {
      setConnectionStatus("unreachable")
      setDeviceInfo(null)
      return false
    }
  }, [])

  const handleScan = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setDeviceInfo(null)
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
        // Auto-test connection after discovery
        await fetchDeviceStatus(dev.host, dev.port)
      } else {
        setScanResult("No devices found. Make sure File Transfer is active on your device.")
        setConnectionStatus("unknown")
      }
    } catch {
      setScanResult("Scan failed")
    } finally {
      setScanning(false)
    }
  }, [s.deviceHost, update, fetchDeviceStatus])

  const handleTestConnection = useCallback(async () => {
    if (!s.deviceHost) return
    setTesting(true)
    setConnectionStatus("unknown")
    setDeviceInfo(null)
    await fetchDeviceStatus(s.deviceHost, s.devicePort)
    setTesting(false)
  }, [s.deviceHost, s.devicePort, fetchDeviceStatus])

  // Auto-scan on first mount if no device is configured
  useEffect(() => {
    if (!s.deviceHost) {
      handleScan()
    } else {
      // If host is set, auto-test on mount
      fetchDeviceStatus(s.deviceHost, s.devicePort)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setDeviceInfo(null)
    fetchDeviceStatus(dev.host, dev.port)
  }, [update, fetchDeviceStatus])

  const progressPct = transferProgress
    ? Math.round((transferProgress.sent / transferProgress.total) * 100)
    : 0

  const isConnected = connectionStatus === "reachable"

  return (
    <div className="space-y-4">
      {/* Setup info alert */}
      {!infoDismissed && !isConnected && (
        <Alert className="text-[11px]">
          <Info className="w-3.5 h-3.5" />
          <AlertTitle className="text-[11px]">Connect your Xteink</AlertTitle>
          <AlertDescription className="text-[10px]">
            <ol className="list-decimal pl-3.5 space-y-0.5 mt-1">
              <li>On your device, go to <strong>File Transfer</strong></li>
              <li>Connect to a <strong>WiFi network</strong></li>
              <li>Note the <strong>IP address</strong> shown on screen</li>
              <li>Make sure this computer is on the <strong>same network</strong></li>
            </ol>
            <p className="mt-1.5 text-muted-foreground">
              Then click Scan below, or enter the IP address manually.
            </p>
          </AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setInfoDismissed(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </Button>
          </AlertAction>
        </Alert>
      )}

      {/* Connection */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Device Connection</span>
          <div className="flex-1" />
          {isConnected && (
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
              onChange={(e) => { update({ deviceHost: e.target.value }); setConnectionStatus("unknown"); setDeviceInfo(null) }}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="device-port" className="text-[10px]">WS Port</Label>
            <Input
              id="device-port"
              type="number"
              value={s.devicePort}
              onChange={(e) => { update({ devicePort: parseInt(e.target.value) || 81 }); setConnectionStatus("unknown"); setDeviceInfo(null) }}
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

      {/* Device info card — shown when connected and have status data */}
      {isConnected && deviceInfo?.version && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Device Info</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">CrossPoint</span>
              <span className="text-[10px] font-medium">v{deviceInfo.version}</span>
            </div>
            {deviceInfo.mode && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Wifi className="w-2.5 h-2.5" /> Network
                </span>
                <span className="text-[10px] font-medium">
                  {deviceInfo.mode === "AP" ? "Access Point" : "WiFi"}
                  {deviceInfo.rssi != null && deviceInfo.rssi !== 0 && (
                    <span className="text-muted-foreground ml-1">({signalLabel(deviceInfo.rssi)})</span>
                  )}
                </span>
              </div>
            )}
            {deviceInfo.freeHeap != null && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <HardDrive className="w-2.5 h-2.5" /> Free Memory
                </span>
                <span className="text-[10px] font-medium">{formatBytes(deviceInfo.freeHeap)}</span>
              </div>
            )}
            {deviceInfo.uptime != null && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Uptime
                </span>
                <span className="text-[10px] font-medium">{formatUptime(deviceInfo.uptime)}</span>
              </div>
            )}
          </div>
        </>
      )}

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
      {s.deviceHost && isConnected && (
        <DeviceFileBrowser host={s.deviceHost} port={s.devicePort} />
      )}
    </div>
  )
}
