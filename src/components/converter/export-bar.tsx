import React from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { type FileInfo } from "@/lib/types"

interface ExportBarProps {
  bookLoaded: boolean
  processing: boolean
  files: FileInfo[]
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

export function ExportBar({
  bookLoaded,
  processing,
  files,
  showExport,
  exportPct,
  exportMsg,
  saving,
  saveMsg,
  handleExportXtc,
  handleExportAll,
  handleSaveToLibrary,
  handleSaveAllToLibrary,
}: ExportBarProps) {
  return (
    <div className="px-4 py-3 border-t border-border/50 space-y-2 bg-card/80">
      {showExport && (
        <div className="space-y-1.5 px-1">
          <Progress value={exportPct} className="h-2" />
          <p className="text-[11px] text-muted-foreground text-center">{exportMsg}</p>
        </div>
      )}
      <Button className="w-full h-8 text-[12px] font-medium" disabled={!bookLoaded || processing} onClick={() => handleExportXtc()}>
        {processing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        )}
        Export XTC
      </Button>
      {files.length > 1 && (
        <Button variant="secondary" className="w-full h-7 text-[11px]" disabled={processing} onClick={handleExportAll}>
          Export All ({files.length})
        </Button>
      )}
      <div className="flex gap-2 mt-1">
        <Button variant="outline" className="flex-1 h-7 text-[11px]" disabled={!bookLoaded || processing} onClick={handleSaveToLibrary}>
          {saving ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          ) : saveMsg ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
          )}
          {saveMsg || "Save to Library"}
        </Button>
        {files.length > 1 && (
          <Button variant="outline" className="h-7 text-[11px] px-2" disabled={processing} onClick={handleSaveAllToLibrary} title="Save All to Library">
            Save All
          </Button>
        )}
      </div>
    </div>
  )
}
