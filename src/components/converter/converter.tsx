"use client"

import React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/converter/sidebar"
import { CalibreDialog } from "@/components/converter/calibre-dialog"
import { Toolbar } from "@/components/converter/toolbar"
import { DevicePreview } from "@/components/converter/device-preview"
import {
  FONT_FAMILIES, ARABIC_FONTS,
} from "@/lib/config"
import { getScreenDimensions } from "@/lib/device"
import {
  type WasmModule, type Renderer, type TocItem, type FileInfo, type BookMetadata,
  type Settings, type DeviceColor,
  PROGRESS_BAR_HEIGHT, PROGRESS_BAR_HEIGHT_FULLWIDTH,
  PROGRESS_BAR_HEIGHT_EXTENDED, STORAGE_KEY_DEVICE_COLOR,
  loadFromStorage,
} from "@/lib/types"
import { type CustomFont } from "@/lib/db"
import { saveSettings } from "@/app/actions"
import {
  type OpdsEntry, type OpdsFeed,
  fetchCalibreConfig, saveCalibreConfig, deleteCalibreConfig,
  fetchFeed, downloadEpub,
} from "@/lib/opds"
import { applyDitheringSyncToData, quantizeImageData, applyNegativeToData, generateXtgData, generateXthData } from "@/lib/image-processing"
import { uploadToDevice, DeviceError } from "@/lib/device-client"
import { toast } from "sonner"
import { getPatternForLang, drawProgressIndicator } from "@/lib/progress-bar"

