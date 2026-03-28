"use client"

import React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LibraryTab } from "@/components/converter/library-tab"
import { CalibreTab } from "@/components/converter/calibre-tab"
import { OptionsTab } from "@/components/converter/options-tab"
import { DeviceTab } from "@/components/converter/device-tab"
import { DevicePreview } from "@/components/converter/device-preview"
import { Toolbar } from "@/components/converter/toolbar"
import { Library, BookOpen, SlidersHorizontal, Tablet, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type Settings, type BookMetadata, type TocItem, type Renderer, type DeviceColor,
} from "@/lib/types"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

const TABS = [
  { value: "library", label: "Library", icon: Library },
  { value: "calibre", label: "Calibre", icon: BookOpen },
  { value: "options", label: "Options", icon: SlidersHorizontal },
  { value: "device", label: "Device", icon: Tablet },
  { value: "preview", label: "Preview", icon: Eye },
] as const

interface MobileLayoutProps {
  className?: string
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

  // Preview
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  deviceColor: DeviceColor
  bookLoaded: boolean
  loading: boolean
  loadingMsg: string
  wasmReady: boolean
  page: number
  pages: number
  goToPage: (pg: number) => void
  prevPage: () => void
  nextPage: () => void
  processing: boolean
  handleGenerateXtc: () => void
  setDeviceColor: React.Dispatch<React.SetStateAction<DeviceColor>>
}

export function MobileLayout({
  className,
  initialTab, opdsUrl,
  fileInputRef, addFiles, dragOver, setDragOver,
  s, meta, toc, customFonts, uploadCustomFont, deleteCustomFont,
  update, updateAndReformat, updateAndRender,
  flushReformat, flushRender, handleFontChange, handleQualityChange,
  handleHyphenationChange, handleHyphenLangChange,
  renderPreview, rendererRef,
  calibreConnected, opdsFeed, opdsLoading, opdsError, opdsSearch, opdsNavStack,
  opdsDownloading, setOpdsSettingsOpen, setOpdsSearch, setOpdsError,
  opdsBrowse, opdsBack, opdsDoSearch, opdsImportBook,
  activeBookId, libraryBooks, libraryLoading, openLibraryEpub, downloadXtc, deleteLibraryBook, updateLibraryBook,
  sendToDevice, deviceConfigured, transferring, transferProgress, cancelTransfer,
  canvasRef, deviceColor, bookLoaded, loading, loadingMsg, wasmReady,
  page, pages, goToPage, prevPage, nextPage, processing, handleGenerateXtc, setDeviceColor,
}: MobileLayoutProps) {
  return (
    <Tabs
      defaultValue={initialTab}
      onValueChange={(v) => {
        if (v === "calibre" && calibreConnected && !opdsFeed && !opdsLoading) opdsBrowse()
      }}
      className={cn("flex-1 flex flex-col min-h-0", className)}
    >
      {/* Tab content area — fills available space above the bottom bar */}
      <div className="flex-1 min-h-0 flex flex-col">
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

        <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col">
          <Toolbar
            bookLoaded={bookLoaded} page={page} pages={pages} meta={meta}
            prevPage={prevPage} nextPage={nextPage}
            deviceColor={deviceColor} setDeviceColor={setDeviceColor}
            renderPreview={renderPreview}
            compact
          />
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [&>div]:shrink-0 [&>div]:basis-auto">
            <DevicePreview
              canvasRef={canvasRef} s={s} deviceColor={deviceColor}
              bookLoaded={bookLoaded} loading={loading} loadingMsg={loadingMsg} wasmReady={wasmReady}
              page={page} pages={pages} goToPage={goToPage}
              processing={processing} handleGenerateXtc={handleGenerateXtc}
            />
          </div>
        </TabsContent>
      </div>

      {/* Bottom navigation bar */}
      <div className="border-t border-border/50 bg-card">
        <TabsList variant="line" className="w-full rounded-none p-0 gap-0" style={{ height: "3.5rem" }}>
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-none border-0 h-full text-muted-foreground data-active:text-primary data-active:bg-transparent data-active:shadow-none data-active:after:opacity-0 dark:data-active:bg-transparent dark:data-active:border-transparent [&_svg]:!size-5"
            >
              <Icon size={20} />
              <span className="text-[10px]">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}
