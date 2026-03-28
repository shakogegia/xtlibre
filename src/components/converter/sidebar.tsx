import React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { OptionsTab } from "@/components/converter/options-tab"
import { CalibreTab } from "@/components/converter/calibre-tab"
import { LibraryTab } from "@/components/converter/library-tab"
import { DeviceTab } from "@/components/converter/device-tab"
import {
  type Settings, type BookMetadata, type TocItem, type Renderer,
} from "@/lib/types"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

interface SidebarProps {
  initialTab: string
  opdsUrl: string | null

  // Files (upload)
  fileInputRef: React.RefObject<HTMLInputElement | null>
  addFiles: (files: FileList | File[]) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void

  // Options tab
  s: Settings
  meta: BookMetadata
  toc: TocItem[]
  customFonts: Array<{ id: string; name: string; filename: string }>
  uploadCustomFont: (file: File) => Promise<{ id: string; name: string; filename: string }>
  deleteCustomFont: (id: string) => Promise<void>
  update: (patch: Partial<Settings>) => void
  updateAndReformat: (patch: Partial<Settings>) => void
  updateAndRender: (patch: Partial<Settings>) => void
  flushReformat: () => void
  flushRender: () => void
  handleFontChange: (fontName: string | null) => void
  handleQualityChange: (mode: "fast" | "hq") => void
  handleHyphenationChange: (val: number) => void
  handleHyphenLangChange: (lang: string | null) => void
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
  opdsBrowse: (path?: string, append?: boolean) => void
  opdsBack: () => void
  opdsDoSearch: () => void
  opdsImportBook: (entry: OpdsEntry) => void

  // Library
  activeBookId: string | null
  libraryBooks: Array<{
    id: string; title: string; author: string | null; filename: string | null
    file_size: number | null; created_at: string; device_type: string | null; epub_filename: string | null
  }>
  libraryLoading: boolean
  openLibraryEpub: (bookId: string, title: string) => void
  downloadXtc: (bookId: string) => void
  deleteLibraryBook: (bookId: string) => void
  updateLibraryBook: (bookId: string, title: string, author: string | null) => void

  // Device
  sendToDevice: (bookId: string) => void
  deviceConfigured: boolean
  transferring: boolean
  transferProgress: { sent: number; total: number; filename: string } | null
  cancelTransfer: () => void
}

export function Sidebar({
  initialTab, opdsUrl,
  // Files
  fileInputRef, addFiles, dragOver, setDragOver,
  // Options tab
  s, meta, toc, customFonts, uploadCustomFont, deleteCustomFont,
  update, updateAndReformat, updateAndRender,
  flushReformat, flushRender, handleFontChange, handleQualityChange,
  handleHyphenationChange, handleHyphenLangChange,
  renderPreview, rendererRef,
  // Calibre tab
  calibreConnected, opdsFeed, opdsLoading, opdsError, opdsSearch, opdsNavStack,
  opdsDownloading, setOpdsSettingsOpen, setOpdsSearch, setOpdsError,
  opdsBrowse, opdsBack, opdsDoSearch, opdsImportBook,
  // Library
  activeBookId, libraryBooks, libraryLoading, openLibraryEpub, downloadXtc, deleteLibraryBook, updateLibraryBook,
  // Device
  sendToDevice, deviceConfigured, transferring, transferProgress, cancelTransfer,
}: SidebarProps) {
  return (
    <div className="w-[360px] border-r border-border/50 flex flex-col bg-card/50">
      <Tabs urlSync="tab" defaultValue={initialTab} onValueChange={(v) => { if (v === "calibre" && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse() }} className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="flex items-center px-4 py-2 border-b border-border/50">
          <TabsList className="w-full !h-7 p-0.5">
            <TabsTrigger value="library" className="text-[12px]">Library</TabsTrigger>
            <TabsTrigger value="options" className="text-[12px]">Options</TabsTrigger>
            <TabsTrigger value="calibre" className="text-[12px]">Calibre</TabsTrigger>
            <TabsTrigger value="device" className="text-[12px]">Device</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="library" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <LibraryTab
            fileInputRef={fileInputRef} addFiles={addFiles}
            dragOver={dragOver} setDragOver={setDragOver}
            opdsUrl={opdsUrl} activeBookId={activeBookId}
            libraryBooks={libraryBooks} libraryLoading={libraryLoading}
            openLibraryEpub={openLibraryEpub} downloadXtc={downloadXtc}
            deleteLibraryBook={deleteLibraryBook}
            updateLibraryBook={updateLibraryBook}
            sendToDevice={sendToDevice}
            deviceConfigured={deviceConfigured}
            transferring={transferring}
          />
        </TabsContent>

        <TabsContent value="options" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <OptionsTab
            s={s} meta={meta} toc={toc}
            customFonts={customFonts} uploadCustomFont={uploadCustomFont} deleteCustomFont={deleteCustomFont}
            update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
            flushReformat={flushReformat} flushRender={flushRender}
            handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
            handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
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

        <TabsContent value="device" className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
          <DeviceTab
            s={s} update={update}
            transferring={transferring}
            transferProgress={transferProgress}
            cancelTransfer={cancelTransfer}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
