"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react"
import { testDeviceConnection } from "@/lib/device-client"
import { type Settings } from "@/lib/types"

export interface DeviceStatus {
  reachable: boolean
  version?: string
  ip?: string
  mode?: string
  rssi?: number
  freeHeap?: number
  uptime?: number
}

interface DeviceContextValue {
  // Connection state (persists across tab switches)
  connectionStatus: "unknown" | "reachable" | "unreachable"
  deviceInfo: DeviceStatus | null
  initialCheckDone: boolean
  scanning: boolean
  testing: boolean
  scanResult: string | null

  // Actions
  scan: () => Promise<void>
  testConnection: () => Promise<void>
  disconnect: () => void
  selectDevice: (host: string, port: number) => void
  fetchStatus: (host: string, port: number, mode: "direct" | "relay") => Promise<boolean>
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

export function DeviceProvider({
  children,
  settings,
  updateSettings,
}: {
  children: React.ReactNode
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "reachable" | "unreachable">("unknown")
  const [deviceInfo, setDeviceInfo] = useState<DeviceStatus | null>(null)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [testing, setTesting] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  const fetchStatus = useCallback(async (host: string, port: number, mode: "direct" | "relay") => {
    try {
      if (mode === "direct") {
        const reachable = await testDeviceConnection(host, port)
        setConnectionStatus(reachable ? "reachable" : "unreachable")
        if (reachable) {
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

  const scan = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setDeviceInfo(null)
    try {
      const resp = await fetch("/api/device/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraHosts: settings.deviceHost ? [settings.deviceHost] : [] }),
      })
      const data = await resp.json()
      if (data.devices?.length > 0) {
        const dev = data.devices[0]
        updateSettings({ deviceHost: dev.host, devicePort: dev.port })
        setScanResult(`Found at ${dev.host}`)
        await fetchStatus(dev.host, dev.port, settings.deviceTransferMode)
      } else {
        setScanResult(settings.deviceTransferMode === "direct"
          ? "No devices found. In Direct mode, enter the IP shown on your device manually."
          : "No devices found. Is File Transfer active on your device?")
        setConnectionStatus("unknown")
      }
    } catch {
      setScanResult("Scan failed")
    } finally {
      setScanning(false)
    }
  }, [settings.deviceHost, settings.deviceTransferMode, updateSettings, fetchStatus])

  const testConnection = useCallback(async () => {
    if (!settings.deviceHost) return
    setTesting(true)
    setConnectionStatus("unknown")
    setDeviceInfo(null)
    await fetchStatus(settings.deviceHost, settings.devicePort, settings.deviceTransferMode)
    setTesting(false)
  }, [settings.deviceHost, settings.devicePort, settings.deviceTransferMode, fetchStatus])

  const disconnect = useCallback(() => {
    updateSettings({ deviceHost: "" })
    setConnectionStatus("unknown")
    setDeviceInfo(null)
    setScanResult(null)
  }, [updateSettings])

  const selectDevice = useCallback((host: string, port: number) => {
    updateSettings({ deviceHost: host, devicePort: port })
    setConnectionStatus("unknown")
    setDeviceInfo(null)
    fetchStatus(host, port, settings.deviceTransferMode)
  }, [updateSettings, fetchStatus, settings.deviceTransferMode])

  // Initial check on mount
  useEffect(() => {
    const init = async () => {
      if (settings.deviceHost) {
        await fetchStatus(settings.deviceHost, settings.devicePort, settings.deviceTransferMode)
      } else if (settings.deviceTransferMode === "relay") {
        await scan()
      }
      setInitialCheckDone(true)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(() => ({
    connectionStatus,
    deviceInfo,
    initialCheckDone,
    scanning,
    testing,
    scanResult,
    scan,
    testConnection,
    disconnect,
    selectDevice,
    fetchStatus,
  }), [connectionStatus, deviceInfo, initialCheckDone, scanning, testing, scanResult, scan, testConnection, disconnect, selectDevice, fetchStatus])

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  )
}

export function useDevice() {
  const ctx = useContext(DeviceContext)
  if (!ctx) throw new Error("useDevice must be used within DeviceProvider")
  return ctx
}
