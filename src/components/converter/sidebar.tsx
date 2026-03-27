import React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { FilesTab } from "@/components/converter/files-tab"
import { OptionsTab } from "@/components/converter/options-tab"
import { CalibreTab } from "@/components/converter/calibre-tab"
import { LibraryTab } from "@/components/converter/library-tab"
import { ExportBar } from "@/components/converter/export-bar"
import {
  type Settings, type BookMetadata, type TocItem, type FileInfo, type Renderer,
} from "@/lib/types"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

interface SidebarProps {
  initialTab: string

  // Files tab
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

  // Options tab
  s: Settings
  meta: BookMetadata
  toc: TocItem[]
  customFontName: string
  update: (patch: Partial<Settings>) => void
  updateAndReformat: (patch: Partial<Settings>) => void
  updateAndRender: (patch: Partial<Settings>) => void
  flushReformat: () => void
  flushRender: () => void
  handleFontChange: (fontName: string | null) => void
  handleQualityChange: (mode: "fast" | "hq") => void
  handleHyphenationChange: (val: number) => void
  handleHyphenLangChange: (lang: string | null) => void
  handleCustomFont: (e: React.ChangeEvent<HTMLInputElement>) => void
  fontInputRef: React.RefObject<HTMLInputElement | null>
  renderPreview: () => void
  rendererRef: React.MutableRefObject<Renderer>

  // Calibre tab
  calibreConnected: boolean
  opdsFeed: OpdsFeed | null
  opdsLoading: boolean
  opdsError: string
  opdsSearch: string
  opdsNavStack: string[]
  opdsDownloading: Set<string>
  setOpdsSettingsOpen: (v: boolean) => void
  setOpdsSearch: (v: string) => void
  setOpdsError: (v: string) => void
  opdsBrowse: (path?: string) => void
  opdsBack: () => void
  opdsDoSearch: () => void
  opdsImportBook: (entry: OpdsEntry) => void

  // Library tab
  libraryBooks: Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  deleteLibraryBook: (bookId: string) => void
  fetchLibraryBooks: () => void

  // Export bar
  bookLoaded: boolean
  processing: boolean
  showExport: boolean
  exportPct: number
  exportMsg: React.ReactNode
  saving: boolean
  saveMsg: string
  handleExportXtc: () => void
  handleExportAll: () => void
  handleSaveToLibrary: () => void
  handleSaveAllToLibrary: () => void
}

export function Sidebar({
  initialTab,
  // Files tab
  files, fileIdx, fileInputRef, addFiles, switchToFile, removeFile,
  dragOver, setDragOver, setFiles, filesRef, setBookLoaded,
  // Options tab
  s, meta, toc, customFontName, update, updateAndReformat, updateAndRender,
  flushReformat, flushRender, handleFontChange, handleQualityChange,
  handleHyphenationChange, handleHyphenLangChange, handleCustomFont, fontInputRef,
  renderPreview, rendererRef,
  // Calibre tab
  calibreConnected, opdsFeed, opdsLoading, opdsError, opdsSearch, opdsNavStack,
  opdsDownloading, setOpdsSettingsOpen, setOpdsSearch, setOpdsError,
  opdsBrowse, opdsBack, opdsDoSearch, opdsImportBook,
  // Library tab
  libraryBooks, libraryLoading, openLibraryEpub, deleteLibraryBook, fetchLibraryBooks,
  // Export bar
  bookLoaded, processing, showExport, exportPct, exportMsg,
  saving, saveMsg, handleExportXtc, handleExportAll,
  handleSaveToLibrary, handleSaveAllToLibrary,
}: SidebarProps) {
  return (
    <div className="w-[360px] border-r border-border/50 flex flex-col bg-card/50">
      <Tabs urlSync="tab" defaultValue={initialTab} onValueChange={(v) => { if (v === "calibre" && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse(); if (v === "library") fetchLibraryBooks() }} className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="flex items-center px-4 py-2 border-b border-border/50">
          <TabsList className="w-full !h-7 p-0.5">
            <TabsTrigger value="files" className="text-[12px]">Files</TabsTrigger>
            <TabsTrigger value="options" className="text-[12px]">Options</TabsTrigger>
            <TabsTrigger value="calibre" className="text-[12px]">Calibre</TabsTrigger>
            <TabsTrigger value="library" className="text-[12px]">Library</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="files" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <FilesTab
            files={files} fileIdx={fileIdx} fileInputRef={fileInputRef}
            addFiles={addFiles} switchToFile={switchToFile} removeFile={removeFile}
            dragOver={dragOver} setDragOver={setDragOver}
            setFiles={setFiles} filesRef={filesRef} setBookLoaded={setBookLoaded}
          />
        </TabsContent>

        <TabsContent value="options" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <OptionsTab
            s={s} meta={meta} toc={toc} customFontName={customFontName}
            update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
            flushReformat={flushReformat} flushRender={flushRender}
            handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
            handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
            handleCustomFont={handleCustomFont} fontInputRef={fontInputRef}
            renderPreview={renderPreview} rendererRef={rendererRef}
          />
        </TabsContent>

        <TabsContent value="calibre" className="flex-1 min-h-0 flex flex-col px-4 pt-3">
          <CalibreTab
            calibreConnected={calibreConnected} opdsFeed={opdsFeed}
            opdsLoading={opdsLoading} opdsError={opdsError}
            opdsSearch={opdsSearch} opdsNavStack={opdsNavStack}
            opdsDownloading={opdsDownloading}
            setOpdsSettingsOpen={setOpdsSettingsOpen} setOpdsSearch={setOpdsSearch}
            setOpdsError={setOpdsError}
            opdsBrowse={opdsBrowse} opdsBack={opdsBack}
            opdsDoSearch={opdsDoSearch} opdsImportBook={opdsImportBook}
          />
        </TabsContent>
        <TabsContent value="library" className="flex-1 min-h-0 flex flex-col px-4 pt-3">
          <LibraryTab
            libraryBooks={libraryBooks} libraryLoading={libraryLoading}
            openLibraryEpub={openLibraryEpub} deleteLibraryBook={deleteLibraryBook}
          />
        </TabsContent>
      </Tabs>

      <ExportBar
        bookLoaded={bookLoaded} processing={processing} files={files}
        showExport={showExport} exportPct={exportPct} exportMsg={exportMsg}
        saving={saving} saveMsg={saveMsg}
        handleExportXtc={handleExportXtc} handleExportAll={handleExportAll}
        handleSaveToLibrary={handleSaveToLibrary} handleSaveAllToLibrary={handleSaveAllToLibrary}
      />
    </div>
  )
}
