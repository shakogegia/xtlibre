"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  DEVICE_SPECS, FONT_FAMILIES, ARABIC_FONTS, LANG_TO_PATTERN,
  type DeviceType,
} from "@/lib/config"

// Device physical specs → bezel dimensions in device pixels (at 220 PPI)
// X4: 114×69mm body, 480×800 screen at 220 PPI → screen = 55.4×92.4mm
const DEVICE_BEZELS: Record<DeviceType, {
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

type DeviceColor = "black" | "white"

const DEVICE_COLORS: Record<DeviceColor, {
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
const TRUE_LIFE_CSS_PPI = 127

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Renderer = any

interface TocItem {
  title: string
  page: number
  children?: TocItem[]
}

interface FileInfo {
  file: File
  name: string
  loaded: boolean
}

interface BookMetadata {
  title?: string
  authors?: string
  language?: string
}

interface Settings {
  deviceType: DeviceType
  orientation: number
  fontSize: number
  fontWeight: number
  lineHeight: number
  margin: number
  fontFace: string
  textAlign: number
  wordSpacing: number
  hyphenation: number
  hyphenationLang: string
  ignoreDocMargins: boolean
  qualityMode: "fast" | "hq"
  enableDithering: boolean
  ditherStrength: number
  enableNegative: boolean
  enableProgressBar: boolean
  progressPosition: "top" | "bottom"
  showProgressLine: boolean
  showChapterMarks: boolean
  showChapterProgress: boolean
  progressFullWidth: boolean
  showPageInfo: boolean
  showBookPercent: boolean
  showChapterPage: boolean
  showChapterPercent: boolean
  progressFontSize: number
  progressEdgeMargin: number
  progressSideMargin: number
  fontHinting: number
  fontAntialiasing: number
}

const DEFAULT_SETTINGS: Settings = {
  deviceType: "x4",
  orientation: 0,
  fontSize: 22,
  fontWeight: 400,
  lineHeight: 120,
  margin: 20,
  fontFace: "Literata",
  textAlign: -1,
  wordSpacing: 100,
  hyphenation: 2,
  hyphenationLang: "auto",
  ignoreDocMargins: false,
  qualityMode: "fast",
  enableDithering: true,
  ditherStrength: 70,
  enableNegative: false,
  enableProgressBar: true,
  progressPosition: "bottom",
  showProgressLine: true,
  showChapterMarks: true,
  showChapterProgress: false,
  progressFullWidth: false,
  showPageInfo: true,
  showBookPercent: true,
  showChapterPage: true,
  showChapterPercent: false,
  progressFontSize: 14,
  progressEdgeMargin: 0,
  progressSideMargin: 0,
  fontHinting: 1,
  fontAntialiasing: 2,
}

const PROGRESS_BAR_HEIGHT = 14
const PROGRESS_BAR_HEIGHT_FULLWIDTH = 20
const PROGRESS_BAR_HEIGHT_EXTENDED = 28

const STORAGE_KEY_SETTINGS = "xtc-settings"
const STORAGE_KEY_DEVICE_COLOR = "xtc-device-color"
const STORAGE_KEY_DARK_MODE = "xtc-dark-mode"

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch { return fallback }
}

// ── Helper functions (pure, no React) ──────────────────────────────

function getPatternForLang(langTag: string): string {
  if (!langTag) return "English_US.pattern"
  const lang = langTag.toLowerCase().trim()
  if (LANG_TO_PATTERN[lang]) return LANG_TO_PATTERN[lang]
  const prefix = lang.split("-")[0]
  if (LANG_TO_PATTERN[prefix]) return LANG_TO_PATTERN[prefix]
  return "English_US.pattern"
}

function getScreenDimensions(deviceType: DeviceType, orientation: number) {
  const device = DEVICE_SPECS[deviceType]
  const isLandscape = orientation === 90 || orientation === 270
  return {
    screenWidth: isLandscape ? device.height : device.width,
    screenHeight: isLandscape ? device.width : device.height,
    deviceWidth: device.width,
    deviceHeight: device.height,
  }
}

function getChapterInfoForPage(
  pageNum: number, toc: TocItem[], totalPages: number
): { title: string; startPage: number; endPage: number; index: number; totalCount: number } | null {
  if (!toc || toc.length === 0) return null

  let topLevelIndex = 0
  let topLevelPage = -1
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].page <= pageNum && toc[i].page > topLevelPage) {
      topLevelIndex = i + 1
      topLevelPage = toc[i].page
    }
  }
  if (topLevelPage === -1) return null

  const current = { title: "", startPage: topLevelPage, endPage: totalPages - 1, index: topLevelIndex, totalCount: toc.length }
  let deepestPage = topLevelPage

  function findDeepest(items: TocItem[]) {
    for (const item of items) {
      if (item.page <= pageNum && item.page > deepestPage) {
        deepestPage = item.page
        current.startPage = item.page
        current.title = item.title
      }
      if (item.children?.length) findDeepest(item.children)
    }
  }
  findDeepest(toc)

  let foundNext = false
  function findNext(items: TocItem[]) {
    for (const item of items) {
      if (foundNext) return
      if (item.page > current.startPage) { current.endPage = item.page - 1; foundNext = true; return }
      if (item.children) findNext(item.children)
    }
  }
  findNext(toc)

  return current
}

function getChapterPositions(toc: TocItem[], totalPages: number): number[] {
  const positions: number[] = []
  function extract(items: TocItem[]) {
    for (const item of items) {
      positions.push(item.page / totalPages)
      if (item.children?.length) extract(item.children)
    }
  }
  if (toc.length > 0) extract(toc)
  return positions
}

