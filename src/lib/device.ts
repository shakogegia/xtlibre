import { DEVICE_SPECS, type DeviceType } from "@/lib/config"
import { type DeviceColor } from "@/lib/types"

// Device physical specs → bezel dimensions in device pixels (at 220 PPI)
// X4: 114×69mm body, 480×800 screen at 220 PPI → screen = 55.4×92.4mm
export const DEVICE_BEZELS: Record<DeviceType, {
  deviceWidthMm: number; deviceHeightMm: number
  side: number; top: number; chin: number
  bodyRadius: number; screenRadius: number
  sideButtons: { offsetPct: number; size: number }[]
  chinButtons: { widthPct: number; height: number; gap: number }
}> = {
  x4: {
    deviceWidthMm: 69, deviceHeightMm: 114,
    side: 59, top: 52, chin: 110,
    bodyRadius: 26, screenRadius: 8,
    sideButtons: [
      { offsetPct: 0.10, size: 18 },  // Power
    ],
    chinButtons: { widthPct: 0.35, height: 18, gap: 12 },
  },
  x3: {
    deviceWidthMm: 76, deviceHeightMm: 124,
    side: 64, top: 56, chin: 120,
    bodyRadius: 28, screenRadius: 8,
    sideButtons: [
      { offsetPct: 0.10, size: 20 },
    ],
    chinButtons: { widthPct: 0.35, height: 20, gap: 14 },
  },
}

export const DEVICE_COLORS: Record<DeviceColor, {
  body: string; button: string; slot: string
  highlight: string; screenBorder: string; shadow: string
}> = {
  black: {
    body: "linear-gradient(160deg, #3a3a44 0%, #2e2e38 35%, #232328 100%)",
    button: "linear-gradient(180deg, #333340 0%, #282834 100%)",
    slot: "rgba(0,0,0,0.3)",
    highlight: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.3)",
    screenBorder: "inset 0 0 0 1px rgba(0,0,0,0.5), inset 0 2px 6px rgba(0,0,0,0.2)",
    shadow: "0 25px 60px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)",
  },
  white: {
    body: "linear-gradient(160deg, #f0ede8 0%, #e8e5df 35%, #dedad4 100%)",
    button: "linear-gradient(180deg, #e8e5e0 0%, #ddd9d3 100%)",
    slot: "rgba(0,0,0,0.12)",
    highlight: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.06)",
    screenBorder: "inset 0 0 0 1px rgba(0,0,0,0.12), inset 0 2px 4px rgba(0,0,0,0.06)",
    shadow: "0 25px 60px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)",
  },
}

// Estimated CSS PPI for MacBook Retina displays (~127 CSS px/inch)
export const TRUE_LIFE_CSS_PPI = 127

export function getScreenDimensions(deviceType: DeviceType, orientation: number) {
  const device = DEVICE_SPECS[deviceType]
  const isLandscape = orientation === 90 || orientation === 270
  return {
    screenWidth: isLandscape ? device.height : device.width,
    screenHeight: isLandscape ? device.width : device.height,
    deviceWidth: device.width,
    deviceHeight: device.height,
  }
}
