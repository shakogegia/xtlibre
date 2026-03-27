import { LANG_TO_PATTERN } from "@/lib/config"
import {
  type TocItem, type Settings,
  PROGRESS_BAR_HEIGHT, PROGRESS_BAR_HEIGHT_FULLWIDTH, PROGRESS_BAR_HEIGHT_EXTENDED,
} from "@/lib/types"

export function getPatternForLang(langTag: string): string {
  if (!langTag) return "English_US.pattern"
  const lang = langTag.toLowerCase().trim()
  if (LANG_TO_PATTERN[lang]) return LANG_TO_PATTERN[lang]
  const prefix = lang.split("-")[0]
  if (LANG_TO_PATTERN[prefix]) return LANG_TO_PATTERN[prefix]
  return "English_US.pattern"
}

export function getChapterInfoForPage(
  pageNum: number, toc: TocItem[], totalPages: number
): { title: string; startPage: number; endPage: number; index: number; totalCount: number } | null {
  if (!toc || toc.length === 0) return null

  let topLevelIndex = 0
  let topLevelPage = -1
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].page <= pageNum && toc[i].page > topLevelPage) {
      topLevelIndex = i + 1
      topLevelPage = toc[i].page
    }
  }
  if (topLevelPage === -1) return null

  const current = { title: "", startPage: topLevelPage, endPage: totalPages - 1, index: topLevelIndex, totalCount: toc.length }
  let deepestPage = topLevelPage

  function findDeepest(items: TocItem[]) {
    for (const item of items) {
      if (item.page <= pageNum && item.page > deepestPage) {
        deepestPage = item.page
        current.startPage = item.page
        current.title = item.title
      }
      if (item.children?.length) findDeepest(item.children)
    }
  }
  findDeepest(toc)

  let foundNext = false
  function findNext(items: TocItem[]) {
    for (const item of items) {
      if (foundNext) return
      if (item.page > current.startPage) { current.endPage = item.page - 1; foundNext = true; return }
      if (item.children) findNext(item.children)
    }
  }
  findNext(toc)

  return current
}

export function getChapterPositions(toc: TocItem[], totalPages: number): number[] {
  const positions: number[] = []
  function extract(items: TocItem[]) {
    for (const item of items) {
      positions.push(item.page / totalPages)
      if (item.children?.length) extract(item.children)
    }
  }
  if (toc.length > 0) extract(toc)
  return positions
}

