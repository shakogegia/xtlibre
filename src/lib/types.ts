import { type Settings as SettingsType, DEFAULT_SETTINGS as _DEFAULT_SETTINGS } from "@/lib/settings-schema"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WasmModule = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Renderer = any

export interface TocItem {
  title: string
  page: number
  children?: TocItem[]
}

export interface FileInfo {
  file: File
  name: string
  loaded: boolean
  libraryBookId?: string
}

export interface BookMetadata {
  title?: string
  authors?: string
  language?: string
}

export type Settings = SettingsType
export const DEFAULT_SETTINGS = _DEFAULT_SETTINGS

export type DeviceColor = "black" | "white"

export const PROGRESS_BAR_HEIGHT = 14
export const PROGRESS_BAR_HEIGHT_FULLWIDTH = 20
export const PROGRESS_BAR_HEIGHT_EXTENDED = 28

export const STORAGE_KEY_DEVICE_COLOR = "xtc-device-color"

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch { return fallback }
}

// Slider value helper (base-ui returns number | readonly number[])
export const sv = (v: number | readonly number[]) => Array.isArray(v) ? v[0] : v

// Select display label helpers (base-ui Value may show raw value before first open)
export const deviceLabel: Record<string, string> = { x4: "X4 (480x800)", x3: "X3 (528x792)" }
export const orientLabel: Record<string, string> = { "0": "Portrait 0°", "90": "Landscape 90°", "180": "Portrait 180°", "270": "Landscape 270°" }
export const alignLabel: Record<string, string> = { "-1": "Default", "0": "Left", "1": "Right", "2": "Center", "3": "Justify" }
export const spacingLabel: Record<string, string> = { "50": "Small (50%)", "75": "Condensed", "100": "Normal", "125": "Expanded", "150": "Wide", "200": "Extra Wide" }
export const hyphLabel: Record<string, string> = { "0": "Off", "1": "Algorithmic", "2": "Dictionary" }
export const langLabel: Record<string, string> = { auto: "Auto", en: "English", "en-gb": "English (UK)", de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", ru: "Russian" }
export const qualLabel: Record<string, string> = { fast: "Fast (1-bit)", hq: "HQ (2-bit)" }
