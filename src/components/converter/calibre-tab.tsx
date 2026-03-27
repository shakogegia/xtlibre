import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { type OpdsEntry, type OpdsFeed } from "@/lib/opds"

interface CalibreTabProps {
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
}

function Thumbnail({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) return null

  return (
    <div className="relative w-8 h-11 rounded-sm bg-muted shrink-0 overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-3" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`w-full h-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
}

export function CalibreTab({
  calibreConnected,
  opdsFeed,
  opdsLoading,
  opdsError,
  opdsSearch,
  opdsNavStack,
  opdsDownloading,
  setOpdsSettingsOpen,
  setOpdsSearch,
  setOpdsError,
  opdsBrowse,
  opdsBack,
  opdsDoSearch,
  opdsImportBook,
}: CalibreTabProps) {
  // Auto-browse once connected with no feed yet
  // (covers direct navigation to ?tab=calibre and page refresh)
  useEffect(() => {
    if (calibreConnected && !opdsFeed && !opdsLoading && !opdsError) {
      opdsBrowse()
    }
  }, [calibreConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Header with settings gear */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-medium text-muted-foreground">
          {calibreConnected ? "Calibre-Web" : "Calibre"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setOpdsSettingsOpen(true)}
          title="Calibre settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </Button>
      </div>

      {!calibreConnected ? (
        /* No server configured — prompt to connect */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
            </div>
            <p className="text-[12px] font-medium text-muted-foreground mb-1">Connect to Calibre</p>
            <p className="text-[11px] text-muted-foreground/60 mb-3">Browse and import books from your Calibre-Web server</p>
            <Button size="sm" className="h-7 text-[12px]" onClick={() => setOpdsSettingsOpen(true)}>
              Connect
            </Button>
          </div>
        </div>
      ) : (
        /* Connected — show browse UI */
        <>
          {/* Search bar */}
          <div className="flex gap-1.5 mb-3">
            <Input
              placeholder="Search books..."
              className="h-7 text-[12px]"
              value={opdsSearch}
              onChange={(e) => setOpdsSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && opdsDoSearch()}
            />
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={opdsDoSearch} disabled={opdsLoading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </Button>
          </div>

          {/* Nav breadcrumb */}
          {opdsNavStack.length > 0 && (
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-2 transition-colors"
              onClick={opdsBack}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
          )}

          {/* Error */}
          {opdsError && (
            <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1.5 mb-2">
              {opdsError}
              <button className="ml-2 underline" onClick={() => setOpdsError("")}>dismiss</button>
            </div>
          )}

          {/* Loading skeletons (only when no feed yet) */}
          {opdsLoading && !opdsFeed && (
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2.5 py-2 border-b border-border/30 last:border-0">
                  <Skeleton className="w-8 h-11 rounded-sm shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="flex gap-1">
                      <Skeleton className="h-4 w-10 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Book list */}
          {opdsFeed && (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4">
              {opdsFeed.entries.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">No results</p>
              )}
              {opdsFeed.entries.map((entry) => {
                const isNav = !!entry.navigationPath
                const isDownloading = opdsDownloading.has(entry.id)
                return (
                  <div
                    key={entry.id}
                    className={`flex items-start gap-2.5 py-2 border-b border-border/30 last:border-0 ${
                      isNav ? "cursor-pointer hover:bg-muted/30 -mx-4 px-4 transition-colors" : ""
                    }`}
                    onClick={isNav ? () => { if (entry.navigationPath) opdsBrowse(entry.navigationPath) } : undefined}
                  >
                    {/* Thumbnail (books only, not nav categories) */}
                    {!isNav && (entry.thumbnailPath ? (
                      <Thumbnail src={`/api/calibre/download?path=${encodeURIComponent(entry.thumbnailPath)}`} />
                    ) : (
                      <div className="w-8 h-11 rounded-sm bg-muted shrink-0 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
                      </div>
                    ))}

                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{entry.title}</div>
                      {entry.authors.length > 0 && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {entry.authors.join(", ")}
                        </div>
                      )}
                      {/* Format badges */}
                      {entry.formats.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.formats.map((f, i) => {
                            const label = f.type.includes("epub") ? "EPUB"
                              : f.type.includes("pdf") ? "PDF"
                              : f.type.includes("mobi8") || f.path.toLowerCase().includes("/azw3/") ? "AZW3"
                              : f.type.includes("mobi") ? "MOBI"
                              : f.type.includes("fb2") ? "FB2"
                              : f.type.includes("amazon") || f.path.toLowerCase().includes("/azw/") ? "AZW"
                              : f.type.split("/").pop()?.toUpperCase() || "?"
                            return (
                              <span
                                key={i}
                                className={`text-[10px] px-1 py-0.5 rounded ${
                                  label === "EPUB"
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Import button — only for books with EPUB */}
                    {entry.hasEpub && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0 mt-0.5"
                        disabled={isDownloading}
                        onClick={(e) => { e.stopPropagation(); opdsImportBook(entry) }}
                        title="Import EPUB"
                      >
                        {isDownloading ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        )}
                      </Button>
                    )}

                    {/* Chevron for navigation entries */}
                    {isNav && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground mt-1"><path d="m9 18 6-6-6-6"/></svg>
                    )}
                  </div>
                )
              })}

              {/* Load more (pagination) */}
              {opdsFeed.nextPath && (
                <div className="py-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-muted-foreground"
                    onClick={() => opdsBrowse(opdsFeed.nextPath!, true)}
                    disabled={opdsLoading}
                  >
                    {opdsLoading ? "Loading..." : "Load more..."}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Browse button — shown when no feed loaded yet */}
          {!opdsLoading && !opdsFeed && !opdsError && (
            <div className="flex-1 flex items-center justify-center">
              <Button size="sm" className="h-7 text-[12px]" onClick={() => opdsBrowse()}>
                Browse Calibre
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
