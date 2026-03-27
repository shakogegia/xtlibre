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
import { saveSettings } from "@/app/actions"
import {
  type OpdsEntry, type OpdsFeed,
  fetchCalibreConfig, saveCalibreConfig, deleteCalibreConfig,
  fetchFeed, downloadEpub,
} from "@/lib/opds"
import { applyDitheringSyncToData, quantizeImageData, applyNegativeToData, generateXtgData, generateXthData, downloadFile } from "@/lib/image-processing"
import { getPatternForLang, drawProgressIndicator } from "@/lib/progress-bar"

export function Converter({ initialTab, initialSettings }: { initialTab: string; initialSettings: Settings }) {
  // Settings state (loaded server-side from DB, saved via server action on change)
  const [s, _setS] = useState<Settings>(initialSettings)
  const sRef = useRef<Settings>(initialSettings)
  const setS = useCallback((updater: Settings | ((prev: Settings) => Settings)) => {
    _setS(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      sRef.current = next
      saveSettings(next)
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

  const [deviceColor, setDeviceColor] = useState<DeviceColor>("black")

  // OPDS state
  const [calibreConnected, setCalibreConnected] = useState(false)
  const [opdsSettingsOpen, setOpdsSettingsOpen] = useState(false)
  const [opdsFeed, setOpdsFeed] = useState<OpdsFeed | null>(null)
  const [opdsLoading, setOpdsLoading] = useState(false)
  const [opdsError, setOpdsError] = useState("")
  const [opdsSearch, setOpdsSearch] = useState("")
  const [opdsNavStack, setOpdsNavStack] = useState<string[]>([])
  const [opdsDownloading, setOpdsDownloading] = useState<Set<string>>(new Set())

  // Library state
  const [libraryBooks, setLibraryBooks] = useState<Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>>([])
  const [libraryLoading, setLibraryLoading] = useState(false)

  // Hydrate client-only state from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const savedColor = loadFromStorage<DeviceColor | null>(STORAGE_KEY_DEVICE_COLOR, null)
    if (savedColor) setDeviceColor(savedColor)
    fetchCalibreConfig().then(config => {
      if (config) setCalibreConnected(true)
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

  const fetchLibraryBooks = useCallback(async () => {
    setLibraryLoading(true)
    try {
      const res = await fetch("/api/library")
      if (res.ok) {
        const books = await res.json()
        setLibraryBooks(books)
      }
    } catch (err) {
      console.error("Failed to fetch library:", err)
    } finally {
      setLibraryLoading(false)
    }
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

      // Capture cover thumbnail from the canvas
      const canvas = canvasRef.current
      if (canvas) {
        const scale = Math.min(200 / canvas.width, 300 / canvas.height)
        const thumbCanvas = document.createElement("canvas")
        thumbCanvas.width = Math.round(canvas.width * scale)
        thumbCanvas.height = Math.round(canvas.height * scale)
        const ctx = thumbCanvas.getContext("2d")!
        ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
        const blob = await new Promise<Blob | null>(r => thumbCanvas.toBlob(r, "image/jpeg", 0.7))
        if (blob) formData.append("cover", blob, "cover.jpg")
      }

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

  // ── OPDS functions ──

  const opdsBrowse = useCallback(async (path?: string) => {
    if (!calibreConnected) { setOpdsSettingsOpen(true); return }
    setOpdsLoading(true); setOpdsError("")
    try {
      const feed = await fetchFeed(path)
      setOpdsFeed(feed)
      if (path) {
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
  }, [addFiles])

  const opdsSaveSettings = useCallback(async (config: { url: string; username: string; password: string }) => {
    try {
      await saveCalibreConfig(config)
      setCalibreConnected(true)
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
    setOpdsFeed(null)
    setOpdsNavStack([])
    setOpdsError("")
    setOpdsSearch("")
  }, [])

  const openLibraryEpub = useCallback(async (bookId: string, title: string) => {
    try {
      const res = await fetch(`/api/library/${bookId}/epub`)
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const file = new File([blob], `${title}.epub`, { type: "application/epub+zip" })
      addFiles([file])
      // Set the library book ID so XTC export links correctly
      setTimeout(() => {
        setFiles(prev => prev.map(f =>
          f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
        ))
        filesRef.current = filesRef.current.map(f =>
          f.name === file.name && f.file.size === file.size ? { ...f, libraryBookId: bookId } : f
        )
      }, 100)
    } catch (err) {
      console.error("Failed to open library EPUB:", err)
    }
  }, [addFiles])

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

  const handleExportXtc = useCallback(async (internal?: boolean, returnBuffer?: boolean): Promise<ArrayBuffer | void> => {
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
      if (returnBuffer) return buf
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

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

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

    // Capture cover thumbnail from the canvas (scaled down to max 200px wide)
    const canvas = canvasRef.current
    if (canvas) {
      const scale = Math.min(200 / canvas.width, 300 / canvas.height)
      const thumbCanvas = document.createElement("canvas")
      thumbCanvas.width = Math.round(canvas.width * scale)
      thumbCanvas.height = Math.round(canvas.height * scale)
      const ctx = thumbCanvas.getContext("2d")!
      ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
      const blob = await new Promise<Blob | null>(r => thumbCanvas.toBlob(r, "image/jpeg", 0.7))
      if (blob) formData.append("cover", blob, "cover.jpg")
    }

    const res = await fetch("/api/library", { method: "POST", body: formData })
    if (!res.ok) throw new Error("Upload failed")
    return res.json()
  }, [])

  const handleSaveToLibrary = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true; setProcessing(true); setShowExport(true); setSaving(true)
    try {
      const buf = await handleExportXtc(true, true)
      if (!buf) throw new Error("Export returned no data")
      setExportMsg("Saving to library...")
      await saveToLibrary(buf as ArrayBuffer, metaRef.current, sRef.current.deviceType)
      setSaveMsg("Saved!")
      setExportMsg("Saved to library!")
      fetchLibraryBooks()
      setExportPct(100)
      setTimeout(() => { setShowExport(false); setSaveMsg(""); setSaving(false) }, 2000)
    } catch (err) {
      console.error("Save to library error:", err)
      setExportMsg("Save failed!")
      setTimeout(() => { setShowExport(false); setSaving(false) }, 2000)
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [handleExportXtc, saveToLibrary, fetchLibraryBooks])

  const handleSaveAllToLibrary = useCallback(async () => {
    if (filesRef.current.length === 0 || processingRef.current) return
    processingRef.current = true; setProcessing(true); setShowExport(true); setSaving(true)
    const totalFiles = filesRef.current.length
    try {
      for (let fi = 0; fi < totalFiles; fi++) {
        setExportMsg(<>Processing file <span className="font-mono">{fi + 1}</span>/<span className="font-mono">{totalFiles}</span>...</>)
        setExportPct((fi / totalFiles) * 100)
        await loadEpub(filesRef.current[fi].file)
        setFileIdx(fi); fileIdxRef.current = fi
        const buf = await handleExportXtc(true, true)
        if (buf) {
          await saveToLibrary(buf as ArrayBuffer, metaRef.current, sRef.current.deviceType)
        }
      }
      fetchLibraryBooks()
      setExportMsg(<>All <span className="font-mono">{totalFiles}</span> files saved to library!</>)
      setExportPct(100)
      setTimeout(() => { setShowExport(false); setSaveMsg(""); setSaving(false) }, 3000)
    } catch (err) {
      console.error("Save all error:", err)
      setExportMsg("Save failed!")
      setTimeout(() => { setShowExport(false); setSaving(false) }, 2000)
    } finally {
      processingRef.current = false; setProcessing(false)
    }
  }, [loadEpub, handleExportXtc, saveToLibrary, fetchLibraryBooks])

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

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Render ──

  const dims = getScreenDimensions(s.deviceType, s.orientation)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        initialTab={initialTab}
        files={files} fileIdx={fileIdx} fileInputRef={fileInputRef}
        addFiles={addFiles} switchToFile={switchToFile} removeFile={removeFile}
        dragOver={dragOver} setDragOver={setDragOver}
        setFiles={setFiles} filesRef={filesRef} setBookLoaded={setBookLoaded}
        s={s} meta={meta} toc={toc} customFontName={customFontName}
        update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
        flushReformat={flushReformat} flushRender={flushRender}
        handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
        handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
        handleCustomFont={handleCustomFont} fontInputRef={fontInputRef}
        renderPreview={renderPreview} rendererRef={rendererRef}
        calibreConnected={calibreConnected} opdsFeed={opdsFeed}
        opdsLoading={opdsLoading} opdsError={opdsError}
        opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
        opdsDownloading={opdsDownloading}
        setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
        setOpdsError={setOpdsError}
        opdsBrowse={opdsBrowse} opdsBack={opdsBack}
        opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
        libraryBooks={libraryBooks} libraryLoading={libraryLoading}
        openLibraryEpub={openLibraryEpub} deleteLibraryBook={deleteLibraryBook}
        bookLoaded={bookLoaded} processing={processing}
        showExport={showExport} exportPct={exportPct} exportMsg={exportMsg}
        saving={saving} saveMsg={saveMsg}
        handleExportXtc={() => handleExportXtc()} handleExportAll={handleExportAll}
        handleSaveToLibrary={handleSaveToLibrary} handleSaveAllToLibrary={handleSaveAllToLibrary}
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
        />
      </div>

      <CalibreDialog
        open={opdsSettingsOpen} onOpenChange={setOpdsSettingsOpen}
        calibreConnected={calibreConnected}
        opdsSaveSettings={opdsSaveSettings} opdsDisconnect={opdsDisconnect}
      />
    </div>
  )
}
