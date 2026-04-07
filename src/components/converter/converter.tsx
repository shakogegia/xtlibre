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
import { applyDitheringSyncToData, quantizeImageData, applyNegativeToData } from "@/lib/image-processing"
import { uploadToDevice, DeviceError } from "@/lib/device-client"
import { DeviceProvider } from "@/contexts/device-context"
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

  // Conversion job tracking per book
  const [activeJobs, setActiveJobs] = useState<Map<string, { status: string; progress: number; totalPages: number }>>(new Map())

  // UI state
  const [wasmReady, setWasmReady] = useState(false)
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
      // Inject a cover page into the EPUB if it doesn't already have one,
      // so the Xteink device always shows the cover as the first page.
      let epubFile = file
      try {
        const form = new FormData()
        form.append("file", file)
        const coverRes = await fetch("/api/epub/ensure-cover", { method: "POST", body: form })
        if (coverRes.ok && coverRes.status === 200) {
          const blob = await coverRes.blob()
          epubFile = new File([blob], file.name, { type: file.type })
        }
      } catch { /* use original file if cover injection fails */ }

      const data = new Uint8Array(await epubFile.arrayBuffer())
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
    toast.dismiss()
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
    const nameBase = book.author ? `${book.title} - ${book.author}` : book.title
    const filename = nameBase.replace(/[^a-zA-Z0-9 ._-]/g, "_").substring(0, 80).trim() + ext
    const toastId = `send-${bookId}`

    setTransferring(true)
    setTransferProgress({ sent: 0, total: 0, filename: book.title })
    toast.loading(`Sending "${book.title}" to device...`, { id: toastId })

    try {
      if (settings.deviceTransferMode === "relay") {
        // Relay mode: server streams to device, progress via SSE
        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const resp = await fetch("/api/device/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookId,
            host: settings.deviceHost,
            port: settings.devicePort,
            uploadPath: settings.deviceUploadPath,
          }),
          signal: abortController.signal,
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
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.dismiss(toastId)
        return
      }
      const message = err instanceof DeviceError ? err.message : "Transfer failed"
      toast.error(message, { id: toastId, duration: 4000 })
    } finally {
      setTransferring(false)
      setTransferProgress(null)
      abortControllerRef.current = null
    }
  }, [libraryBooks])

  const handleGenerateXtc = useCallback(async () => {
    const currentFile = filesRef.current[fileIdxRef.current]
    const bookId = currentFile?.libraryBookId
    if (!bookId) {
      toast.error("EPUB not saved to library yet. Please wait and try again.")
      return
    }

    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(err.error || "Failed to submit job")
      }
      const { job_id } = await res.json()
      const bookTitle = metaRef.current.title || currentFile?.name || "Book"
      sessionStorage.setItem("xtc-active-job", JSON.stringify({ jobId: job_id, bookId, bookTitle }))

      // Track this book as having an active job
      setActiveJobs(prev => new Map(prev).set(bookId, { status: "pending", progress: 0, totalPages: 0 }))

      // Poll in background — don't block the UI
      const pollStart = Date.now()
      const MAX_POLL_MS = 30 * 60 * 1000 // 30 minutes

      const poll = async (): Promise<void> => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          sessionStorage.removeItem("xtc-active-job")
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          toast.error("Conversion timed out — worker may not be running")
          return
        }
        const statusRes = await fetch(`/api/convert/${job_id}`)
        if (!statusRes.ok) {
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          toast.error("Failed to check job status")
          return
        }
        const status = await statusRes.json()

        if (status.status === "completed") {
          sessionStorage.removeItem("xtc-active-job")
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          const updatedBooks = await fetchLibraryBooks()
          const justSaved = updatedBooks?.[0]
          if (justSaved?.filename && sRef.current.deviceHost) {
            toast.success(`"${bookTitle}" ready — ${status.totalPages} pages`, {
              duration: 8000,
              action: {
                label: "Send to device",
                onClick: () => sendToDevice(justSaved.id),
              },
            })
          } else {
            toast.success(`"${bookTitle}" ready — ${status.totalPages} pages`)
          }
          return
        }

        if (status.status === "failed") {
          sessionStorage.removeItem("xtc-active-job")
          setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
          toast.error(status.error || "Conversion failed")
          return
        }

        // Update job tracking for button/progress bar state
        setActiveJobs(prev => new Map(prev).set(bookId, {
          status: status.status,
          progress: status.progress,
          totalPages: status.totalPages,
        }))

        await new Promise(r => setTimeout(r, 500))
        return poll()
      }

      poll()
    } catch (err) {
      console.error("Generate XTC error:", err)
      toast.error(err instanceof Error ? err.message : "Generation failed")
    }
  }, [fetchLibraryBooks, sendToDevice])

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

  // Resume polling for any active conversion jobs on mount
  useEffect(() => {
    let cancelled = false
    async function checkActiveJobs() {
      try {
        const raw = sessionStorage.getItem("xtc-active-job")
        if (!raw) return
        let jobId: string, bookId: string, bookTitle: string
        try {
          const parsed = JSON.parse(raw)
          jobId = parsed.jobId; bookId = parsed.bookId; bookTitle = parsed.bookTitle || "Book"
        } catch {
          // Legacy format (plain job ID string) — can't resume without bookId
          sessionStorage.removeItem("xtc-active-job")
          return
        }
        if (!jobId || !bookId) { sessionStorage.removeItem("xtc-active-job"); return }

        const res = await fetch(`/api/convert/${jobId}`)
        if (!res.ok) { sessionStorage.removeItem("xtc-active-job"); return }
        const status = await res.json()

        if (status.status === "pending" || status.status === "processing") {
          setActiveJobs(prev => new Map(prev).set(bookId, { status: status.status, progress: status.progress, totalPages: status.totalPages }))

          const pollStart = Date.now()
          const MAX_POLL_MS = 30 * 60 * 1000

          const poll = async (): Promise<void> => {
            if (cancelled) return
            if (Date.now() - pollStart > MAX_POLL_MS) {
              sessionStorage.removeItem("xtc-active-job")
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              toast.error("Conversion timed out — worker may not be running")
              return
            }
            const statusRes = await fetch(`/api/convert/${jobId}`)
            if (!statusRes.ok) {
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              return
            }
            const s = await statusRes.json()

            if (s.status === "completed") {
              sessionStorage.removeItem("xtc-active-job")
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              await fetchLibraryBooks()
              toast.success(`"${bookTitle}" ready — ${s.totalPages} pages`)
              return
            }
            if (s.status === "failed") {
              sessionStorage.removeItem("xtc-active-job")
              setActiveJobs(prev => { const m = new Map(prev); m.delete(bookId); return m })
              toast.error(s.error || "Conversion failed")
              return
            }

            setActiveJobs(prev => new Map(prev).set(bookId, { status: s.status, progress: s.progress, totalPages: s.totalPages }))
            await new Promise(r => setTimeout(r, 500))
            return poll()
          }

          poll()
        } else {
          sessionStorage.removeItem("xtc-active-job")
        }
      } catch { /* ignore */ }
    }
    checkActiveJobs()
    return () => { cancelled = true }
  }, [fetchLibraryBooks])

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
    <DeviceProvider settings={s} updateSettings={update}>
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
        activeJobs={activeJobs}
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
          handleGenerateXtc={handleGenerateXtc}
          jobStatus={activeJobs.get(filesRef.current[fileIdxRef.current]?.libraryBookId ?? "") ?? null}
        />
      </div>

      <CalibreDialog
        open={opdsSettingsOpen} onOpenChange={setOpdsSettingsOpen}
        calibreConnected={calibreConnected} calibreConfig={calibreConfig}
        opdsSaveSettings={opdsSaveSettings} opdsDisconnect={opdsDisconnect}
      />
    </div>
    </DeviceProvider>
  )
}
