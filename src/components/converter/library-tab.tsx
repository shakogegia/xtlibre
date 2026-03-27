import React from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { type FileInfo } from "@/lib/types"

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
  // Upload / files
  files: FileInfo[]
  fileIdx: number
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  switchToFile: (index: number) => void
  removeFile: (index: number) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void
  setFiles: React.Dispatch<React.SetStateAction<FileInfo[]>>
  filesRef: React.MutableRefObject<FileInfo[]>
  setBookLoaded: (v: boolean) => void
  // Library
  libraryBooks: LibraryBook[]
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  deleteLibraryBook: (bookId: string) => void
}

export function LibraryTab({
  files, fileIdx, fileInputRef, addFiles, switchToFile, removeFile,
  dragOver, setDragOver, setFiles, filesRef, setBookLoaded,
  libraryBooks, libraryLoading, openLibraryEpub, deleteLibraryBook,
}: LibraryTabProps) {
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

      {/* Loaded files list */}
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

      {/* Separator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Saved</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* Library books */}
      {libraryLoading ? (
        <div className="flex items-center justify-center py-8">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </div>
      ) : libraryBooks.length === 0 ? (
        <div className="flex items-center justify-center py-4">
          <p className="text-[12px] text-muted-foreground">No saved books yet</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-1 pb-3">
            {libraryBooks.map(book => (
              <div key={book.id} className="group/lib flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{book.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {book.author && <span className="text-[10px] text-muted-foreground truncate">{book.author}</span>}
                    <div className="flex gap-1">
                      {book.epub_filename && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">EPUB</span>
                      )}
                      {book.filename && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">XTC</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover/lib:opacity-100 transition-opacity">
                  {book.epub_filename && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Open in converter" onClick={() => openLibraryEpub(book.id, book.title)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
                    </Button>
                  )}
                  {book.filename && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Download XTC" onClick={() => { window.location.href = `/api/library/${book.id}` }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => deleteLibraryBook(book.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  )
}
