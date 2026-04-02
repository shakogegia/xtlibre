import React, { useState, useCallback, useMemo } from "react"
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
import { type RememberedDevice } from "@/lib/device-client"
import { useDevice } from "@/contexts/device-context"
import { DeviceFileBrowser } from "@/components/converter/device-file-browser"

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
  const device = useDevice()
  const [showManual, setShowManual] = useState(false)

  const rememberedDevices: RememberedDevice[] = useMemo(() => {
    try { return JSON.parse(s.rememberedDevices) } catch { return [] }
  }, [s.rememberedDevices])

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

  const progressPct = transferProgress
    ? Math.round((transferProgress.sent / transferProgress.total) * 100)
    : 0

  const isConnected = device.connectionStatus === "reachable" || transferring
  const hasDevice = !!s.deviceHost

  return (
    <div className="space-y-3 relative h-full">
      {/* ── LOADING STATE ── */}
      {!isConnected && !device.initialCheckDone && (
        <div className="flex flex-col items-center justify-center gap-2 absolute inset-0">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">Looking for device...</p>
        </div>
      )}

      {/* ── NOT CONNECTED STATE ── */}
      {!isConnected && device.initialCheckDone && (
        <>
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
            {s.deviceTransferMode === "direct" && typeof window !== "undefined" && window.location.protocol === "https:" && (
              <p className="text-[10px] text-destructive mt-1">
                Direct mode is not available over HTTPS. Switch to Relay mode or access XTLibre over HTTP.
              </p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full text-[11px]"
            onClick={device.scan}
            disabled={device.scanning}
          >
            {device.scanning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
            {device.scanning ? "Scanning for devices..." : "Scan for device"}
          </Button>

          {device.scanResult && (
            <p className="text-[10px] text-muted-foreground text-center">{device.scanResult}</p>
          )}

          {rememberedDevices.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Saved devices</span>
              {rememberedDevices.map((dev, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/50 hover:bg-muted/50 group/dev">
                  <Smartphone className="w-3 h-3 text-muted-foreground shrink-0" />
                  <button
                    className="flex-1 text-left text-xs truncate"
                    onClick={() => device.selectDevice(dev.host, dev.port)}
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

          <Collapsible open={showManual || (hasDevice && !isConnected)} onOpenChange={setShowManual}>
            <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
              <ChevronDown className={`w-3 h-3 transition-transform ${showManual || (hasDevice && !isConnected) ? "rotate-0" : "-rotate-90"}`} />
              Manual connection
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="device-host" className="text-[10px]">IP Address</Label>
                    <Input
                      id="device-host"
                      placeholder="crosspoint.local"
                      value={s.deviceHost}
                      onChange={(e) => update({ deviceHost: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="device-port" className="text-[10px]">WS Port</Label>
                    <Input
                      id="device-port"
                      type="number"
                      value={s.devicePort}
                      onChange={(e) => update({ devicePort: parseInt(e.target.value) || 81 })}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={device.testConnection} disabled={device.testing || !s.deviceHost}>
                    {device.testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Radio className="w-3 h-3 mr-1" />}
                    {device.testing ? "Testing..." : "Connect"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={saveDevice} disabled={!s.deviceHost} title="Remember this device">
                    +
                  </Button>
                </div>
                {device.connectionStatus === "unreachable" && (
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
          <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-auto text-[9px] px-1.5 py-0 text-emerald-600 border-emerald-600/30">
                <Wifi className="w-2.5 h-2.5 mr-0.5" /> Connected
              </Badge>
              <span className="text-[11px] font-medium flex-1">{s.deviceHost}</span>
              <Badge variant="outline" className="h-auto text-[9px] px-1.5 py-0">
                {s.deviceTransferMode === "direct" ? "Direct" : "Relay"}
              </Badge>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground" onClick={device.disconnect}>
                Disconnect
              </Button>
            </div>
            {device.deviceInfo?.version && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">CrossPoint</span>
                  <span className="text-[10px]">v{device.deviceInfo.version}</span>
                </div>
                {device.deviceInfo.mode && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Network</span>
                    <span className="text-[10px]">
                      {device.deviceInfo.mode === "AP" ? "AP" : "WiFi"}
                      {device.deviceInfo.rssi != null && device.deviceInfo.rssi !== 0 && ` (${signalLabel(device.deviceInfo.rssi)})`}
                    </span>
                  </div>
                )}
                {device.deviceInfo.freeHeap != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1"><HardDrive className="w-2.5 h-2.5" /> Memory</span>
                    <span className="text-[10px]">{formatBytes(device.deviceInfo.freeHeap)}</span>
                  </div>
                )}
                {device.deviceInfo.uptime != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Uptime</span>
                    <span className="text-[10px]">{formatUptime(device.deviceInfo.uptime)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

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
                    onValueChange={(v) => {
                      const mode = v as "direct" | "relay"
                      update({ deviceTransferMode: mode })
                      if (s.deviceHost) device.fetchStatus(s.deviceHost, s.devicePort, mode)
                    }}
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

      {/* ── ACTIVE TRANSFER ── */}
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

      {/* ── FILE BROWSER ── */}
      {s.deviceHost && isConnected && !transferring && (
        <DeviceFileBrowser host={s.deviceHost} port={s.devicePort} transferMode={s.deviceTransferMode} />
      )}
    </div>
  )
}