function drawProgressIndicator(
  ctx: CanvasRenderingContext2D, s: Settings, currentPage: number,
  totalPages: number, screenW: number, screenH: number, toc: TocItem[]
) {
  if (!s.enableProgressBar) return

  const lineThickness = 1
  const progressThickness = 4
  const chapterMarkHeight = 11
  const edgeMargin = s.progressEdgeMargin || 0
  const sideMargin = s.progressSideMargin || 0
  const padding = 8 + sideMargin
  const isTop = s.progressPosition === "top"
  const hasProgressLine = s.showProgressLine || s.showChapterProgress
  const hasBothLines = s.showProgressLine && s.showChapterProgress

  let barHeight = PROGRESS_BAR_HEIGHT
  if (s.showChapterMarks || (s.progressFullWidth && hasBothLines)) barHeight = PROGRESS_BAR_HEIGHT_EXTENDED
  else if (s.progressFullWidth && hasProgressLine) barHeight = PROGRESS_BAR_HEIGHT_FULLWIDTH

  const baseY = isTop ? edgeMargin : screenH - barHeight - edgeMargin
  const centerY = baseY + barHeight / 2

  const isNeg = s.enableNegative
  const bgColor = isNeg ? "#000000" : "#ffffff"
  const textColor = isNeg ? "#ffffff" : "#000000"
  const baseLineColor = isNeg ? "#ffffff" : "#000000"
  const progressColor = isNeg ? "#ffffff" : "#000000"
  const chapterMarkColor = isNeg ? "#ffffff" : "#000000"

  ctx.fillStyle = bgColor
  ctx.fillRect(0, baseY, screenW, barHeight)

  const fontSize = s.progressFontSize || 10
  ctx.font = `${fontSize}px sans-serif`
  ctx.textBaseline = "middle"

  let leftText = ""
  if (s.showChapterPage || s.showChapterPercent) {
    const ci = getChapterInfoForPage(currentPage, toc, totalPages)
    if (ci) {
      const chapterPages = ci.endPage - ci.startPage + 1
      const pageInChapter = currentPage - ci.startPage + 1
      const parts: string[] = []
      if (s.showChapterPage) parts.push(`${pageInChapter}/${chapterPages}`)
      if (s.showChapterPercent) parts.push(`${Math.round((pageInChapter / chapterPages) * 100)}%`)
      leftText = parts.join("  ")
    }
  }

  let rightText = ""
  const rightParts: string[] = []
  if (s.showPageInfo) rightParts.push(`${currentPage + 1}/${totalPages}`)
  if (s.showBookPercent) rightParts.push(`${Math.round(((currentPage + 1) / totalPages) * 100)}%`)
  rightText = rightParts.join("  ")

  const leftW = leftText ? ctx.measureText(leftText).width : 0
  const rightW = rightText ? ctx.measureText(rightText).width : 0

  let barStartX: number, barEndX: number, barWidth: number, lineY: number

  if (s.progressFullWidth && hasProgressLine) {
    lineY = baseY + 4
    const textY = baseY + barHeight - fontSize / 2 - 1
    barStartX = padding; barEndX = screenW - padding; barWidth = barEndX - barStartX
    if (leftText) { ctx.fillStyle = textColor; ctx.textAlign = "left"; ctx.fillText(leftText, padding, textY) }
    if (rightText) { ctx.fillStyle = textColor; ctx.textAlign = "right"; ctx.fillText(rightText, screenW - padding, textY) }
  } else {
    lineY = centerY
    barStartX = padding + (leftText ? leftW + 12 : 0)
    barEndX = screenW - padding - (rightText ? rightW + 12 : 0)
    barWidth = barEndX - barStartX
    if (leftText) { ctx.fillStyle = textColor; ctx.textAlign = "left"; ctx.fillText(leftText, padding, centerY) }
    if (rightText) { ctx.fillStyle = textColor; ctx.textAlign = "right"; ctx.fillText(rightText, screenW - padding, centerY) }
  }

  if (s.showProgressLine && barWidth > 0) {
    ctx.strokeStyle = baseLineColor; ctx.lineWidth = lineThickness
    ctx.beginPath(); ctx.moveTo(barStartX, lineY); ctx.lineTo(barEndX, lineY); ctx.stroke()
    const progress = (currentPage + 1) / totalPages
    ctx.strokeStyle = progressColor; ctx.lineWidth = progressThickness
    ctx.beginPath(); ctx.moveTo(barStartX, lineY); ctx.lineTo(barStartX + barWidth * progress, lineY); ctx.stroke()
    if (s.showChapterMarks) {
      const positions = getChapterPositions(toc, totalPages)
      ctx.strokeStyle = chapterMarkColor; ctx.lineWidth = 1
      for (const pos of positions) {
        const markX = barStartX + pos * barWidth
        if (markX >= barStartX && markX <= barEndX) {
          ctx.beginPath(); ctx.moveTo(markX, lineY - chapterMarkHeight / 2); ctx.lineTo(markX, lineY + chapterMarkHeight / 2); ctx.stroke()
        }
      }
    }
  }

  if (s.showChapterProgress && barWidth > 0) {
    const ci = getChapterInfoForPage(currentPage, toc, totalPages)
    if (ci) {
      const chapterPages = ci.endPage - ci.startPage + 1
      const chapterProgress = (currentPage - ci.startPage + 1) / chapterPages
      if (!s.showProgressLine) {
        ctx.strokeStyle = baseLineColor; ctx.lineWidth = lineThickness
        ctx.beginPath(); ctx.moveTo(barStartX, lineY); ctx.lineTo(barEndX, lineY); ctx.stroke()
      }
      const chapterY = s.showProgressLine ? lineY + 9 : lineY
      ctx.strokeStyle = progressColor; ctx.lineWidth = s.showProgressLine ? 2 : progressThickness
      ctx.beginPath(); ctx.moveTo(barStartX, chapterY); ctx.lineTo(barStartX + barWidth * chapterProgress, chapterY); ctx.stroke()
    }
  }
}

function applyDitheringSyncToData(
  data: Uint8ClampedArray, width: number, height: number,
  bits: number, strength: number, xthMode = false
) {
  const factor = strength / 100
  const pixelCount = width * height
  const err7_16 = factor * 7 / 16, err3_16 = factor * 3 / 16
  const err5_16 = factor * 5 / 16, err1_16 = factor * 1 / 16

  let quantize: (val: number) => number
  if (xthMode) {
    quantize = (val) => val > 212 ? 255 : val > 127 ? 170 : val > 42 ? 85 : 0
  } else {
    const levels = Math.pow(2, bits)
    const step = 255 / (levels - 1), invStep = 1 / step
    quantize = (val) => Math.round(val * invStep) * step
  }

  const gray = new Float32Array(pixelCount)
  for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4)
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]

  const widthM1 = width - 1, heightM1 = height - 1
  for (let y = 0; y < height; y++) {
    const row = y * width, next = row + width, notLast = y < heightM1
    for (let x = 0; x < width; x++) {
      const idx = row + x, old = gray[idx], nw = quantize(old)
      gray[idx] = nw; const err = old - nw
      if (x < widthM1) gray[idx + 1] += err * err7_16
      if (notLast) {
        if (x > 0) gray[next + x - 1] += err * err3_16
        gray[next + x] += err * err5_16
        if (x < widthM1) gray[next + x + 1] += err * err1_16
      }
    }
  }
  for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
    const g = gray[i] < 0 ? 0 : gray[i] > 255 ? 255 : (gray[i] + 0.5) | 0
    data[idx] = data[idx + 1] = data[idx + 2] = g
  }
}

function quantizeImageData(
  data: Uint8ClampedArray, bits: number, xthMode = false
) {
  const len = data.length
  if (xthMode) {
    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const q = gray > 212 ? 255 : gray > 127 ? 170 : gray > 42 ? 85 : 0
      data[i] = data[i + 1] = data[i + 2] = q
    }
  } else {
    const levels = Math.pow(2, bits), step = 255 / (levels - 1), inv = 1 / step
    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const q = ((gray * inv + 0.5) | 0) * step
      data[i] = data[i + 1] = data[i + 2] = q
    }
  }
}

function applyNegativeToData(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2]
  }
}

function generateXtgData(canvas: HTMLCanvasElement, bits: number): ArrayBuffer {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const imgData = ctx.getImageData(0, 0, w, h)
  const data = imgData.data

  function writeHeader(view: DataView, dataSize: number, bitCode: number) {
    view.setUint8(0, 0x58); view.setUint8(1, 0x54); view.setUint8(2, 0x47); view.setUint8(3, 0x00)
    view.setUint16(4, w, true); view.setUint16(6, h, true)
    view.setUint8(8, 0); view.setUint8(9, bitCode); view.setUint32(10, dataSize, true)
  }

  if (bits === 1) {
    const bpr = (w + 7) >> 3, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 0)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 8) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 8, w); bx++) {
          if (data[pi] >= 128) byte |= (1 << (7 - (bx - x)))
          pi += 4
        }
        arr[ro + (x >> 3)] = byte
      }
    }
    return buf
  } else if (bits === 2) {
    const bpr = (w + 3) >> 2, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 1)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 4) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 4, w); bx++) {
          byte |= ((data[pi] >> 6) << ((3 - (bx - x)) * 2))
          pi += 4
        }
        arr[ro + (x >> 2)] = byte
      }
    }
    return buf
  } else {
    const bpr = (w + 1) >> 1, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 2)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 2) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 2, w); bx++) {
          byte |= ((data[pi] >> 4) << ((1 - (bx - x)) * 4))
          pi += 4
        }
        arr[ro + (x >> 1)] = byte
      }
    }
    return buf
  }
}

function generateXthData(canvas: HTMLCanvasElement): ArrayBuffer {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, w, h).data
  const bpc = Math.ceil(h / 8), planeSize = bpc * w, ds = planeSize * 2
  const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)

  v.setUint8(0, 0x58); v.setUint8(1, 0x54); v.setUint8(2, 0x48); v.setUint8(3, 0x00)
  v.setUint16(4, w, true); v.setUint16(6, h, true)
  v.setUint8(8, 0); v.setUint8(9, 0); v.setUint32(10, ds, true)

  const p1 = 22, p2 = 22 + planeSize
  for (let x = w - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) {
      const gray = data[(y * w + x) * 4]
      const val = gray > 212 ? 0 : gray > 127 ? 2 : gray > 42 ? 1 : 3
      const colIdx = w - 1 - x, byteIdx = colIdx * bpc + Math.floor(y / 8), bitIdx = 7 - (y % 8)
      if ((val >> 1) & 1) arr[p1 + byteIdx] |= (1 << bitIdx)
      if (val & 1) arr[p2 + byteIdx] |= (1 << bitIdx)
    }
  }
  return buf
}