export function drawProgressIndicator(
  ctx: CanvasRenderingContext2D, s: Settings, currentPage: number,
  totalPages: number, screenW: number, screenH: number, toc: TocItem[]
) {
  if (!s.enableProgressBar) return

  const lineThickness = 1
  const progressThickness = 4
  const chapterMarkHeight = 11
  const edgeMargin = s.progressEdgeMargin || 0
  const sideMargin = s.progressSideMargin || 0
  const padding = 8 + sideMargin
  const isTop = s.progressPosition === "top"
  const hasProgressLine = s.showProgressLine || s.showChapterProgress
  const hasBothLines = s.showProgressLine && s.showChapterProgress

  let barHeight = PROGRESS_BAR_HEIGHT
  if (s.showChapterMarks || (s.progressFullWidth && hasBothLines)) barHeight = PROGRESS_BAR_HEIGHT_EXTENDED
  else if (s.progressFullWidth && hasProgressLine) barHeight = PROGRESS_BAR_HEIGHT_FULLWIDTH

  const baseY = isTop ? edgeMargin : screenH - barHeight - edgeMargin
  const centerY = baseY + barHeight / 2

  const isNeg = s.enableNegative
  const bgColor = isNeg ? "#000000" : "#ffffff"
  const textColor = isNeg ? "#ffffff" : "#000000"
  const baseLineColor = isNeg ? "#ffffff" : "#000000"
  const progressColor = isNeg ? "#ffffff" : "#000000"
  const chapterMarkColor = isNeg ? "#ffffff" : "#000000"

  ctx.fillStyle = bgColor
  ctx.fillRect(0, baseY, screenW, barHeight)

  const fontSize = s.progressFontSize || 10
  ctx.font = `${fontSize}px sans-serif`
  ctx.textBaseline = "middle"

  let leftText = ""
  if (s.showChapterPage || s.showChapterPercent) {
    const ci = getChapterInfoForPage(currentPage, toc, totalPages)
    if (ci) {
      const chapterPages = ci.endPage - ci.startPage + 1
      const pageInChapter = currentPage - ci.startPage + 1
      const parts: string[] = []
      if (s.showChapterPage) parts.push(`${pageInChapter}/${chapterPages}`)
      if (s.showChapterPercent) parts.push(`${Math.round((pageInChapter / chapterPages) * 100)}%`)
      leftText = parts.join("  ")
    }
  }

  let rightText = ""
  const rightParts: string[] = []
  if (s.showPageInfo) rightParts.push(`${currentPage + 1}/${totalPages}`)
  if (s.showBookPercent) rightParts.push(`${Math.round(((currentPage + 1) / totalPages) * 100)}%`)
  rightText = rightParts.join("  ")

  const leftW = leftText ? ctx.measureText(leftText).width : 0
  const rightW = rightText ? ctx.measureText(rightText).width : 0

  let barStartX: number, barEndX: number, barWidth: number, lineY: number

  if (s.progressFullWidth && hasProgressLine) {
    lineY = baseY + 4
    const textY = baseY + barHeight - fontSize / 2 - 1
    barStartX = padding; barEndX = screenW - padding; barWidth = barEndX - barStartX
    if (leftText) { ctx.fillStyle = textColor; ctx.textAlign = "left"; ctx.fillText(leftText, padding, textY) }
    if (rightText) { ctx.fillStyle = textColor; ctx.textAlign = "right"; ctx.fillText(rightText, screenW - padding, textY) }
  } else {
    lineY = centerY
    barStartX = padding + (leftText ? leftW + 12 : 0)
    barEndX = screenW - padding - (rightText ? rightW + 12 : 0)
    barWidth = barEndX - barStartX
    if (leftText) { ctx.fillStyle = textColor; ctx.textAlign = "left"; ctx.fillText(leftText, padding, centerY) }
    if (rightText) { ctx.fillStyle = textColor; ctx.textAlign = "right"; ctx.fillText(rightText, screenW - padding, centerY) }
  }

  if (s.showProgressLine && barWidth > 0) {
    ctx.strokeStyle = baseLineColor; ctx.lineWidth = lineThickness
    ctx.beginPath(); ctx.moveTo(barStartX, lineY); ctx.lineTo(barEndX, lineY); ctx.stroke()
    const progress = (currentPage + 1) / totalPages
    ctx.strokeStyle = progressColor; ctx.lineWidth = progressThickness
    ctx.beginPath(); ctx.moveTo(barStartX, lineY); ctx.lineTo(barStartX + barWidth * progress, lineY); ctx.stroke()
    if (s.showChapterMarks) {
      const positions = getChapterPositions(toc, totalPages)
      ctx.strokeStyle = chapterMarkColor; ctx.lineWidth = 1
      for (const pos of positions) {
        const markX = barStartX + pos * barWidth
        if (markX >= barStartX && markX <= barEndX) {
          ctx.beginPath(); ctx.moveTo(markX, lineY - chapterMarkHeight / 2); ctx.lineTo(markX, lineY + chapterMarkHeight / 2); ctx.stroke()
        }
      }
    }
  }

  if (s.showChapterProgress && barWidth > 0) {
    const ci = getChapterInfoForPage(currentPage, toc, totalPages)
    if (ci) {
      const chapterPages = ci.endPage - ci.startPage + 1
      const chapterProgress = (currentPage - ci.startPage + 1) / chapterPages
      if (!s.showProgressLine) {
        ctx.strokeStyle = baseLineColor; ctx.lineWidth = lineThickness
        ctx.beginPath(); ctx.moveTo(barStartX, lineY); ctx.lineTo(barEndX, lineY); ctx.stroke()
      }
      const chapterY = s.showProgressLine ? lineY + 9 : lineY
      ctx.strokeStyle = progressColor; ctx.lineWidth = s.showProgressLine ? 2 : progressThickness
      ctx.beginPath(); ctx.moveTo(barStartX, chapterY); ctx.lineTo(barStartX + barWidth * chapterProgress, chapterY); ctx.stroke()
    }
  }
}
