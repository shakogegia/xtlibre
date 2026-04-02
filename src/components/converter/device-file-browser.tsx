import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogContent,
  AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Folder, FolderPlus, FolderInput, Pencil, FileText, BookOpen, Trash2, Upload, Ellipsis, ChevronRight, RefreshCw, Check, X } from "lucide-react"
import { getDeviceOps, type DeviceFile } from "@/lib/device-ops"

interface DeviceFileBrowserProps {
  host: string
  port: number
  transferMode: "direct" | "relay"
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function joinPath(base: string, name: string): string {
  return base === "/" ? `/${name}` : `${base}/${name}`
}

export function DeviceFileBrowser({ host, port, transferMode }: DeviceFileBrowserProps) {
  const ops = useMemo(() => getDeviceOps(transferMode), [transferMode])
  const [currentPath, setCurrentPath] = useState("/")
  const [files, setFiles] = useState<DeviceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; path: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [creatingInProgress, setCreatingInProgress] = useState(false)
  const newFolderInputRef = React.useRef<HTMLInputElement>(null)
  const [renameTarget, setRenameTarget] = useState<{ name: string; path: string } | null>(null)
  const [renameName, setRenameName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const renameInputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [moveTarget, setMoveTarget] = useState<{ name: string; path: string } | null>(null)
  const [moveDest, setMoveDest] = useState("/")
  const [moveFolders, setMoveFolders] = useState<DeviceFile[]>([])
  const [moveLoading, setMoveLoading] = useState(false)
  const [moving, setMoving] = useState(false)

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const entries = await ops.listFiles(host, path)
      entries.sort((a, b) => {
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
  }, [host, ops])

  useEffect(() => {
    if (host) loadFiles(currentPath)
  }, [host, currentPath, loadFiles])

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
      await ops.deleteFile(host, deleteTarget.path)
      setDeleteTarget(null)
      loadFiles(currentPath)
    } catch {
      // Keep dialog open on error
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, host, ops, currentPath, loadFiles])

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingInProgress(true)
    try {
      await ops.mkdir(host, currentPath, name)
      setCreatingFolder(false)
      setNewFolderName("")
      loadFiles(currentPath)
    } catch {
      // Keep input visible on error
    } finally {
      setCreatingInProgress(false)
    }
  }, [newFolderName, host, ops, currentPath, loadFiles])

  const cancelCreateFolder = useCallback(() => {
    setCreatingFolder(false)
    setNewFolderName("")
  }, [])

  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus()
    }
  }, [creatingFolder])

  const openRename = useCallback((name: string, path: string) => {
    setRenameTarget({ name, path })
    setRenameName(name)
  }, [])

  const handleRename = useCallback(async () => {
    if (!renameTarget) return
    const name = renameName.trim()
    if (!name || name === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    setRenaming(true)
    try {
      await ops.rename(host, renameTarget.path, name)
      setRenameTarget(null)
      loadFiles(currentPath)
    } catch {
      // Keep input visible on error
    } finally {
      setRenaming(false)
    }
  }, [renameTarget, renameName, host, ops, currentPath, loadFiles])

  useEffect(() => {
    if (renameTarget && renameInputRef.current) {
      renameInputRef.current.focus()
      // Select filename without extension
      const dotIdx = renameTarget.name.lastIndexOf(".")
      renameInputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : renameTarget.name.length)
    }
  }, [renameTarget])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadProgress(0)
    try {
      await ops.upload(host, currentPath, file, (pct) => setUploadProgress(pct))
      loadFiles(currentPath)
    } catch {
      // error handled silently
    } finally {
      setUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [host, ops, currentPath, loadFiles])

  const loadMoveFolders = useCallback(async (path: string) => {
    setMoveLoading(true)
    try {
      const data = await ops.listFiles(host, path)
      const dirs = data.filter((f) => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
      setMoveFolders(dirs)
    } catch {
      setMoveFolders([])
    } finally {
      setMoveLoading(false)
    }
  }, [host, ops])

  const openMoveDialog = useCallback((name: string, path: string) => {
    setMoveTarget({ name, path })
    // Start browsing from the file's parent directory
    const parentPath = path.substring(0, path.lastIndexOf("/")) || "/"
    setMoveDest(parentPath)
    loadMoveFolders(parentPath)
  }, [loadMoveFolders])

  const navigateMoveDest = useCallback((folder: string) => {
    const newDest = moveDest === "/" ? `/${folder}` : `${moveDest}/${folder}`
    setMoveDest(newDest)
    loadMoveFolders(newDest)
  }, [moveDest, loadMoveFolders])

  const navigateMoveUp = useCallback(() => {
    const idx = moveDest.lastIndexOf("/")
    const parent = idx <= 0 ? "/" : moveDest.slice(0, idx)
    setMoveDest(parent)
    loadMoveFolders(parent)
  }, [moveDest, loadMoveFolders])

  const handleMove = useCallback(async () => {
    if (!moveTarget) return
    setMoving(true)
    try {
      await ops.move(host, moveTarget.path, moveDest)
      setMoveTarget(null)
      loadFiles(currentPath)
    } catch {
      // Keep dialog open on error
    } finally {
      setMoving(false)
    }
  }, [moveTarget, host, ops, moveDest, currentPath, loadFiles])

  const moveDestBreadcrumbs = ["/", ...moveDest.split("/").filter(Boolean)]

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
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={
              <Button
                variant="ghost" size="sm" className="h-5 w-5 p-0"
                onClick={() => { if (!uploading) fileInputRef.current?.click() }}
              />
            }>
              {uploading ? (
                <Spinner className="w-2.5 h-2.5" />
              ) : (
                <Upload className="w-2.5 h-2.5" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {uploading ? `Uploading ${uploadProgress}%` : "Upload file"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setCreatingFolder(true)} title="New folder">
          <FolderPlus className="w-2.5 h-2.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => loadFiles(currentPath)} title="Refresh">
          <RefreshCw className="w-2.5 h-2.5" />
        </Button>
      </div>

      {/* File list */}
      {loading ? (
        <div className="space-y-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1">
              <Skeleton className="w-3.5 h-3.5 rounded-sm shrink-0" />
              <Skeleton className="h-3 flex-1" style={{ maxWidth: `${60 + Math.random() * 30}%` }} />
              <Skeleton className="h-2.5 w-10 shrink-0" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-[10px] text-destructive mb-2">{error}</p>
          {transferMode === "direct" && (
            <p className="text-[10px] text-muted-foreground mb-2">
              File browsing requires the server to reach the device. Switch to Relay mode or use the server on the same network.
            </p>
          )}
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
          {creatingFolder && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Input
                ref={newFolderInputRef}
                className="h-5 text-xs px-1 py-0 flex-1"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder()
                  if (e.key === "Escape") cancelCreateFolder()
                }}
                disabled={creatingInProgress}
              />
              <Button
                variant="ghost" size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
                onClick={handleCreateFolder}
                disabled={creatingInProgress || !newFolderName.trim()}
              >
                <Check className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
                onClick={cancelCreateFolder}
                disabled={creatingInProgress}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
          {files.map((file) => {
            const filePath = joinPath(currentPath, file.name)
            const isRenaming = renameTarget?.path === filePath
            return (
              <div
                key={file.name}
                className={`group/file flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 ${
                  file.isDirectory ? "cursor-pointer" : ""
                }`}
                onClick={file.isDirectory && !isRenaming ? () => navigateTo(file.name) : undefined}
              >
                {file.isDirectory ? (
                  <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : file.isEpub ? (
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                {isRenaming ? (
                  <>
                    <Input
                      ref={renameInputRef}
                      className="h-5 text-xs px-1 py-0 flex-1"
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename()
                        if (e.key === "Escape") setRenameTarget(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      disabled={renaming}
                    />
                    <Button
                      variant="ghost" size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleRename() }}
                      disabled={renaming || !renameName.trim()}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => { e.stopPropagation(); setRenameTarget(null) }}
                      disabled={renaming}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs truncate flex-1">{file.name}</span>
                    {!file.isDirectory && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(file.size)}</span>
                    )}
                    {!file.isDirectory && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost" size="sm"
                              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          }
                        >
                          <Ellipsis className="w-3 h-3" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom" className="w-auto min-w-[140px]">
                          <DropdownMenuItem className="text-sm" onClick={() => openRename(file.name, filePath)}>
                            <Pencil className="size-3.5" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-sm" onClick={() => openMoveDialog(file.name, filePath)}>
                            <FolderInput className="size-3.5" />
                            Move to folder
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-sm" variant="destructive" onClick={() => setDeleteTarget({ name: file.name, path: filePath })}>
                            <Trash2 className="size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </div>
            )
          })}
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
      {/* Move dialog */}
      <AlertDialog open={!!moveTarget} onOpenChange={(open) => { if (!open) setMoveTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
              <FolderInput className="w-5 h-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Move file</AlertDialogTitle>
            <AlertDialogDesc>
              Move <strong>{moveTarget?.name}</strong> to:
            </AlertDialogDesc>
          </AlertDialogHeader>

          {/* Destination breadcrumb */}
          <div className="flex items-center gap-0.5 min-h-[20px] flex-wrap px-1">
            {moveDestBreadcrumbs.map((segment, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-0.5 rounded"
                  onClick={() => {
                    const newPath = i === 0 ? "/" : "/" + moveDest.split("/").filter(Boolean).slice(0, i).join("/")
                    setMoveDest(newPath)
                    loadMoveFolders(newPath)
                  }}
                >
                  {segment === "/" ? "root" : segment}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Folder list */}
          <div className="border rounded-md max-h-[200px] overflow-y-auto">
            {moveLoading ? (
              <div className="space-y-1 p-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="w-3.5 h-3.5 rounded-sm shrink-0" />
                    <Skeleton className="h-3 flex-1" style={{ maxWidth: `${50 + Math.random() * 30}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5 p-1">
                {moveDest !== "/" && (
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-muted/50 text-left"
                    onClick={navigateMoveUp}
                  >
                    <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">..</span>
                  </button>
                )}
                {moveFolders.length === 0 && moveDest === "/" && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">No folders</p>
                )}
                {moveFolders.map((folder) => (
                  <button
                    key={folder.name}
                    className="flex items-center gap-2 w-full px-2 py-1 rounded-md hover:bg-muted/50 text-left"
                    onClick={() => navigateMoveDest(folder.name)}
                  >
                    <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" onClick={() => setMoveTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={moving} onClick={handleMove}>
              {moving ? "Moving..." : "Move here"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
