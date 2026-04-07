import React, { useState, useMemo } from "react"
import { Smartphone, Pencil, Download, Trash2, Ellipsis, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface LibraryBook {
  id: string
  title: string
  author: string | null
  filename: string | null
  file_size: number | null
  created_at: string
  device_type: string | null
  epub_filename: string | null
}

interface LibraryTabProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void
  opdsUrl: string | null
  activeBookId: string | null
  libraryBooks: LibraryBook[]
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  downloadXtc: (bookId: string) => void
  deleteLibraryBook: (bookId: string) => void
  updateLibraryBook: (bookId: string, title: string, author: string | null) => void
  sendToDevice: (bookId: string) => void
  deviceConfigured: boolean
  transferring: boolean
  deviceFileNames: Set<string>
}

export function LibraryTab({
  fileInputRef, addFiles,
  dragOver, setDragOver,
  opdsUrl, activeBookId, libraryBooks, libraryLoading, openLibraryEpub, downloadXtc, deleteLibraryBook, updateLibraryBook,
  sendToDevice, deviceConfigured, transferring, deviceFileNames,
}: LibraryTabProps) {
  const [opdsAlertDismissed, setOpdsAlertDismissed] = useState(false)
  const [editBook, setEditBook] = useState<{ id: string; title: string; author: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<LibraryBook | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return libraryBooks
    const q = searchQuery.toLowerCase()
    return libraryBooks.filter(b =>
      b.title.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q)
    )
  }, [libraryBooks, searchQuery])

  const isOnDevice = (book: LibraryBook): boolean => {
    if (!book.filename || deviceFileNames.size === 0) return false
    const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
    const nameBase = book.author ? `${book.title} - ${book.author}` : book.title
    const sanitized = nameBase.replace(/[^a-zA-Z0-9 ._-]/g, "_").substring(0, 80).trim() + ext
    return deviceFileNames.has(sanitized)
  }
  return (
    <>
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

      {/* Separator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saved</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* OPDS info */}
      {opdsUrl && !opdsAlertDismissed && (
        <Alert className="mb-3 text-[11px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
          <AlertTitle className="text-[11px]">OPDS Feed</AlertTitle>
          <AlertDescription className="text-[10px]">
            <p>Add this URL to your XTEInk e-reader to sync generated XTC files:</p>
            <div className="mt-1.5 flex items-center rounded-md border border-input bg-muted/50 overflow-hidden">
              <div className="flex items-center justify-center px-2 text-muted-foreground">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </div>
              <input
                readOnly
                value={opdsUrl}
                className="flex-1 bg-transparent py-1 pr-2 text-[10px] text-foreground outline-none select-all cursor-text"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          </AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setOpdsAlertDismissed(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </Button>
          </AlertAction>
        </Alert>
      )}

      {/* Search */}
      {libraryBooks.length > 0 && (
        <div className="relative mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7"
          />
        </div>
      )}

      {/* Library books */}
      {libraryLoading ? (
        <div className="space-y-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <Skeleton className="w-8 h-11 rounded-sm shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : libraryBooks.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-[12px] text-muted-foreground">No saved books yet</p>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-[12px] text-muted-foreground">No matches</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-1 pb-3">
            {filteredBooks.map(book => (
              <div key={book.id} className={`group/lib flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                book.id === activeBookId ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
              }`} onClick={() => book.epub_filename && openLibraryEpub(book.id, book.title)}>
                {/* Cover thumbnail */}
                <div className="shrink-0 w-8 h-11 rounded-sm overflow-hidden bg-muted flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/library/${book.id}/cover`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling?.classList.remove("hidden") }}
                  />
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="hidden text-muted-foreground"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{book.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {book.author && <span className="text-[10px] text-muted-foreground truncate">{book.author}</span>}
                    <div className="flex gap-1">
                      {book.epub_filename && (
                        <Badge variant="outline" className="h-auto text-[9px] px-1 py-0">EPUB</Badge>
                      )}
                      {book.filename && (
                        <Badge variant="outline" className="h-auto text-[9px] px-1 py-0">
                          {book.filename.endsWith(".xtch") ? "XTC HQ" : "XTC"}
                          {book.file_size != null && ` ${(book.file_size / (1024 * 1024)).toFixed(1)}MB`}
                        </Badge>
                      )}
                      {isOnDevice(book) && (
                        <Badge variant="outline" className="h-auto text-[9px] p-0.5 text-emerald-600 border-emerald-600/30">
                          <Smartphone className="w-2.5 h-2.5" />
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover/lib:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  {book.filename && (
                    <Tooltip>
                      <TooltipTrigger render={
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 w-6 p-0"
                          disabled={!deviceConfigured || transferring}
                          onClick={() => sendToDevice(book.id)}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>
                        </Button>
                      } />
                      <TooltipContent side="top">{deviceConfigured ? "Send to device" : "Configure device in Device tab"}</TooltipContent>
                    </Tooltip>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                        <Ellipsis className="w-3 h-3" />
                      </Button>
                    } />
                    <DropdownMenuContent align="end" side="bottom" className="w-auto min-w-[140px]">
                      <DropdownMenuItem className="text-sm" onClick={() => setEditBook({ id: book.id, title: book.title, author: book.author || "" })}>
                        <Pencil className="size-3.5" />
                        Edit metadata
                      </DropdownMenuItem>
                      {book.filename && (
                        <DropdownMenuItem className="text-sm" onClick={() => downloadXtc(book.id)}>
                          <Download className="size-3.5" />
                          Download XTC
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-sm" variant="destructive" onClick={() => setDeleteConfirm(book)}>
                        <Trash2 className="size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AlertDialog open={deleteConfirm?.id === book.id} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                          <Trash2 className="w-5 h-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Delete book?</AlertDialogTitle>
                        <AlertDialogDesc>
                          This will permanently delete <strong>{book.title}</strong> and all its files (EPUB and XTC).
                        </AlertDialogDesc>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => { deleteLibraryBook(book.id); setDeleteConfirm(null) }}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Edit metadata dialog */}
      <AlertDialog open={!!editBook} onOpenChange={(open) => { if (!open) setEditBook(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
            </AlertDialogMedia>
            <AlertDialogTitle>Edit metadata</AlertDialogTitle>
            <AlertDialogDesc>
              Update the title and author shown in the library and OPDS feed.
            </AlertDialogDesc>
          </AlertDialogHeader>
          {editBook && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title" className="text-xs">Title</Label>
                <Input id="edit-title" value={editBook.title} onChange={(e) => setEditBook({ ...editBook, title: e.target.value })} className="h-7 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-author" className="text-xs">Author</Label>
                <Input id="edit-author" value={editBook.author} onChange={(e) => setEditBook({ ...editBook, author: e.target.value })} className="h-7 text-xs" />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" onClick={() => setEditBook(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!editBook?.title.trim()}
              onClick={() => {
                if (editBook && editBook.title.trim()) {
                  updateLibraryBook(editBook.id, editBook.title.trim(), editBook.author.trim() || null)
                  setEditBook(null)
                }
              }}
            >Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
