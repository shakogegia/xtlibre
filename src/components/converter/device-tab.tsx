import React, { useState, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectGroup, SelectItem,
} from "@/components/ui/select"
import { Smartphone, Wifi, WifiOff, Search, Trash2, Loader2, Radio, Info, HardDrive, Clock, ChevronDown, Settings2 } from "lucide-react"
import { type Settings } from "@/lib/types"
import { type RememberedDevice, testDeviceConnection } from "@/lib/device-client"
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
  const [showManual, setShowManual] = useState(false)
  const [initialCheckDone, setInitialCheckDone] = useState(false)

  const rememberedDevices: RememberedDevice[] = useMemo(() => {
    try { return JSON.parse(s.rememberedDevices) } catch { return [] }
  }, [s.rememberedDevices])

  const fetchDeviceStatus = useCallback(async (host: string, port: number, mode: "direct" | "relay") => {
    try {
      if (mode === "direct") {
        // In Direct mode, test from the browser (important when server is in Docker)
        const reachable = await testDeviceConnection(host, port)
        setConnectionStatus(reachable ? "reachable" : "unreachable")
        if (reachable) {
          // Try to fetch device info through the server as a bonus (may fail in Docker, that's ok)
          try {
            const resp = await fetch(`/api/device/status?host=${encodeURIComponent(host)}&port=80`)
            const data: DeviceStatus = await resp.json()
            if (data.reachable) setDeviceInfo(data)
          } catch { /* server can't reach device — expected in Docker */ }
        } else {
          setDeviceInfo(null)
        }
        return reachable
      } else {
        // In Relay mode, test from the server
        const resp = await fetch(`/api/device/status?host=${encodeURIComponent(host)}&port=80`)
        const data: DeviceStatus = await resp.json()
        setDeviceInfo(data)
        setConnectionStatus(data.reachable ? "reachable" : "unreachable")
        return data.reachable
      }
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
        setScanResult(`Found at ${dev.host}`)
        await fetchDeviceStatus(dev.host, dev.port, s.deviceTransferMode)
      } else {
        setScanResult(s.deviceTransferMode === "direct"
          ? "No devices found. In Direct mode, enter the IP shown on your device manually."
          : "No devices found. Is File Transfer active on your device?")
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
    await fetchDeviceStatus(s.deviceHost, s.devicePort, s.deviceTransferMode)
    setTesting(false)
  }, [s.deviceHost, s.devicePort, s.deviceTransferMode, fetchDeviceStatus])

  useEffect(() => {
    const init = async () => {
      if (s.deviceHost) {
        // Have a saved host — test it
        await fetchDeviceStatus(s.deviceHost, s.devicePort, s.deviceTransferMode)
      } else if (s.deviceTransferMode === "relay") {
        // Relay mode: server is on the LAN, scan makes sense
        await handleScan()
      }
      // Direct mode with no host: just show the UI immediately
      setInitialCheckDone(true)
    }
    init()
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
    fetchDeviceStatus(dev.host, dev.port, s.deviceTransferMode)
  }, [update, fetchDeviceStatus, s.deviceTransferMode])

  const disconnect = useCallback(() => {
    update({ deviceHost: "" })
    setConnectionStatus("unknown")
    setDeviceInfo(null)
    setScanResult(null)
  }, [update])

  const progressPct = transferProgress
    ? Math.round((transferProgress.sent / transferProgress.total) * 100)
    : 0

  const isConnected = connectionStatus === "reachable"
  const hasDevice = !!s.deviceHost

  return (
    <div className="space-y-3 relative h-full">
      {/* ── LOADING STATE ── */}
      {!isConnected && !initialCheckDone && (
        <div className="flex flex-col items-center justify-center gap-2 absolute inset-0">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">Looking for device...</p>
        </div>
      )}

      {/* ── NOT CONNECTED STATE ── */}
      {!isConnected && initialCheckDone && (
        <>
          {/* Setup info alert */}
          <Alert className="text-[11px]">
            <Info className="w-3.5 h-3.5" />
            <AlertTitle className="text-[11px]">Connect your Xteink</AlertTitle>
            <AlertDescription className="text-[10px]">
              <ol className="list-decimal pl-3.5 space-y-0.5 mt-1">
                <li>On your device, go to <strong>File Transfer</strong></li>
                <li>Select <strong>Join a Network</strong> or <strong>Calibre Wireless</strong></li>
              </ol>
              <p className="mt-1.5 text-muted-foreground">
                {s.deviceTransferMode === "direct"
                  ? "This computer (browser) must be on the same network as the device."
                  : "The XTLibre server must be on the same network as the device."}
              </p>
            </AlertDescription>
          </Alert>

          {/* Transfer mode — shown before connection so user picks the right setup */}
          <div className="space-y-1">
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
                  <SelectItem value="direct" className="text-xs">Direct (Browser → Device)</SelectItem>
                  <SelectItem value="relay" className="text-xs">Relay (Server → Device)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {s.deviceTransferMode === "direct"
                ? "Your browser sends files to the device. Both must be on the same WiFi."
                : "The server sends files to the device. Use when the server is on the same network as the device."}
            </p>
          </div>

          {/* Primary action: Scan */}
          {s.deviceTransferMode === "relay" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-[11px]"
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
                {scanning ? "Scanning for devices..." : "Scan for device"}
              </Button>

              {scanResult && (
                <p className="text-[10px] text-muted-foreground text-center">{scanResult}</p>
              )}
            </>
          )}

          {/* Saved devices — quick access */}
          {rememberedDevices.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Saved devices</span>
              {rememberedDevices.map((dev, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/50 hover:bg-muted/50 group/dev">
                  <Smartphone className="w-3 h-3 text-muted-foreground shrink-0" />
                  <button
                    className="flex-1 text-left text-xs truncate"
                    onClick={() => selectDevice(dev)}
                  >
                    {dev.label || dev.host}
                    <span className="text-muted-foreground ml-1">:{dev.port}</span>
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
          )}

          {/* Manual entry — open by default in Direct mode (no scan), collapsible in Relay */}
          <Collapsible open={s.deviceTransferMode === "direct" || showManual || (hasDevice && !isConnected)} onOpenChange={setShowManual}>
            {s.deviceTransferMode === "relay" && (
              <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
                <ChevronDown className={`w-3 h-3 transition-transform ${showManual || (hasDevice && !isConnected) ? "rotate-0" : "-rotate-90"}`} />
                Manual connection
              </CollapsibleTrigger>
            )}
            <CollapsibleContent>
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="device-host" className="text-[10px]">IP Address</Label>
                    <Input
                      id="device-host"
                      placeholder="crosspoint.local"
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={handleTestConnection} disabled={testing || !s.deviceHost}>
                    {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Radio className="w-3 h-3 mr-1" />}
                    {testing ? "Testing..." : "Connect"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={saveDevice} disabled={!s.deviceHost} title="Remember this device">
                    +
                  </Button>
                </div>
                {connectionStatus === "unreachable" && (
                  <p className="text-[10px] text-destructive">Could not reach device at {s.deviceHost}. Check that File Transfer is active.</p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* ── CONNECTED STATE ── */}
      {isConnected && (
        <>
          {/* Compact connection header */}
          <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-auto text-[9px] px-1.5 py-0 text-emerald-600 border-emerald-600/30">
                <Wifi className="w-2.5 h-2.5 mr-0.5" /> Connected
              </Badge>
              <span className="text-[11px] font-medium flex-1">{s.deviceHost}</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
            {deviceInfo?.version && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">CrossPoint</span>
                  <span className="text-[10px]">v{deviceInfo.version}</span>
                </div>
                {deviceInfo.mode && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Network</span>
                    <span className="text-[10px]">
                      {deviceInfo.mode === "AP" ? "AP" : "WiFi"}
                      {deviceInfo.rssi != null && deviceInfo.rssi !== 0 && ` (${signalLabel(deviceInfo.rssi)})`}
                    </span>
                  </div>
                )}
                {deviceInfo.freeHeap != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1"><HardDrive className="w-2.5 h-2.5" /> Memory</span>
                    <span className="text-[10px]">{formatBytes(deviceInfo.freeHeap)}</span>
                  </div>
                )}
                {deviceInfo.uptime != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Uptime</span>
                    <span className="text-[10px]">{formatUptime(deviceInfo.uptime)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advanced settings — collapsible */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
              <Settings2 className="w-3 h-3" />
              Advanced settings
              <ChevronDown className="w-3 h-3 ml-auto transition-transform [[data-panel-open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <Label htmlFor="device-path" className="text-[10px]">Upload Path</Label>
                  <Input
                    id="device-path"
                    placeholder="/"
                    value={s.deviceUploadPath}
                    onChange={(e) => update({ deviceUploadPath: e.target.value })}
                    className="h-7 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Folder must already exist on the device.</p>
                </div>

                <div className="space-y-1">
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
                        <SelectItem value="direct" className="text-xs">Direct (Browser → Device)</SelectItem>
                        <SelectItem value="relay" className="text-xs">Relay (Server → Device)</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* Save current device button */}
                {!rememberedDevices.find(d => d.host === s.deviceHost && d.port === s.devicePort) && (
                  <Button variant="outline" size="sm" className="h-7 text-[11px] w-full" onClick={saveDevice}>
                    Remember this device
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* ── ACTIVE TRANSFER (shown in both states) ── */}
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

      {/* ── FILE BROWSER (connected only) ── */}
      {s.deviceHost && isConnected && (
        <DeviceFileBrowser host={s.deviceHost} port={s.devicePort} />
      )}
    </div>
  )
}