function downloadFile(data: ArrayBuffer, filename: string) {
  const blob = new Blob([data], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}

// ── Main Component ─────────────────────────────────────────────────

export default function EpubToXtcConverter() {
  // Settings state (persisted to localStorage, hydrated after mount)
  const [s, _setS] = useState<Settings>(DEFAULT_SETTINGS)
  const sRef = useRef<Settings>(DEFAULT_SETTINGS)
  const setS = useCallback((updater: Settings | ((prev: Settings) => Settings)) => {
    _setS(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      sRef.current = next
      try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setS(prev => ({ ...prev, ...patch }))
  }, [setS])

  // Book state
  const [files, setFiles] = useState<FileInfo[]>([])
  const [fileIdx, setFileIdx] = useState(0)
  const [meta, setMeta] = useState<BookMetadata>({})
  const [toc, setToc] = useState<TocItem[]>([])
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(0)
  const [bookLoaded, setBookLoaded] = useState(false)

  // UI state
  const [wasmReady, setWasmReady] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState("")
  const [exportPct, setExportPct] = useState(0)
  const [exportMsg, setExportMsg] = useState<React.ReactNode>("")
  const [showExport, setShowExport] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [deviceColor, setDeviceColor] = useState<DeviceColor>("black")

  // Hydrate persisted state from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const savedSettings = loadFromStorage<Partial<Settings>>(STORAGE_KEY_SETTINGS, {})
    if (Object.keys(savedSettings).length > 0) {
      setS(prev => ({ ...prev, ...savedSettings }))
    }
    const savedColor = loadFromStorage<DeviceColor | null>(STORAGE_KEY_DEVICE_COLOR, null)
    if (savedColor) setDeviceColor(savedColor)
    const savedDark = loadFromStorage<boolean | null>(STORAGE_KEY_DARK_MODE, null)
    if (savedDark === null) {
      setDarkMode(document.documentElement.classList.contains("dark"))
    } else {
      setDarkMode(savedDark)
      document.documentElement.classList.toggle("dark", savedDark)
    }
  }, [setS])

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      document.documentElement.classList.toggle("dark", next)
      document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=${365 * 24 * 60 * 60}`
      try { localStorage.setItem(STORAGE_KEY_DARK_MODE, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_DEVICE_COLOR, JSON.stringify(deviceColor)) } catch {}
  }, [deviceColor])

  // Refs
  const moduleRef = useRef<WasmModule>(null)
  const rendererRef = useRef<Renderer>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tocRef = useRef<TocItem[]>([])
  const metaRef = useRef<BookMetadata>({})
  const filesRef = useRef<FileInfo[]>([])
  const fileIdxRef = useRef(0)
  const loadedFontsRef = useRef<Set<string>>(new Set())
  const loadedPatternsRef = useRef<Set<string>>(new Set())
  const processingRef = useRef(false)
  const screenDimsRef = useRef({ screenWidth: 480, screenHeight: 800, deviceWidth: 480, deviceHeight: 800 })

  // Sync refs
  useEffect(() => { tocRef.current = toc }, [toc])
  useEffect(() => { metaRef.current = meta }, [meta])
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { fileIdxRef.current = fileIdx }, [fileIdx])

  // ── Engine functions ──

  const loadFontFromUrl = useCallback(async (url: string, filename: string): Promise<boolean> => {
    const mod = moduleRef.current, ren = rendererRef.current
    if (!mod || !ren) return false
    try {
      const resp = await fetch(url)
      if (!resp.ok) return false
      const data = new Uint8Array(await resp.arrayBuffer())
      const ptr = mod.allocateMemory(data.length)
      mod.HEAPU8.set(data, ptr)
      const result = ren.registerFontFromMemory(ptr, data.length, filename)
      mod.freeMemory(ptr)
      return !!result
    } catch { return false }
  }, [])

  const loadFontFamily = useCallback(async (familyName: string): Promise<boolean> => {
    if (loadedFontsRef.current.has(familyName)) return true
    const family = FONT_FAMILIES[familyName]
    if (!family) return false
    const results = await Promise.all(family.variants.map(v => loadFontFromUrl(v.url, v.file)))
    if (results.some(r => r)) { loadedFontsRef.current.add(familyName); return true }
    return false
  }, [loadFontFromUrl])

  const loadRequiredFonts = useCallback(async () => {
    await loadFontFamily("Literata")
    for (const font of ARABIC_FONTS) await loadFontFromUrl(font.url, font.file)
    const ren = rendererRef.current
    if (ren?.setFallbackFontFaces) ren.setFallbackFontFaces("Literata;Noto Naskh Arabic")
  }, [loadFontFamily, loadFontFromUrl])

  const loadHyphenationPattern = useCallback(async (langTag: string) => {
    const ren = rendererRef.current, mod = moduleRef.current
    if (!ren || !mod) return
    const patternFile = getPatternForLang(langTag)
    if (loadedPatternsRef.current.has(patternFile)) return
    try {
      const resp = await fetch(`/patterns/${patternFile}`)
      if (!resp.ok) return
      const data = new Uint8Array(await resp.arrayBuffer())
      const ptr = mod.allocateMemory(data.length)
      mod.HEAPU8.set(data, ptr)
      const result = ren.loadHyphenationPattern(ptr, data.length, patternFile)
      mod.freeMemory(ptr)
      if (result) {
        loadedPatternsRef.current.add(patternFile)
        ren.initHyphenation("/hyph")
        ren.activateHyphenationDict(patternFile)
      }
    } catch { /* ignore */ }
  }, [])

  const renderPreview = useCallback(() => {
    const ren = rendererRef.current, canvas = canvasRef.current
    if (!ren || !canvas) return
    const settings = sRef.current
    const { screenWidth: sw, screenHeight: sh } = screenDimsRef.current

    ren.renderCurrentPage()
    const buffer = ren.getFrameBuffer()
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    const imageData = ctx.createImageData(sw, sh)
    for (let i = 0; i < buffer.length; i++) imageData.data[i] = buffer[i]

    const isHQ = settings.qualityMode === "hq"
    const bits = isHQ ? 2 : 1
    if (settings.enableDithering) {
      applyDitheringSyncToData(imageData.data, sw, sh, bits, settings.ditherStrength, isHQ)
    } else {
      quantizeImageData(imageData.data, bits, isHQ)
    }

    if (settings.enableNegative) {
      applyNegativeToData(imageData.data)
    }

    ctx.putImageData(imageData, 0, 0)

    const curPage = ren.getCurrentPage()
    const totalPages = ren.getPageCount()
    drawProgressIndicator(ctx, settings, curPage, totalPages, sw, sh, tocRef.current)

    setPage(curPage)
    setPages(totalPages)
  }, [])

  const applySettings = useCallback(() => {
    const ren = rendererRef.current
    if (!ren) return
    const settings = sRef.current

    ren.setFontSize(settings.fontSize)
    if (ren.setFontWeight) ren.setFontWeight(settings.fontWeight)
    ren.setInterlineSpace(settings.lineHeight)

    let topMargin = settings.margin, bottomMargin = settings.margin
    const edgeM = settings.progressEdgeMargin || 0
    if (settings.enableProgressBar) {
      const hasBoth = settings.showProgressLine && settings.showChapterProgress
      const hasLine = settings.showProgressLine || settings.showChapterProgress
      let ph = PROGRESS_BAR_HEIGHT
      if (settings.showChapterMarks || (settings.progressFullWidth && hasBoth)) ph = PROGRESS_BAR_HEIGHT_EXTENDED
      else if (settings.progressFullWidth && hasLine) ph = PROGRESS_BAR_HEIGHT_FULLWIDTH
      if (settings.progressPosition === "bottom") bottomMargin = Math.max(settings.margin, ph + edgeM)
      else topMargin = Math.max(settings.margin, ph + edgeM)
    }
    ren.setMargins(settings.margin, topMargin, settings.margin, bottomMargin)

    if (settings.fontFace) ren.setFontFace(settings.fontFace)
    if (ren.setTextAlign) ren.setTextAlign(settings.textAlign)
    if (ren.setWordSpacing) ren.setWordSpacing(settings.wordSpacing)
    if (ren.setHyphenation) ren.setHyphenation(settings.hyphenation)
    if (ren.setIgnoreDocMargins) ren.setIgnoreDocMargins(settings.ignoreDocMargins)
    if (ren.setFontHinting) ren.setFontHinting(settings.fontHinting)
    // Always render with full AA so dithering has intermediate gray values to work with.
    // The quality mode controls output bit depth (1-bit/2-bit), not rendering quality.
    if (ren.setFontAntialiasing) ren.setFontAntialiasing(2)
    try { ren.configureStatusBar(false, false, false, false, false, false, false, false, false) } catch { /* */ }

    setPages(ren.getPageCount())

    try {
      const newToc = ren.getToc()
      setToc(newToc)
    } catch { /* */ }

    renderPreview()
  }, [renderPreview])

  const reformatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateAndReformat = useCallback((patch: Partial<Settings>) => {
    update(patch)
    if (reformatTimerRef.current !== null) clearTimeout(reformatTimerRef.current)
    reformatTimerRef.current = setTimeout(() => {
      reformatTimerRef.current = null
      requestAnimationFrame(() => applySettings())
    }, 100)
  }, [update, applySettings])

  const updateAndRender = useCallback((patch: Partial<Settings>) => {
    update(patch)
    if (renderTimerRef.current !== null) clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(() => {
      renderTimerRef.current = null
      requestAnimationFrame(() => renderPreview())
    }, 50)
  }, [update, renderPreview])

  const flushReformat = useCallback(() => {
    if (reformatTimerRef.current !== null) {
      clearTimeout(reformatTimerRef.current)
      reformatTimerRef.current = null
      applySettings()
    }
  }, [applySettings])

  const flushRender = useCallback(() => {
    if (renderTimerRef.current !== null) {
      clearTimeout(renderTimerRef.current)
      renderTimerRef.current = null
      renderPreview()
    }
  }, [renderPreview])

  const loadEpub = useCallback(async (file: File) => {
    const mod = moduleRef.current, ren = rendererRef.current
    if (!mod || !ren) return
    setLoading(true); setLoadingMsg("Loading book...")
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const ptr = mod.allocateMemory(data.length)
      mod.HEAPU8.set(data, ptr)
      const result = ren.loadEpubFromMemory(ptr, data.length)
      mod.freeMemory(ptr)
      if (!result) throw new Error("Failed to load EPUB")

      const info = ren.getDocumentInfo()
      const newMeta = { title: info.title || file.name, authors: info.authors || "Unknown", language: info.language || "" }
      setMeta(newMeta); metaRef.current = newMeta

      if (sRef.current.hyphenation === 2) {
        const lang = sRef.current.hyphenationLang === "auto" ? (newMeta.language || "en") : sRef.current.hyphenationLang
        await loadHyphenationPattern(lang)
      }

      setBookLoaded(true)
      applySettings()
    } catch (err) {
      console.error("Error loading EPUB:", err)
    } finally {
      setLoading(false)
    }
  }, [applySettings, loadHyphenationPattern])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const epubs = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith(".epub"))
    if (epubs.length === 0) return
    let firstNew = -1
    setFiles(prev => {
      const next = [...prev]
      for (const file of epubs) {
        if (!next.some(f => f.name === file.name && f.file.size === file.size)) {
          if (firstNew === -1) firstNew = next.length
          next.push({ file, name: file.name, loaded: false })
        }
      }
      filesRef.current = next
      return next
    })
    if (firstNew !== -1) {
      setFileIdx(firstNew)
      fileIdxRef.current = firstNew
      const epub = epubs[0]
      loadEpub(epub)
    }
  }, [loadEpub])

  const switchToFile = useCallback(async (index: number) => {
    if (index < 0 || index >= filesRef.current.length || processingRef.current) return
    setFileIdx(index); fileIdxRef.current = index
    const fi = filesRef.current[index]
    await loadEpub(fi.file)
    fi.loaded = true
  }, [loadEpub])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const next = [...prev]
      next.splice(index, 1)
      filesRef.current = next
      if (next.length === 0) { setBookLoaded(false); setFileIdx(0); fileIdxRef.current = 0 }
      else if (index <= fileIdxRef.current) {
        const ni = Math.max(0, fileIdxRef.current - 1)
        setFileIdx(ni); fileIdxRef.current = ni
        switchToFile(ni)
      }
      return next
    })
  }, [switchToFile])

  const handleExportXtc = useCallback(async (internal?: boolean) => {
    const ren = rendererRef.current, mod = moduleRef.current
    if (!ren || !mod) return
    if (!internal && processingRef.current) return
    if (!internal) { processingRef.current = true; setProcessing(true); setShowExport(true) }

    const startTime = performance.now()
    try {
      const settings = sRef.current
      const bits = settings.qualityMode === "hq" ? 2 : 1
      const isHQ = settings.qualityMode === "hq"
      const pageCount = ren.getPageCount()
      const { screenWidth: sw, screenHeight: sh, deviceWidth: dw, deviceHeight: dh } = screenDimsRef.current

      const chapters: { name: string; startPage: number; endPage: number }[] = []
      function extractChapters(items: TocItem[]) {
        for (const item of items) {
          chapters.push({ name: item.title.substring(0, 79), startPage: Math.max(0, Math.min(item.page, pageCount - 1)), endPage: -1 })
          if (item.children?.length) extractChapters(item.children)
        }
      }
      extractChapters(tocRef.current)
      chapters.sort((a, b) => a.startPage - b.startPage)

      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = sw; tempCanvas.height = sh
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true })!

      const pageBuffers: ArrayBuffer[] = []
      let totalDataSize = 0

      for (let pg = 0; pg < pageCount; pg++) {
        const pct = Math.round((pg / pageCount) * 100)
        setExportPct(pct); setExportMsg(<>Rendering page <span className="font-mono">{pg + 1}</span> of <span className="font-mono">{pageCount}</span>...</>)

        ren.goToPage(pg); ren.renderCurrentPage()
        const buffer = ren.getFrameBuffer()
        const imageData = tempCtx.createImageData(sw, sh)
        imageData.data.set(buffer)
        tempCtx.putImageData(imageData, 0, 0)

        if (settings.enableDithering) {
          const img = tempCtx.getImageData(0, 0, sw, sh)
          applyDitheringSyncToData(img.data, sw, sh, bits, settings.ditherStrength, isHQ)
          tempCtx.putImageData(img, 0, 0)
        } else {
          const img = tempCtx.getImageData(0, 0, sw, sh)
          quantizeImageData(img.data, bits, isHQ)
          tempCtx.putImageData(img, 0, 0)
        }

        if (settings.enableNegative) {
          const img = tempCtx.getImageData(0, 0, sw, sh)
          applyNegativeToData(img.data)
          tempCtx.putImageData(img, 0, 0)
        }

        drawProgressIndicator(tempCtx, settings, pg, pageCount, sw, sh, tocRef.current)

        let finalCanvas: HTMLCanvasElement = tempCanvas
        const rot = settings.orientation
        if (rot !== 0) {
          const rc = document.createElement("canvas")
          rc.width = dw; rc.height = dh
          const rCtx = rc.getContext("2d")!
          if (rot === 90) { rCtx.translate(dw, 0); rCtx.rotate(Math.PI / 2) }
          else if (rot === 180) { rCtx.translate(dw, dh); rCtx.rotate(Math.PI) }
          else if (rot === 270) { rCtx.translate(0, dh); rCtx.rotate(3 * Math.PI / 2) }
          rCtx.drawImage(tempCanvas, 0, 0)
          finalCanvas = rc
        }

        const pageData = isHQ ? generateXthData(finalCanvas) : generateXtgData(finalCanvas, 1)
        pageBuffers.push(pageData)
        totalDataSize += pageData.byteLength

        if (pg % 10 === 0) await new Promise(r => setTimeout(r, 0))
      }

      for (let i = 0; i < chapters.length; i++) {
        chapters[i].endPage = i < chapters.length - 1 ? chapters[i + 1].startPage - 1 : pageCount - 1
        if (chapters[i].endPage < chapters[i].startPage) chapters[i].endPage = chapters[i].startPage
      }

      const headerSize = 56, metadataSize = 256, chapterEntrySize = 96, indexEntrySize = 16
      const chapterCount = chapters.length
      const metaOffset = headerSize
      const chapOffset = metaOffset + metadataSize
      const indexOffset = chapOffset + chapterCount * chapterEntrySize
      const dataOffset = indexOffset + pageCount * indexEntrySize
      const totalSize = dataOffset + totalDataSize

      const buf = new ArrayBuffer(totalSize)
      const view = new DataView(buf), arr = new Uint8Array(buf)

      view.setUint8(0, 0x58); view.setUint8(1, 0x54); view.setUint8(2, 0x43)
      view.setUint8(3, isHQ ? 0x48 : 0x00)
      view.setUint16(4, 1, true); view.setUint16(6, pageCount, true)
      view.setUint8(8, 0); view.setUint8(9, 1); view.setUint8(10, 0)
      view.setUint8(11, chapterCount > 0 ? 1 : 0); view.setUint32(12, 1, true)

      view.setBigUint64(16, BigInt(metaOffset), true)
      view.setBigUint64(24, BigInt(indexOffset), true)
      view.setBigUint64(32, BigInt(dataOffset), true)
      view.setBigUint64(40, BigInt(0), true)
      view.setBigUint64(48, BigInt(chapOffset), true)

      const enc = new TextEncoder()
      const titleBytes = enc.encode(metaRef.current.title || "Untitled")
      const authorBytes = enc.encode(metaRef.current.authors || "Unknown")
      for (let i = 0; i < Math.min(titleBytes.length, 127); i++) arr[metaOffset + i] = titleBytes[i]
      for (let i = 0; i < Math.min(authorBytes.length, 63); i++) arr[metaOffset + 0x80 + i] = authorBytes[i]

      view.setUint32(metaOffset + 0xF0, Math.floor(Date.now() / 1000), true)
      view.setUint16(metaOffset + 0xF4, 0, true)
      view.setUint16(metaOffset + 0xF6, chapterCount, true)

      for (let i = 0; i < chapters.length; i++) {
        const co = chapOffset + i * chapterEntrySize
        const nb = enc.encode(chapters[i].name)
        for (let j = 0; j < Math.min(nb.length, 79); j++) arr[co + j] = nb[j]
        view.setUint16(co + 0x50, chapters[i].startPage + 1, true)
        view.setUint16(co + 0x52, chapters[i].endPage + 1, true)
      }

      let absOff = dataOffset
      for (let i = 0; i < pageCount; i++) {
        const iea = indexOffset + i * indexEntrySize
        view.setBigUint64(iea, BigInt(absOff), true)
        view.setUint32(iea + 8, pageBuffers[i].byteLength, true)
        view.setUint16(iea + 12, dw, true); view.setUint16(iea + 14, dh, true)
        absOff += pageBuffers[i].byteLength
      }

      let wo = dataOffset
      for (let i = 0; i < pageCount; i++) {
        arr.set(new Uint8Array(pageBuffers[i]), wo)
        wo += pageBuffers[i].byteLength
      }

      const totalTime = ((performance.now() - startTime) / 1000).toFixed(1)
      const ext = isHQ ? ".xtch" : ".xtc"
      const filename = (metaRef.current.title || "book").replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, "_").substring(0, 50) + ext
      downloadFile(buf, filename)
      setExportMsg(<>Done! <span className="font-mono">{totalTime}s</span> total (<span className="font-mono">{pageCount}</span> pages)</>)
      setExportPct(100)
      if (!internal) setTimeout(() => setShowExport(false), 2000)
    } catch (err) {
      console.error("Export error:", err)
      setExportMsg("Export failed!")
      if (!internal) setTimeout(() => setShowExport(false), 2000)
    } finally {
      if (!internal) { processingRef.current = false; setProcessing(false) }
    }
  }, [])


  const handleExportAll = useCallback(async () => {
    if (filesRef.current.length === 0 || processingRef.current) return
    processingRef.current = true; setProcessing(true); setShowExport(true)
    const totalFiles = filesRef.current.length
    try {
      for (let fi = 0; fi < totalFiles; fi++) {
        setExportMsg(<>Loading file <span className="font-mono">{fi + 1}</span>/<span className="font-mono">{totalFiles}</span>...</>)
        setExportPct((fi / totalFiles) * 100)
        await loadEpub(filesRef.current[fi].file)
        setFileIdx(fi); fileIdxRef.current = fi
        await handleExportXtc(true)
      }
      setExportMsg(<>All <span className="font-mono">{totalFiles}</span> files exported!</>)
      setExportPct(100)
      setTimeout(() => setShowExport(false), 3000)
    } catch (err) {
      console.error("Export all error:", err)
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [loadEpub, handleExportXtc])

  // ── Initialization ──

  useEffect(() => {
    const script = document.createElement("script")
    script.src = "/lib/crengine.js"
    script.onload = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const CREngine = (window as any).CREngine
        if (!CREngine) return
        const mod = await CREngine({
          printErr: (msg: string) => {
            if (typeof msg === "string" && msg.includes("FT_New_Memory_Face failed")) {
              console.warn("[crengine]", msg)
            } else {
              console.error(msg)
            }
          },
        })
        moduleRef.current = mod
        const dims = screenDimsRef.current
        const ren = new mod.EpubRenderer(dims.screenWidth, dims.screenHeight)
        rendererRef.current = ren
        if (ren.initHyphenation) ren.initHyphenation("/hyph")
        await loadRequiredFonts()
        // Load persisted font if it differs from the default
        const persistedFont = sRef.current.fontFace
        if (persistedFont && persistedFont !== "Literata" && !loadedFontsRef.current.has(persistedFont)) {
          await loadFontFamily(persistedFont)
        }
        setWasmReady(true)
      } catch (err) { console.error("Failed to load CREngine:", err) }
    }
    document.head.appendChild(script)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle device/orientation changes
  useEffect(() => {
    const dims = getScreenDimensions(s.deviceType, s.orientation)
    screenDimsRef.current = dims
    const canvas = canvasRef.current
    if (canvas) { canvas.width = dims.screenWidth; canvas.height = dims.screenHeight }
    const ren = rendererRef.current
    if (ren) {
      ren.resize(dims.screenWidth, dims.screenHeight)
      applySettings()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.deviceType, s.orientation])

  // Handle quality mode changes
  const handleQualityChange = useCallback((mode: "fast" | "hq") => {
    const hinting = mode === "fast" ? 1 : 2
    update({ qualityMode: mode, fontHinting: hinting, fontAntialiasing: 2 })
    requestAnimationFrame(() => applySettings())
  }, [update, applySettings])

  // Handle font change
  const handleFontChange = useCallback(async (fontName: string | null) => {
    if (!fontName) return
    update({ fontFace: fontName })
    if (fontName && !loadedFontsRef.current.has(fontName)) {
      await loadFontFamily(fontName)
    }
    requestAnimationFrame(() => applySettings())
  }, [update, loadFontFamily, applySettings])

  // Handle hyphenation changes
  const handleHyphenationChange = useCallback(async (val: number) => {
    update({ hyphenation: val })
    if (val === 2) {
      const lang = sRef.current.hyphenationLang === "auto"
        ? (metaRef.current.language || "en") : sRef.current.hyphenationLang
      await loadHyphenationPattern(lang)
    }
    requestAnimationFrame(() => applySettings())
  }, [update, loadHyphenationPattern, applySettings])

  const handleHyphenLangChange = useCallback(async (lang: string | null) => {
    if (!lang) return
    update({ hyphenationLang: lang })
    if (sRef.current.hyphenation === 2) {
      const actualLang = lang === "auto" ? (metaRef.current.language || "en") : lang
      await loadHyphenationPattern(actualLang)
      requestAnimationFrame(() => applySettings())
    }
  }, [update, loadHyphenationPattern, applySettings])

  // Navigation
  const prevPage = useCallback(() => {
    const ren = rendererRef.current; if (!ren) return
    ren.prevPage(); renderPreview()
  }, [renderPreview])

  const nextPage = useCallback(() => {
    const ren = rendererRef.current; if (!ren) return
    ren.nextPage(); renderPreview()
  }, [renderPreview])

  const goToPage = useCallback((pg: number) => {
    const ren = rendererRef.current; if (!ren) return
    ren.goToPage(pg); renderPreview()
  }, [renderPreview])

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevPage()
      else if (e.key === "ArrowRight") nextPage()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [prevPage, nextPage])

  // Custom font upload
  const fontInputRef = useRef<HTMLInputElement>(null)
  const [customFontName, setCustomFontName] = useState("")

  const handleCustomFont = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const mod = moduleRef.current, ren = rendererRef.current
    if (!file || !mod || !ren) return
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const ptr = mod.allocateMemory(data.length)
      mod.HEAPU8.set(data, ptr)
      const name = ren.registerFontFromMemory(ptr, data.length, file.name)
      mod.freeMemory(ptr)
      if (name) {
        setCustomFontName(name)
        update({ fontFace: name })
        requestAnimationFrame(() => applySettings())
      }
    } catch { /* */ }
    e.target.value = ""
  }, [update, applySettings])

  // Slider value helper (base-ui returns number | readonly number[])
  const sv = (v: number | readonly number[]) => Array.isArray(v) ? v[0] : v

  // Select display label helpers (base-ui Value may show raw value before first open)
  const deviceLabel: Record<string, string> = { x4: "X4 (480x800)", x3: "X3 (528x792)" }
  const orientLabel: Record<string, string> = { "0": "Portrait 0°", "90": "Landscape 90°", "180": "Portrait 180°", "270": "Landscape 270°" }
  const alignLabel: Record<string, string> = { "-1": "Default", "0": "Left", "1": "Right", "2": "Center", "3": "Justify" }
  const spacingLabel: Record<string, string> = { "50": "Small (50%)", "75": "Condensed", "100": "Normal", "125": "Expanded", "150": "Wide", "200": "Extra Wide" }
  const hyphLabel: Record<string, string> = { "0": "Off", "1": "Algorithmic", "2": "Dictionary" }
  const langLabel: Record<string, string> = { auto: "Auto", en: "English", "en-gb": "English (UK)", de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", ru: "Russian" }
  const qualLabel: Record<string, string> = { fast: "Fast (1-bit)", hq: "HQ (2-bit)" }

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Render ──

  const dims = getScreenDimensions(s.deviceType, s.orientation)

  // Compute bezel layout based on device type and orientation
  const bz = DEVICE_BEZELS[s.deviceType]
  const dc = DEVICE_COLORS[deviceColor]
  const chinSide: "top" | "right" | "bottom" | "left" =
    s.orientation === 0 ? "bottom" : s.orientation === 90 ? "right" : s.orientation === 180 ? "top" : "left"
  const bezelTop    = chinSide === "top"    ? bz.chin : chinSide === "bottom" ? bz.top : bz.side
  const bezelRight  = chinSide === "right"  ? bz.chin : chinSide === "left"   ? bz.top : bz.side
  const bezelBottom = chinSide === "bottom" ? bz.chin : chinSide === "top"    ? bz.top : bz.side
  const bezelLeft   = chinSide === "left"   ? bz.chin : chinSide === "right"  ? bz.top : bz.side
  const totalW = bezelLeft + dims.screenWidth + bezelRight
  const totalH = bezelTop + dims.screenHeight + bezelBottom
  // True-to-life CSS size: device physical mm → CSS pixels (swap for landscape)
  const isLandscape = s.orientation === 90 || s.orientation === 270
  const trueLifeW = (isLandscape ? bz.deviceHeightMm : bz.deviceWidthMm) / 25.4 * TRUE_LIFE_CSS_PPI
  const trueLifeH = (isLandscape ? bz.deviceWidthMm : bz.deviceHeightMm) / 25.4 * TRUE_LIFE_CSS_PPI

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-[360px] border-r border-border/50 flex flex-col bg-card/50">
        <Tabs defaultValue={0} className="flex-1 flex flex-col min-h-0 gap-0">
          <div className="flex items-center px-4 py-2 border-b border-border/50">
            <TabsList className="w-full !h-7 p-0.5">
              <TabsTrigger value={0} className="text-[12px]">Files</TabsTrigger>
              <TabsTrigger value={1} className="text-[12px]">Options</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={0} className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          {/* Upload area */}
          <div
            className={`group relative border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-all duration-200 mb-3 ${
              dragOver
                ? "border-primary bg-primary/5 shadow-[0_0_15px_-3px] shadow-primary/20"
                : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
          >
            <div className={`mx-auto w-8 h-8 mb-2 rounded-full flex items-center justify-center transition-colors ${
              dragOver ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground"
            }`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div className="text-xs font-medium">Drop EPUB files here</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">or click to browse</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = "" }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mb-3 rounded-lg border border-border/50 overflow-hidden bg-muted/20">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">{files.length} file{files.length > 1 ? "s" : ""}</span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => { setFiles([]); filesRef.current = []; setBookLoaded(false) }}>
                  Clear
                </Button>
              </div>
              {files.map((f, i) => (
                <div
                  key={f.name + i}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer border-t border-border/30 transition-colors ${
                    i === fileIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                  }`}
                  onClick={() => switchToFile(i)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                  <span className="truncate flex-1">{f.name}</span>
                  <button className="ml-1 text-muted-foreground hover:text-destructive text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); removeFile(i) }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          </TabsContent>

          <TabsContent value={1} className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <Accordion multiple defaultValue={["device", "text"]} className="space-y-1">
            {/* Device */}
            <AccordionItem value="device" className="border border-border/40 rounded-lg px-3 data-[state=open]:bg-muted/20">
              <AccordionTrigger className="py-2.5 text-[12px] font-medium text-foreground hover:no-underline gap-2">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                  Device
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Model</Label>
                    <Select value={s.deviceType} onValueChange={(v) => v && update({ deviceType: v as DeviceType })}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue>{deviceLabel[s.deviceType]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="x4">X4 (480x800)</SelectItem>
                          <SelectItem value="x3">X3 (528x792)</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Orientation</Label>
                    <Select value={String(s.orientation)} onValueChange={(v) => v && update({ orientation: Number(v) })}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue>{orientLabel[String(s.orientation)]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="0">Portrait 0&deg;</SelectItem>
                          <SelectItem value="90">Landscape 90&deg;</SelectItem>
                          <SelectItem value="180">Portrait 180&deg;</SelectItem>
                          <SelectItem value="270">Landscape 270&deg;</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Text Settings */}
            <AccordionItem value="text" className="border border-border/40 rounded-lg px-3 data-[state=open]:bg-muted/20">
              <AccordionTrigger className="py-2.5 text-[12px] font-medium text-foreground hover:no-underline gap-2">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                  Typography
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Font</Label>
                    <Select value={s.fontFace} onValueChange={handleFontChange}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue>{s.fontFace === "epub-default" ? "Default (EPUB)" : s.fontFace}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="epub-default">Default (EPUB)</SelectItem>
                          {Object.keys(FONT_FAMILIES).map(f => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                          {customFontName && <SelectItem value={customFontName}>{customFontName} (custom)</SelectItem>}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Alignment</Label>
                    <Select value={String(s.textAlign)} onValueChange={(v) => v && updateAndReformat({ textAlign: Number(v) })}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue>{alignLabel[String(s.textAlign)]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="-1">Default</SelectItem>
                          <SelectItem value="0">Left</SelectItem>
                          <SelectItem value="1">Right</SelectItem>
                          <SelectItem value="2">Center</SelectItem>
                          <SelectItem value="3">Justify</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Word Spacing</Label>
                    <Select value={String(s.wordSpacing)} onValueChange={(v) => v && updateAndReformat({ wordSpacing: Number(v) })}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue>{spacingLabel[String(s.wordSpacing)]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="50">Small (50%)</SelectItem>
                          <SelectItem value="75">Condensed</SelectItem>
                          <SelectItem value="100">Normal</SelectItem>
                          <SelectItem value="125">Expanded</SelectItem>
                          <SelectItem value="150">Wide</SelectItem>
                          <SelectItem value="200">Extra Wide</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Hyphenation</Label>
                    <Select value={String(s.hyphenation)} onValueChange={(v) => v && handleHyphenationChange(Number(v))}>
                      <SelectTrigger className="h-8 text-[12px]"><SelectValue>{hyphLabel[String(s.hyphenation)]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="0">Off</SelectItem>
                          <SelectItem value="1">Algorithmic</SelectItem>
                          <SelectItem value="2">Dictionary</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">Hyphenation Language</Label>
                  <Select value={s.hyphenationLang} onValueChange={handleHyphenLangChange}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue>{langLabel[s.hyphenationLang] || s.hyphenationLang}{s.hyphenationLang === "auto" && meta.language ? ` (${meta.language})` : ""}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="auto">Auto{meta.language ? ` (${meta.language})` : ""}</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="en-gb">English (UK)</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="it">Italian</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                        <SelectItem value="nl">Dutch</SelectItem>
                        <SelectItem value="pl">Polish</SelectItem>
                        <SelectItem value="ru">Russian</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="!my-2 opacity-50" />

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[11px] text-muted-foreground">Font Size</Label>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.fontSize}px</span>
                  </div>
                  <Slider value={[s.fontSize]} min={14} max={48} step={1}
                    onValueChange={(v) => updateAndReformat({ fontSize: sv(v) })}
                    onValueCommitted={flushReformat} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[11px] text-muted-foreground">Weight</Label>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.fontWeight}</span>
                  </div>
                  <Slider value={[s.fontWeight]} min={100} max={900} step={100}
                    onValueChange={(v) => updateAndReformat({ fontWeight: sv(v) })}
                    onValueCommitted={flushReformat} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[11px] text-muted-foreground">Line Height</Label>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.lineHeight}%</span>
                  </div>
                  <Slider value={[s.lineHeight]} min={80} max={200} step={1}
                    onValueChange={(v) => updateAndReformat({ lineHeight: sv(v) })}
                    onValueCommitted={flushReformat} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[11px] text-muted-foreground">Margins</Label>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.margin}px</span>
                  </div>
                  <Slider value={[s.margin]} min={0} max={50} step={1}
                    onValueChange={(v) => updateAndReformat({ margin: sv(v) })}
                    onValueCommitted={flushReformat} />
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <Checkbox id="ignoreDocMargins" checked={s.ignoreDocMargins}
                    onCheckedChange={(v) => updateAndReformat({ ignoreDocMargins: !!v })} />
                  <Label htmlFor="ignoreDocMargins" className="text-[12px]">Ignore document margins</Label>
                </div>

                <div>
                  <input ref={fontInputRef} type="file" accept=".ttf,.otf" className="hidden" onChange={handleCustomFont} />
                  <Button variant="outline" size="sm" className="w-full h-7 text-[12px]" onClick={() => fontInputRef.current?.click()}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload Custom Font
                  </Button>
                  {customFontName && <p className="text-[11px] text-muted-foreground mt-1">Loaded: {customFontName}</p>}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Image Settings */}
            <AccordionItem value="image" className="border border-border/40 rounded-lg px-3 data-[state=open]:bg-muted/20">
              <AccordionTrigger className="py-2.5 text-[12px] font-medium text-foreground hover:no-underline gap-2">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  Image
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">Quality</Label>
                  <Select value={s.qualityMode} onValueChange={(v) => v && handleQualityChange(v as "fast" | "hq")}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue>{qualLabel[s.qualityMode]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="fast">Fast (1-bit, XTG)</SelectItem>
                        <SelectItem value="hq">High Quality (2-bit, XTH)</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between py-0.5">
                  <Label className="text-[12px]">Dithering</Label>
                  <Switch checked={s.enableDithering} onCheckedChange={(v) => updateAndRender({ enableDithering: v })} />
                </div>

                {s.enableDithering && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[11px] text-muted-foreground">Strength</Label>
                      <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.ditherStrength}%</span>
                    </div>
                    <Slider value={[s.ditherStrength]} min={0} max={100} step={1}
                      onValueChange={(v) => updateAndRender({ ditherStrength: sv(v) })}
                      onValueCommitted={flushRender} />
                  </div>
                )}

                <div className="flex items-center justify-between py-0.5">
                  <Label className="text-[12px]">Dark Mode</Label>
                  <Switch checked={s.enableNegative} onCheckedChange={(v) => updateAndRender({ enableNegative: v })} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Progress Bar */}
            <AccordionItem value="progress" className="border border-border/40 rounded-lg px-3 data-[state=open]:bg-muted/20">
              <AccordionTrigger className="py-2.5 text-[12px] font-medium text-foreground hover:no-underline gap-2">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                  Progress Bar
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3 space-y-3">
                <div className="flex items-center justify-between py-0.5">
                  <Label className="text-[12px]">Enabled</Label>
                  <Switch checked={s.enableProgressBar} onCheckedChange={(v) => updateAndReformat({ enableProgressBar: v })} />
                </div>

                {s.enableProgressBar && (
                  <>
                    <div>
                      <Label className="text-[11px] text-muted-foreground mb-1 block">Position</Label>
                      <Select value={s.progressPosition} onValueChange={(v) => v && updateAndReformat({ progressPosition: v as "top" | "bottom" })}>
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue>{s.progressPosition === "bottom" ? "Bottom" : "Top"}</SelectValue></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="bottom">Bottom</SelectItem>
                            <SelectItem value="top">Top</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Progress Line</Label>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <div className="flex items-center gap-2">
                          <Checkbox id="showProgressLine" checked={s.showProgressLine}
                            onCheckedChange={(v) => updateAndReformat({ showProgressLine: !!v })} />
                          <Label htmlFor="showProgressLine" className="text-[12px]">Book</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="showChapterMarks" checked={s.showChapterMarks}
                            onCheckedChange={(v) => updateAndReformat({ showChapterMarks: !!v })} />
                          <Label htmlFor="showChapterMarks" className="text-[12px]">Chapter Marks</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="showChapterProgress" checked={s.showChapterProgress}
                            onCheckedChange={(v) => updateAndReformat({ showChapterProgress: !!v })} />
                          <Label htmlFor="showChapterProgress" className="text-[12px]">Chapter</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="progressFullWidth" checked={s.progressFullWidth}
                            onCheckedChange={(v) => updateAndReformat({ progressFullWidth: !!v })} />
                          <Label htmlFor="progressFullWidth" className="text-[12px]">Full Width</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Display Info</Label>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <div className="flex items-center gap-2">
                          <Checkbox id="showPageInfo" checked={s.showPageInfo}
                            onCheckedChange={(v) => updateAndRender({ showPageInfo: !!v })} />
                          <Label htmlFor="showPageInfo" className="text-[12px]">Page (X/Y)</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="showBookPercent" checked={s.showBookPercent}
                            onCheckedChange={(v) => updateAndRender({ showBookPercent: !!v })} />
                          <Label htmlFor="showBookPercent" className="text-[12px]">Book %</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="showChapterPage" checked={s.showChapterPage}
                            onCheckedChange={(v) => updateAndRender({ showChapterPage: !!v })} />
                          <Label htmlFor="showChapterPage" className="text-[12px]">Chapter (X/Y)</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="showChapterPercent" checked={s.showChapterPercent}
                            onCheckedChange={(v) => updateAndRender({ showChapterPercent: !!v })} />
                          <Label htmlFor="showChapterPercent" className="text-[12px]">Chapter %</Label>
                        </div>
                      </div>
                    </div>

                    <Separator className="!my-1 opacity-50" />

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[11px] text-muted-foreground">Font Size</Label>
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.progressFontSize}px</span>
                      </div>
                      <Slider value={[s.progressFontSize]} min={10} max={20} step={1}
                        onValueChange={(v) => updateAndRender({ progressFontSize: sv(v) })}
                        onValueCommitted={flushRender} />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[11px] text-muted-foreground">Edge Margin</Label>
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.progressEdgeMargin}px</span>
                      </div>
                      <Slider value={[s.progressEdgeMargin]} min={0} max={30} step={1}
                        onValueChange={(v) => updateAndReformat({ progressEdgeMargin: sv(v) })}
                        onValueCommitted={flushReformat} />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[11px] text-muted-foreground">Side Margin</Label>
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{s.progressSideMargin}px</span>
                      </div>
                      <Slider value={[s.progressSideMargin]} min={0} max={30} step={1}
                        onValueChange={(v) => updateAndRender({ progressSideMargin: sv(v) })}
                        onValueCommitted={flushRender} />
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Chapters */}
            <AccordionItem value="chapters" className="border border-border/40 rounded-lg px-3 data-[state=open]:bg-muted/20">
              <AccordionTrigger className="py-2.5 text-[12px] font-medium text-foreground hover:no-underline gap-2">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  Chapters
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <ScrollArea className="h-[200px] rounded-md border border-border/40 bg-background/50">
                  {toc.length === 0 ? (
                    <div className="p-4 text-[12px] text-muted-foreground text-center">Load an EPUB file...</div>
                  ) : (
                    <ChapterList items={toc} depth={0} onSelect={(pg) => {
                      const ren = rendererRef.current; if (!ren) return
                      ren.goToPage(pg); renderPreview()
                    }} />
                  )}
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="h-3" />
          </TabsContent>
        </Tabs>

        {/* Export buttons pinned to bottom */}
        <div className="px-4 py-3 border-t border-border/50 space-y-2 bg-card/80">
          {showExport && (
            <div className="space-y-1.5 px-1">
              <Progress value={exportPct} className="h-2" />
              <p className="text-[11px] text-muted-foreground text-center">{exportMsg}</p>
            </div>
          )}
          <Button className="w-full h-8 text-[12px] font-medium" disabled={!bookLoaded || processing} onClick={() => handleExportXtc()}>
            {processing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            )}
            Export XTC
          </Button>
          {files.length > 1 && (
            <Button variant="secondary" className="w-full h-7 text-[11px]" disabled={processing} onClick={handleExportAll}>
              Export All ({files.length})
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center border-b border-border/50 px-4 py-2 gap-4">
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={!bookLoaded || page <= 0} onClick={prevPage}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={!bookLoaded || page >= pages - 1} onClick={nextPage}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </Button>
          </div>

          <span className="text-[12px] font-mono tabular-nums text-muted-foreground">
            {page + 1} / {pages}
          </span>

          {bookLoaded && meta.title && (
            <div className="flex-1 min-w-0 text-[12px] truncate">
              <span className="font-medium">{meta.title}</span>
              {meta.authors && <span className="text-muted-foreground ml-2">by {meta.authors}</span>}
            </div>
          )}

          <div className="flex items-center gap-1 ml-auto">
            {/* Device color toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setDeviceColor(prev => prev === "black" ? "white" : "black")}
              title={deviceColor === "black" ? "Space Black" : "Frost White"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" fill={deviceColor === "black" ? "#1a1a1e" : "#e8e5df"} />
                <rect x="8" y="5" width="8" height="12" rx="0.5" fill={deviceColor === "black" ? "#555" : "#faf9f7"} />
              </svg>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={!bookLoaded} onClick={() => renderPreview()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={toggleDarkMode}>
              {darkMode ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              )}
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden" style={{ background: "radial-gradient(ellipse at center, hsl(var(--muted)) 0%, hsl(var(--background)) 70%)" }}>
          {!bookLoaded && !loading && (
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Load an EPUB file to begin</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">Drag and drop or use the sidebar</p>
              {!wasmReady && (
                <div className="flex items-center justify-center gap-2 mt-3 text-[12px] text-muted-foreground/50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Loading engine...
                </div>
              )}
            </div>
          )}

          <div className={bookLoaded ? "flex flex-col items-center gap-20" : "hidden"}>
            {/* Device frame — realistic Xteink bezel mockup (true-to-life size) */}
            <div
              className="relative"
              style={{
                aspectRatio: `${totalW} / ${totalH}`,
                width: `min(${trueLifeW.toFixed(1)}px, calc(100vw - 420px), calc((100vh - 100px) * ${(totalW / totalH).toFixed(6)}))`,
                background: dc.body,
                borderRadius: `${((bz.bodyRadius / totalW) * 100).toFixed(2)}% / ${((bz.bodyRadius / totalH) * 100).toFixed(2)}%`,
                boxShadow: `${dc.shadow}, ${dc.highlight}`,
              }}
            >
              {/* Screen area */}
              <div
                className="absolute overflow-hidden"
                style={{
                  left: `${((bezelLeft / totalW) * 100).toFixed(4)}%`,
                  right: `${((bezelRight / totalW) * 100).toFixed(4)}%`,
                  top: `${((bezelTop / totalH) * 100).toFixed(4)}%`,
                  bottom: `${((bezelBottom / totalH) * 100).toFixed(4)}%`,
                  borderRadius: `${((bz.screenRadius / totalW) * 100).toFixed(2)}% / ${((bz.screenRadius / totalH) * 100).toFixed(2)}%`,
                  boxShadow: dc.screenBorder,
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={dims.screenWidth}
                  height={dims.screenHeight}
                  style={{ width: "100%", height: "100%", display: "block" }}
                />
              </div>

              {/* Power button (right side in portrait) */}
              {bz.sideButtons.map((btn, i) => {
                const screenOff = chinSide === "bottom" || chinSide === "top" ? bezelTop : bezelLeft
                const screenLen = chinSide === "bottom" || chinSide === "top" ? dims.screenHeight : dims.screenWidth
                const btnPos = screenOff + screenLen * btn.offsetPct
                const t = 8
                const pos: React.CSSProperties =
                  chinSide === "bottom" ? { right: `${(-t / totalW * 100).toFixed(2)}%`, top: `${(btnPos / totalH * 100).toFixed(2)}%`, width: `${(t / totalW * 100).toFixed(2)}%`, height: `${(btn.size / totalH * 100).toFixed(2)}%`, borderRadius: "0 3px 3px 0" }
                  : chinSide === "right" ? { bottom: `${(-t / totalH * 100).toFixed(2)}%`, left: `${(btnPos / totalW * 100).toFixed(2)}%`, height: `${(t / totalH * 100).toFixed(2)}%`, width: `${(btn.size / totalW * 100).toFixed(2)}%`, borderRadius: "0 0 3px 3px" }
                  : chinSide === "top" ? { left: `${(-t / totalW * 100).toFixed(2)}%`, bottom: `${(btnPos / totalH * 100).toFixed(2)}%`, width: `${(t / totalW * 100).toFixed(2)}%`, height: `${(btn.size / totalH * 100).toFixed(2)}%`, borderRadius: "3px 0 0 3px" }
                  : { top: `${(-t / totalH * 100).toFixed(2)}%`, right: `${(btnPos / totalW * 100).toFixed(2)}%`, height: `${(t / totalH * 100).toFixed(2)}%`, width: `${(btn.size / totalW * 100).toFixed(2)}%`, borderRadius: "3px 3px 0 0" }
                return (
                  <div key={i} className="absolute" style={{ ...pos, background: dc.button, boxShadow: `${dc.highlight}, 0 1px 3px rgba(0,0,0,0.2)` }} />
                )
              })}

              {/* Page-turn buttons on chin bezel */}
              {(() => {
                const cb = bz.chinButtons
                const isHoriz = chinSide === "bottom" || chinSide === "top"
                // Button width is relative to the chin's cross-axis (short side), not total device width
                const chinCrossLen = isHoriz ? totalW : totalH
                const btnW = chinCrossLen * cb.widthPct
                const totalBtnW = btnW * 2 + cb.gap
                const startX = (chinCrossLen - totalBtnW) / 2
                const chinStart = chinSide === "bottom" ? bezelTop + dims.screenHeight
                  : chinSide === "top" ? 0
                  : chinSide === "left" ? 0
                  : bezelLeft + dims.screenWidth
                const chinLen = bz.chin
                const btnCenterOffset = chinStart + (chinLen - cb.height) * 0.75

                return [-1, 1].map((side) => {
                  const btnX = startX + (side === -1 ? 0 : btnW + cb.gap)
                  const pos: React.CSSProperties = isHoriz
                    ? {
                        left: `${(btnX / totalW * 100).toFixed(2)}%`,
                        top: `${(btnCenterOffset / totalH * 100).toFixed(2)}%`,
                        width: `${(btnW / totalW * 100).toFixed(2)}%`,
                        height: `${(cb.height / totalH * 100).toFixed(2)}%`,
                      }
                    : {
                        top: `${(btnX / totalH * 100).toFixed(2)}%`,
                        left: `${(btnCenterOffset / totalW * 100).toFixed(2)}%`,
                        height: `${(btnW / totalH * 100).toFixed(2)}%`,
                        width: `${(cb.height / totalW * 100).toFixed(2)}%`,
                      }
                  return (
                    <div key={side} className="absolute" style={{
                      ...pos,
                      background: dc.slot,
                      borderRadius: "100px",
                      boxShadow: `inset 0 2px 3px rgba(0,0,0,0.15), 0 1px 0 ${deviceColor === "black" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)"}`,
                    }} />
                  )
                })
              })()}
            </div>

            {/* Page scrubber */}
            {pages > 1 && (
              <div className="flex items-center gap-3 px-1 w-full">
                <Slider
                  min={0}
                  max={pages - 1}
                  step={1}
                  value={[page]}
                  onValueChange={(val) => goToPage(Array.isArray(val) ? val[0] : val)}
                />
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                  {page + 1} / {pages}
                </span>
              </div>
            )}
          </div>

          {loading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="flex items-center gap-2.5 text-sm font-medium">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {loadingMsg || "Loading..."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Chapter List Component ──

function ChapterList({ items, depth, onSelect }: {
  items: TocItem[]; depth: number; onSelect: (page: number) => void
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${depth}-${i}`}>
          <div
            className="px-3 py-1.5 text-[12px] cursor-pointer hover:bg-accent/50 border-b border-border/20 truncate transition-colors"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => onSelect(item.page)}
          >
            {item.title}
          </div>
          {item.children && item.children.length > 0 && (
            <ChapterList items={item.children} depth={depth + 1} onSelect={onSelect} />
          )}
        </div>
      ))}
    </>
  )
}