export function Converter({
  initialTab, initialSettings, initialFonts, opdsUrl,
}: {
  initialTab: string; initialSettings: Settings; initialFonts: CustomFont[]; opdsUrl: string | null
}) {
  // Settings state (loaded server-side from DB, saved via server action on change)
  const [s, _setS] = useState<Settings>(initialSettings)
  const sRef = useRef<Settings>(initialSettings)
  const didMount = useRef(false)
  const setS = useCallback((updater: Settings | ((prev: Settings) => Settings)) => {
    _setS(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      sRef.current = next
      return next
    })
  }, [])

  // Persist settings via server action outside render to avoid updating Router during render
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    saveSettings(s)
  }, [s])

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
  const [dragOver, setDragOver] = useState(false)

  const [deviceColor, setDeviceColor] = useState<DeviceColor>("black")

  // OPDS state
  const [calibreConnected, setCalibreConnected] = useState(false)
  const [calibreConfig, setCalibreConfig] = useState<{ url: string; username: string } | null>(null)
  const [opdsSettingsOpen, setOpdsSettingsOpen] = useState(false)
  const [opdsFeed, setOpdsFeed] = useState<OpdsFeed | null>(null)
  const [opdsLoading, setOpdsLoading] = useState(false)
  const [opdsError, setOpdsError] = useState("")
  const [opdsSearch, setOpdsSearch] = useState("")
  const [opdsNavStack, setOpdsNavStack] = useState<string[]>([])
  const [opdsDownloading, setOpdsDownloading] = useState<Set<string>>(new Set())

  // Custom fonts state
  const [customFonts, setCustomFonts] = useState(initialFonts ?? [])
  const customFontsRef = useRef(initialFonts ?? [])
  useEffect(() => { customFontsRef.current = customFonts }, [customFonts])

  // Library state
  const [libraryBooks, setLibraryBooks] = useState<Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>>([])
  const [libraryLoading, setLibraryLoading] = useState(false)

  // Device transfer state
  const [transferring, setTransferring] = useState(false)
  const [transferProgress, setTransferProgress] = useState<{ sent: number; total: number; filename: string } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Hydrate client-only state from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const savedColor = loadFromStorage<DeviceColor | null>(STORAGE_KEY_DEVICE_COLOR, null)
    if (savedColor) setDeviceColor(savedColor)
    fetchCalibreConfig().then(config => {
      if (config) {
        setCalibreConnected(true)
        setCalibreConfig(config)
      }
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
    if (family) {
      const results = await Promise.all(family.variants.map(v => loadFontFromUrl(v.url, v.file)))
      if (results.some(r => r)) { loadedFontsRef.current.add(familyName); return true }
      return false
    }
    // Check custom fonts
    const custom = customFontsRef.current.find(f => f.name === familyName)
    if (custom) {
      const ok = await loadFontFromUrl(`/api/fonts/${custom.id}/file`, custom.filename)
      if (ok) { loadedFontsRef.current.add(familyName); return true }
    }
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

  const fetchLibraryBooks = useCallback(async () => {
    setLibraryLoading(true)
    try {
      const res = await fetch("/api/library")
      if (res.ok) {
        const books = await res.json()
        setLibraryBooks(books)
        return books as typeof libraryBooks
      }
    } catch (err) {
      console.error("Failed to fetch library:", err)
    } finally {
      setLibraryLoading(false)
    }
    return null
  }, [])

  useEffect(() => {
    fetchLibraryBooks()
  }, [fetchLibraryBooks])

  const saveEpubToLibrary = useCallback(async (file: File, bookMeta: BookMetadata): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", bookMeta.title || "Untitled")
      formData.append("author", bookMeta.authors || "Unknown")
      formData.append("original_epub_name", file.name)

      const res = await fetch("/api/library/epub", { method: "POST", body: formData })
      if (!res.ok) throw new Error("EPUB upload failed")
      const data = await res.json()
      fetchLibraryBooks()
      return data.id as string
    } catch (err) {
      console.error("Auto-save EPUB error:", err)
      return null
    }
  }, [fetchLibraryBooks])

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

      // Auto-save EPUB to library
      const currentFile = filesRef.current[fileIdxRef.current]
      if (currentFile && !currentFile.libraryBookId) {
        saveEpubToLibrary(file, newMeta).then(bookId => {
          if (bookId) {
            setFiles(prev => prev.map(f =>
              f === currentFile ? { ...f, libraryBookId: bookId } : f
            ))
            filesRef.current = filesRef.current.map(f =>
              f === currentFile ? { ...f, libraryBookId: bookId } : f
            )
          }
        })
      }
    } catch (err) {
      console.error("Error loading EPUB:", err)
    } finally {
      setLoading(false)
    }
  }, [applySettings, loadHyphenationPattern, saveEpubToLibrary])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const epubs = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith(".epub"))
    if (epubs.length === 0) return
    if (processingRef.current) { toast.warning("Please wait for XTC generation to finish"); return }
    const file = epubs[0]
    setFiles([{ file, name: file.name, loaded: false }])
    filesRef.current = [{ file, name: file.name, loaded: false }]
    setFileIdx(0)
    fileIdxRef.current = 0
    loadEpub(file)
  }, [loadEpub])

  // ── OPDS functions ──

  const opdsBrowse = useCallback(async (path?: string, append?: boolean) => {
    if (!calibreConnected) { setOpdsSettingsOpen(true); return }
    setOpdsLoading(true); setOpdsError("")
    try {
      const feed = await fetchFeed(path)
      if (append) {
        setOpdsFeed(prev => prev ? { ...feed, entries: [...prev.entries, ...feed.entries] } : feed)
      } else {
        setOpdsFeed(feed)
      }
      if (path && !append) {
        setOpdsNavStack(prev => [...prev, path])
      }
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Failed to connect")
    } finally {
      setOpdsLoading(false)
    }
  }, [calibreConnected])

  const opdsBack = useCallback(() => {
    if (opdsNavStack.length <= 1) {
      setOpdsNavStack([])
      opdsBrowse()
      return
    }
    const prev = [...opdsNavStack]
    prev.pop()
    const path = prev[prev.length - 1]
    setOpdsNavStack(prev)
    setOpdsLoading(true); setOpdsError("")
    fetchFeed(path)
      .then(feed => setOpdsFeed(feed))
      .catch(err => setOpdsError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setOpdsLoading(false))
  }, [opdsNavStack, opdsBrowse])

  const opdsDoSearch = useCallback(async () => {
    if (!opdsSearch.trim()) return
    if (!calibreConnected) return
    setOpdsLoading(true); setOpdsError("")
    try {
      const searchPath = `/opds/search?query=${encodeURIComponent(opdsSearch.trim())}`
      const feed = await fetchFeed(searchPath)
      setOpdsFeed(feed)
      setOpdsNavStack([searchPath])
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setOpdsLoading(false)
    }
  }, [opdsSearch, calibreConnected])

  const opdsImportBook = useCallback(async (entry: OpdsEntry) => {
    if (!entry.epubPath) return
    setOpdsDownloading(prev => new Set(prev).add(entry.id))
    try {
      const file = await downloadEpub(entry.epubPath)

      // Auto-save EPUB to library with OPDS metadata
      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", entry.title || "Untitled")
      formData.append("author", entry.authors?.join(", ") || "Unknown")
      formData.append("original_epub_name", file.name)

      // Fetch cover thumbnail from Calibre if available
      if (entry.thumbnailPath) {
        try {
          const coverRes = await fetch(`/api/calibre/download?path=${encodeURIComponent(entry.thumbnailPath)}`)
          if (coverRes.ok) {
            const coverBlob = await coverRes.blob()
            formData.append("cover", coverBlob, "cover.jpg")
          }
        } catch { /* cover is optional */ }
      }

      let bookId: string | null = null
      try {
        const res = await fetch("/api/library/epub", { method: "POST", body: formData })
        if (res.ok) {
          const data = await res.json()
          bookId = data.id
          fetchLibraryBooks()
        }
      } catch (err) {
        console.error("Auto-save Calibre EPUB error:", err)
      }

      addFiles([file])

      // Store library book ID on the file entry
      if (bookId) {
        setTimeout(() => {
          setFiles(prev => prev.map(f =>
            f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
          ))
          filesRef.current = filesRef.current.map(f =>
            f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
          )
        }, 100)
      }
    } catch (err) {
      console.error("Calibre download failed:", err)
      setOpdsError(`Failed to download "${entry.title}"`)
    } finally {
      setOpdsDownloading(prev => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }, [addFiles, fetchLibraryBooks])

  const opdsSaveSettings = useCallback(async (config: { url: string; username: string; password: string }) => {
    try {
      await saveCalibreConfig(config)
      setCalibreConnected(true)
      setCalibreConfig({ url: config.url, username: config.username })
      setOpdsSettingsOpen(false)
      setOpdsFeed(null)
      setOpdsNavStack([])
      setOpdsError("")
    } catch (err) {
      setOpdsError(err instanceof Error ? err.message : "Failed to save settings")
    }
  }, [])

  const opdsDisconnect = useCallback(async () => {
    await deleteCalibreConfig()
    setCalibreConnected(false)
    setCalibreConfig(null)
    setOpdsFeed(null)
    setOpdsNavStack([])
    setOpdsError("")
    setOpdsSearch("")
  }, [])

  const openLibraryEpub = useCallback(async (bookId: string, title: string) => {
    if (processingRef.current) { toast.warning("Please wait for XTC generation to finish"); return }
    try {
      const res = await fetch(`/api/library/${bookId}/epub`)
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Download failed: ${res.status} ${text}`)
      }
      const blob = await res.blob()
      const file = new File([blob], `${title}.epub`, { type: "application/epub+zip" })
      // Set libraryBookId before loading so loadEpub skips auto-save
      const fileInfo = { file, name: file.name, loaded: false, libraryBookId: bookId }
      setFiles([fileInfo])
      filesRef.current = [fileInfo]
      setFileIdx(0)
      fileIdxRef.current = 0
      loadEpub(file)
    } catch (err) {
      console.error("Failed to open library EPUB:", err)
    }
  }, [loadEpub])

  const deleteLibraryBook = useCallback(async (bookId: string) => {
    try {
      const res = await fetch(`/api/library/${bookId}`, { method: "DELETE" })
      if (res.ok) {
        setLibraryBooks(prev => prev.filter(b => b.id !== bookId))
      }
    } catch (err) {
      console.error("Failed to delete library book:", err)
    }
  }, [])

  const updateLibraryBook = useCallback(async (bookId: string, title: string, author: string | null) => {
    try {
      const res = await fetch(`/api/library/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author }),
      })
      if (res.ok) {
        setLibraryBooks(prev => prev.map(b => b.id === bookId ? { ...b, title, author } : b))
      }
    } catch (err) {
      console.error("Failed to update library book:", err)
    }
  }, [])

  const cancelTransfer = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setTransferring(false)
    setTransferProgress(null)
  }, [])

  const sendToDevice = useCallback(async (bookId: string) => {
    const settings = sRef.current
    if (!settings.deviceHost) {
      toast.error("No device configured. Go to the Device tab to set up your e-reader.")
      return
    }

    const book = libraryBooks.find(b => b.id === bookId)
    if (!book?.filename) return

    const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
    const nameBase = book.author ? `${book.author} - ${book.title}` : book.title
    const filename = nameBase.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 80) + ext
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
              const pct = Math.round((event.sent / event.total) * 100)
              toast.loading(`Sending "${book.title}" — ${pct}%`, { id: toastId })
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

        const resp = await fetch(`/api/library/${bookId}`)
        if (!resp.ok) throw new DeviceError("Failed to fetch file from server")
        const data = await resp.arrayBuffer()

        setTransferProgress({ sent: 0, total: data.byteLength, filename: book.title })

        await uploadToDevice({
          host: settings.deviceHost,
          port: settings.devicePort,
          uploadPath: settings.deviceUploadPath,
          filename,
          data,
          onProgress: (sent, total) => {
            setTransferProgress({ sent, total, filename: book.title })
            const pct = Math.round((sent / total) * 100)
            toast.loading(`Sending "${book.title}" — ${pct}%`, { id: toastId })
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

  const saveToLibrary = useCallback(async (xtcData: ArrayBuffer, bookMeta: BookMetadata, deviceType: string) => {
    const formData = new FormData()
    const ext = sRef.current.qualityMode === "hq" ? ".xtch" : ".xtc"
    const filename = (bookMeta.title || "book").replace(/[^a-zA-Z0-9\u0080-\uFFFF]/g, "_").substring(0, 50) + ext
    formData.append("file", new Blob([xtcData], { type: "application/octet-stream" }), filename)
    formData.append("title", bookMeta.title || "Untitled")
    formData.append("author", bookMeta.authors || "Unknown")
    formData.append("device_type", deviceType)
    formData.append("original_epub_name", filesRef.current[fileIdxRef.current]?.name || "")

    const currentFile = filesRef.current[fileIdxRef.current]
    if (currentFile?.libraryBookId) {
      formData.append("epub_book_id", currentFile.libraryBookId)
    }

    const res = await fetch("/api/library", { method: "POST", body: formData })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Upload failed: ${res.status} ${text}`)
    }
    return res.json()
  }, [])

  const handleGenerateXtc = useCallback(async () => {
    const ren = rendererRef.current, mod = moduleRef.current
    if (!ren || !mod || processingRef.current) return
    processingRef.current = true; setProcessing(true)

    const toastId = toast.loading("Preparing...", { duration: Infinity })
    const startTime = performance.now()
    const currentPage = ren.getCurrentPage()

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
        toast.loading(`Rendering page ${pg + 1} of ${pageCount}...`, { id: toastId })

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

      // Save XTC to library
      toast.loading("Saving to library...", { id: toastId })
      await saveToLibrary(buf, metaRef.current, settings.deviceType)
      const updatedBooks = await fetchLibraryBooks()

      // Restore preview to current page
      ren.goToPage(currentPage)
      renderPreview()

      const totalTime = ((performance.now() - startTime) / 1000).toFixed(1)
      const justSaved = updatedBooks?.[0]
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
    } catch (err) {
      console.error("Generate XTC error:", err)
      toast.error("Generation failed", { id: toastId, duration: 4000 })
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [saveToLibrary, fetchLibraryBooks, renderPreview, sendToDevice])

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

  // Custom font upload/delete via API
  const uploadCustomFont = useCallback(async (file: File) => {
    const form = new FormData()
    form.append("file", file)
    const resp = await fetch("/api/fonts", { method: "POST", body: form })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: "Upload failed" }))
      throw new Error(body.error || "Upload failed")
    }
    const font = await resp.json()
    setCustomFonts(prev => [...prev, font])
    return font as { id: string; name: string; filename: string }
  }, [])

  const deleteCustomFont = useCallback(async (id: string) => {
    const fontName = customFontsRef.current.find(f => f.id === id)?.name
    const resp = await fetch(`/api/fonts/${id}`, { method: "DELETE" })
    if (!resp.ok) throw new Error("Delete failed")
    setCustomFonts(prev => prev.filter(f => f.id !== id))
    // If the deleted font is currently selected, reset to default
    if (fontName && sRef.current.fontFace === fontName) {
      handleFontChange("Literata")
    }
  }, [handleFontChange])

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

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  const downloadXtc = useCallback((bookId: string) => {
    window.location.href = `/api/library/${bookId}`
  }, [])

  // ── Render ──

  const deviceConfigured = !!s.deviceHost

  const dims = getScreenDimensions(s.deviceType, s.orientation)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        initialTab={initialTab}
        opdsUrl={opdsUrl}
        fileInputRef={fileInputRef}
        addFiles={addFiles} dragOver={dragOver} setDragOver={setDragOver}
        s={s} meta={meta} toc={toc}
        update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
        flushReformat={flushReformat} flushRender={flushRender}
        handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
        handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
        customFonts={customFonts} uploadCustomFont={uploadCustomFont} deleteCustomFont={deleteCustomFont}
        renderPreview={renderPreview} rendererRef={rendererRef}
        calibreConnected={calibreConnected} opdsFeed={opdsFeed}
        opdsLoading={opdsLoading} opdsError={opdsError}
        opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
        opdsDownloading={opdsDownloading}
        setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
        setOpdsError={setOpdsError}
        opdsBrowse={opdsBrowse} opdsBack={opdsBack}
        opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
        activeBookId={files[0]?.libraryBookId ?? null}
        libraryBooks={libraryBooks} libraryLoading={libraryLoading}
        openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
        deleteLibraryBook={deleteLibraryBook}
        updateLibraryBook={updateLibraryBook}
        sendToDevice={sendToDevice}
        deviceConfigured={deviceConfigured}
        transferring={transferring}
        transferProgress={transferProgress}
        cancelTransfer={cancelTransfer}
      />

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <Toolbar
          bookLoaded={bookLoaded} page={page} pages={pages} meta={meta}
          prevPage={prevPage} nextPage={nextPage}
          deviceColor={deviceColor} setDeviceColor={setDeviceColor}
          renderPreview={renderPreview}
        />

        {/* Preview */}
        <DevicePreview
          canvasRef={canvasRef} s={s} deviceColor={deviceColor}
          bookLoaded={bookLoaded} loading={loading} loadingMsg={loadingMsg} wasmReady={wasmReady}
          page={page} pages={pages} goToPage={goToPage}
          processing={processing} handleGenerateXtc={handleGenerateXtc}
        />
      </div>

      <CalibreDialog
        open={opdsSettingsOpen} onOpenChange={setOpdsSettingsOpen}
        calibreConnected={calibreConnected} calibreConfig={calibreConfig}
        opdsSaveSettings={opdsSaveSettings} opdsDisconnect={opdsDisconnect}
      />
    </div>
  )
}
