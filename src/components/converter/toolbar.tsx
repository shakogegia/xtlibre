import React from "react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { type BookMetadata, type DeviceColor } from "@/lib/types"

interface ToolbarProps {
  bookLoaded: boolean
  page: number
  pages: number
  meta: BookMetadata
  prevPage: () => void
  nextPage: () => void
  deviceColor: DeviceColor
  setDeviceColor: React.Dispatch<React.SetStateAction<DeviceColor>>
  renderPreview: () => void
  compact?: boolean
}

export function Toolbar({ bookLoaded, page, pages, meta, prevPage, nextPage, deviceColor, setDeviceColor, renderPreview, compact }: ToolbarProps) {
  const btnSize = compact ? "h-9 w-9" : "h-7 w-7"
  const iconSize = compact ? "16" : "14"
  return (
    <div className="flex items-center border-b border-border/50 px-4 py-2 gap-4">
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className={`${btnSize} p-0`} disabled={!bookLoaded || page <= 0} onClick={prevPage}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </Button>
        <Button variant="outline" size="sm" className={`${btnSize} p-0`} disabled={!bookLoaded || page >= pages - 1} onClick={nextPage}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </Button>
      </div>

      <span className="text-[12px] font-mono tabular-nums text-muted-foreground">
        {page + 1} / {pages}
      </span>

      {bookLoaded && meta.title && (
        <div className="flex-1 min-w-0 text-[12px] truncate">
          <span className="font-medium">{meta.title}</span>
          {meta.authors && <span className="text-muted-foreground ml-2">by {meta.authors}</span>}
        </div>
      )}

      <div className="flex items-center gap-1 ml-auto">
        {/* Device color toggle */}
        <Button
          variant="ghost"
          size="sm"
          className={`${btnSize} p-0`}
          disabled={!bookLoaded}
          onClick={() => setDeviceColor(prev => prev === "black" ? "white" : "black")}
          title={deviceColor === "black" ? "Space Black" : "Frost White"}
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M12 2 A10 10 0 0 1 12 22 Z" fill={deviceColor === "black" ? "#1a1a1e" : "#ffffff"} />
            <path d="M12 2 A10 10 0 0 0 12 22 Z" fill={deviceColor === "black" ? "#ffffff" : "#1a1a1e"} />
          </svg>
        </Button>
        <Button variant="ghost" size="sm" className={`${btnSize} p-0`} disabled={!bookLoaded} onClick={() => renderPreview()}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </Button>
        <ThemeToggle />
      </div>
    </div>
  )
}
