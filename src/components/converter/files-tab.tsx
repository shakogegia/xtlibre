import React from "react"
import { Button } from "@/components/ui/button"
import { type FileInfo } from "@/lib/types"

interface FilesTabProps {
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
}

export function FilesTab({
  files, fileIdx, fileInputRef, addFiles, switchToFile, removeFile,
  dragOver, setDragOver, setFiles, filesRef, setBookLoaded,
}: FilesTabProps) {
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
    </>
  )
}
