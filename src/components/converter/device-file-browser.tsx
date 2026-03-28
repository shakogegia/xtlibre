import React, { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogContent,
  AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Folder, FileText, BookOpen, Trash2, Loader2, ChevronRight, RefreshCw } from "lucide-react"

interface DeviceFile {
  name: string
  size: number
  isDirectory: boolean
  isEpub: boolean
}

interface DeviceFileBrowserProps {
  host: string
  port: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function joinPath(base: string, name: string): string {
  return base === "/" ? `/${name}` : `${base}/${name}`
}

export function DeviceFileBrowser({ host, port }: DeviceFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState("/")
  const [files, setFiles] = useState<DeviceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; path: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch("/api/device/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, path }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Request failed" }))
        throw new Error(data.error || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      const entries = Array.isArray(data) ? data : []
      // Sort: directories first, then alphabetical
      entries.sort((a: DeviceFile, b: DeviceFile) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setFiles(entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files")
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [host, port])

  useEffect(() => {
    if (host) loadFiles(currentPath)
  }, [host, port, currentPath, loadFiles])

  const navigateTo = useCallback((name: string) => {
    setCurrentPath(prev => joinPath(prev, name))
  }, [])

  const navigateUp = useCallback(() => {
    setCurrentPath(prev => {
      const idx = prev.lastIndexOf("/")
      return idx <= 0 ? "/" : prev.slice(0, idx)
    })
  }, [])

  const navigateToBreadcrumb = useCallback((index: number) => {
    if (index === 0) {
      setCurrentPath("/")
      return
    }
    const segments = currentPath.split("/").filter(Boolean)
    setCurrentPath("/" + segments.slice(0, index).join("/"))
  }, [currentPath])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const resp = await fetch("/api/device/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, path: deleteTarget.path }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Delete failed" }))
        throw new Error(data.error)
      }
      setDeleteTarget(null)
      loadFiles(currentPath)
    } catch {
      // Keep dialog open on error
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, host, port, currentPath, loadFiles])

  const breadcrumbs = ["/", ...currentPath.split("/").filter(Boolean)]

  return (
    <>
      {/* Separator */}
      <div className="flex items-center gap-2 mt-4">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Files</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 mt-2 mb-1 min-h-[20px] flex-wrap">
        {breadcrumbs.map((segment, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-0.5 rounded"
              onClick={() => navigateToBreadcrumb(i)}
            >
              {segment === "/" ? "root" : segment}
            </button>
          </React.Fragment>
        ))}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => loadFiles(currentPath)} title="Refresh">
          <RefreshCw className="w-2.5 h-2.5" />
        </Button>
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-[10px] text-destructive mb-2">{error}</p>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => loadFiles(currentPath)}>
            Retry
          </Button>
        </div>
      ) : files.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-[10px] text-muted-foreground">
            {currentPath === "/" ? "No files on device" : "Empty folder"}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {currentPath !== "/" && (
            <button
              className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-muted/50 text-left"
              onClick={navigateUp}
            >
              <Folder className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">..</span>
            </button>
          )}
          {files.map((file) => (
            <div
              key={file.name}
              className={`group/file flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 ${
                file.isDirectory ? "cursor-pointer" : ""
              }`}
              onClick={file.isDirectory ? () => navigateTo(file.name) : undefined}
            >
              {file.isDirectory ? (
                <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : file.isEpub ? (
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs truncate flex-1">{file.name}</span>
              {!file.isDirectory && (
                <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(file.size)}</span>
              )}
              {!file.isDirectory && (
                <Button
                  variant="ghost" size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover/file:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget({ name: file.name, path: joinPath(currentPath, file.name) }) }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2 className="w-5 h-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDesc>
              Delete <strong>{deleteTarget?.name}</strong> from the device? This cannot be undone.
            </AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
