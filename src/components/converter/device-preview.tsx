"use client"

import React from "react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { type Settings, type DeviceColor } from "@/lib/types"
import { DEVICE_BEZELS, DEVICE_COLORS, TRUE_LIFE_CSS_PPI, getScreenDimensions } from "@/lib/device"

interface DevicePreviewProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  s: Settings
  deviceColor: DeviceColor
  bookLoaded: boolean
  loading: boolean
  loadingMsg: string
  wasmReady: boolean
  page: number
  pages: number
  goToPage: (pg: number) => void
  processing: boolean
  handleGenerateXtc: () => void
}

export function DevicePreview({
  canvasRef, s, deviceColor, bookLoaded, loading, loadingMsg, wasmReady,
  page, pages, goToPage, processing, handleGenerateXtc,
}: DevicePreviewProps) {
  const dims = getScreenDimensions(s.deviceType, s.orientation)

  // Compute bezel layout based on device type and orientation
  const bz = DEVICE_BEZELS[s.deviceType]
  const dc = DEVICE_COLORS[deviceColor]
  const chinSide: "top" | "right" | "bottom" | "left" =
    s.orientation === 0 ? "bottom" : s.orientation === 90 ? "right" : s.orientation === 180 ? "top" : "left"
  const bezelTop    = chinSide === "top"    ? bz.chin : chinSide === "bottom" ? bz.top : bz.side
  const bezelRight  = chinSide === "right"  ? bz.chin : chinSide === "left"   ? bz.top : bz.side
  const bezelBottom = chinSide === "bottom" ? bz.chin : chinSide === "top"    ? bz.top : bz.side
  const bezelLeft   = chinSide === "left"   ? bz.chin : chinSide === "right"  ? bz.top : bz.side
  const totalW = bezelLeft + dims.screenWidth + bezelRight
  const totalH = bezelTop + dims.screenHeight + bezelBottom
  // True-to-life CSS size: device physical mm → CSS pixels (swap for landscape)
  const isLandscape = s.orientation === 90 || s.orientation === 270
  const trueLifeW = (isLandscape ? bz.deviceHeightMm : bz.deviceWidthMm) / 25.4 * TRUE_LIFE_CSS_PPI
  const trueLifeH = (isLandscape ? bz.deviceWidthMm : bz.deviceHeightMm) / 25.4 * TRUE_LIFE_CSS_PPI

  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden" style={{ background: "radial-gradient(ellipse at center, hsl(var(--muted)) 0%, hsl(var(--background)) 70%)" }}>
      {!bookLoaded && !loading && (
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Load an EPUB file to begin</p>
          <p className="text-[12px] text-muted-foreground/60 mt-1">Drag and drop or use the sidebar</p>
          {!wasmReady && (
            <div className="flex items-center justify-center gap-2 mt-3 text-[12px] text-muted-foreground/50">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Loading engine...
            </div>
          )}
        </div>
      )}

      <div className={bookLoaded ? "flex flex-col items-center gap-20" : "hidden"}>
        {/* Device frame — realistic Xteink bezel mockup (true-to-life size) */}
        <div
          className="relative"
          style={{
            aspectRatio: `${totalW} / ${totalH}`,
            width: `min(${trueLifeW.toFixed(1)}px, calc(100vw - 420px), calc((100vh - 100px) * ${(totalW / totalH).toFixed(6)}))`,
            background: dc.body,
            borderRadius: `${((bz.bodyRadius / totalW) * 100).toFixed(2)}% / ${((bz.bodyRadius / totalH) * 100).toFixed(2)}%`,
            boxShadow: `${dc.shadow}, ${dc.highlight}`,
          }}
        >
          {/* Screen area */}
          <div
            className="absolute overflow-hidden"
            style={{
              left: `${((bezelLeft / totalW) * 100).toFixed(4)}%`,
              right: `${((bezelRight / totalW) * 100).toFixed(4)}%`,
              top: `${((bezelTop / totalH) * 100).toFixed(4)}%`,
              bottom: `${((bezelBottom / totalH) * 100).toFixed(4)}%`,
              borderRadius: `${((bz.screenRadius / totalW) * 100).toFixed(2)}% / ${((bz.screenRadius / totalH) * 100).toFixed(2)}%`,
              boxShadow: dc.screenBorder,
            }}
          >
            <canvas
              ref={canvasRef}
              width={dims.screenWidth}
              height={dims.screenHeight}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>

          {/* Power button (right side in portrait) */}
          {bz.sideButtons.map((btn, i) => {
            const screenOff = chinSide === "bottom" || chinSide === "top" ? bezelTop : bezelLeft
            const screenLen = chinSide === "bottom" || chinSide === "top" ? dims.screenHeight : dims.screenWidth
            const btnPos = screenOff + screenLen * btn.offsetPct
            const t = 8
            const pos: React.CSSProperties =
              chinSide === "bottom" ? { right: `${(-t / totalW * 100).toFixed(2)}%`, top: `${(btnPos / totalH * 100).toFixed(2)}%`, width: `${(t / totalW * 100).toFixed(2)}%`, height: `${(btn.size / totalH * 100).toFixed(2)}%`, borderRadius: "0 3px 3px 0" }
              : chinSide === "right" ? { bottom: `${(-t / totalH * 100).toFixed(2)}%`, left: `${(btnPos / totalW * 100).toFixed(2)}%`, height: `${(t / totalH * 100).toFixed(2)}%`, width: `${(btn.size / totalW * 100).toFixed(2)}%`, borderRadius: "0 0 3px 3px" }
              : chinSide === "top" ? { left: `${(-t / totalW * 100).toFixed(2)}%`, bottom: `${(btnPos / totalH * 100).toFixed(2)}%`, width: `${(t / totalW * 100).toFixed(2)}%`, height: `${(btn.size / totalH * 100).toFixed(2)}%`, borderRadius: "3px 0 0 3px" }
              : { top: `${(-t / totalH * 100).toFixed(2)}%`, right: `${(btnPos / totalW * 100).toFixed(2)}%`, height: `${(t / totalH * 100).toFixed(2)}%`, width: `${(btn.size / totalW * 100).toFixed(2)}%`, borderRadius: "3px 3px 0 0" }
            return (
              <div key={i} className="absolute" style={{ ...pos, background: dc.button, boxShadow: `${dc.highlight}, 0 1px 3px rgba(0,0,0,0.2)` }} />
            )
          })}

          {/* Page-turn buttons on chin bezel */}
          {(() => {
            const cb = bz.chinButtons
            const isHoriz = chinSide === "bottom" || chinSide === "top"
            // Button width is relative to the chin's cross-axis (short side), not total device width
            const chinCrossLen = isHoriz ? totalW : totalH
            const btnW = chinCrossLen * cb.widthPct
            const totalBtnW = btnW * 2 + cb.gap
            const startX = (chinCrossLen - totalBtnW) / 2
            const chinStart = chinSide === "bottom" ? bezelTop + dims.screenHeight
              : chinSide === "top" ? 0
              : chinSide === "left" ? 0
              : bezelLeft + dims.screenWidth
            const chinLen = bz.chin
            const btnCenterOffset = chinStart + (chinLen - cb.height) * 0.75

            return [-1, 1].map((side) => {
              const btnX = startX + (side === -1 ? 0 : btnW + cb.gap)
              const pos: React.CSSProperties = isHoriz
                ? {
                    left: `${(btnX / totalW * 100).toFixed(2)}%`,
                    top: `${(btnCenterOffset / totalH * 100).toFixed(2)}%`,
                    width: `${(btnW / totalW * 100).toFixed(2)}%`,
                    height: `${(cb.height / totalH * 100).toFixed(2)}%`,
                  }
                : {
                    top: `${(btnX / totalH * 100).toFixed(2)}%`,
                    left: `${(btnCenterOffset / totalW * 100).toFixed(2)}%`,
                    height: `${(btnW / totalH * 100).toFixed(2)}%`,
                    width: `${(cb.height / totalW * 100).toFixed(2)}%`,
                  }
              return (
                <div key={side} className="absolute" style={{
                  ...pos,
                  background: dc.slot,
                  borderRadius: "100px",
                  boxShadow: `inset 0 2px 3px rgba(0,0,0,0.15), 0 1px 0 ${deviceColor === "black" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)"}`,
                }} />
              )
            })
          })()}
        </div>

        {/* Controls below device */}
        <div className="flex flex-col gap-2 w-full px-1">
          {/* Page scrubber */}
          {pages > 1 && (
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={pages - 1}
                step={1}
                value={[page]}
                onValueChange={(val) => goToPage(Array.isArray(val) ? val[0] : val)}
              />
              <span className="text-[11px] font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                {page + 1} / {pages}
              </span>
            </div>
          )}

          {/* Generate XTC */}
          <Button
            className="w-full h-8 text-[12px] font-medium"
            disabled={!bookLoaded || processing}
            onClick={handleGenerateXtc}
          >
            {processing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            )}
            Generate XTC
          </Button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {loadingMsg || "Loading..."}
          </div>
        </div>
      )}
    </div>
  )
}
