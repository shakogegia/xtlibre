export interface XtcChapter {
  name: string
  startPage: number
  endPage: number
}

export interface AssembleXtcParams {
  pages: ArrayBuffer[]
  title: string
  author: string
  chapters: XtcChapter[]
  deviceWidth: number
  deviceHeight: number
  isHQ: boolean
}

export function assembleXtc(params: AssembleXtcParams): ArrayBuffer {
  const { pages, title, author, chapters, deviceWidth: dw, deviceHeight: dh, isHQ } = params
  const pageCount = pages.length

  const headerSize = 56
  const metadataSize = 256
  const chapterEntrySize = 96
  const indexEntrySize = 16
  const chapterCount = chapters.length

  let totalDataSize = 0
  for (const p of pages) totalDataSize += p.byteLength

  const metaOffset = headerSize
  const chapOffset = metaOffset + metadataSize
  const indexOffset = chapOffset + chapterCount * chapterEntrySize
  const dataOffset = indexOffset + pageCount * indexEntrySize
  const totalSize = dataOffset + totalDataSize

  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const arr = new Uint8Array(buf)

  // Header
  view.setUint8(0, 0x58); view.setUint8(1, 0x54); view.setUint8(2, 0x43)
  view.setUint8(3, isHQ ? 0x48 : 0x00)
  view.setUint16(4, 1, true); view.setUint16(6, pageCount, true)
  view.setUint8(8, 0); view.setUint8(9, 1); view.setUint8(10, 0)
  view.setUint8(11, chapterCount > 0 ? 1 : 0); view.setUint32(12, 1, true)

  view.setBigUint64(16, BigInt(metaOffset), true)
  view.setBigUint64(24, BigInt(indexOffset), true)
  view.setBigUint64(32, BigInt(dataOffset), true)
  view.setBigUint64(40, BigInt(0), true)
  view.setBigUint64(48, BigInt(chapOffset), true)

  // Metadata
  const enc = new TextEncoder()
  const titleBytes = enc.encode(title || "Untitled")
  const authorBytes = enc.encode(author || "Unknown")
  for (let i = 0; i < Math.min(titleBytes.length, 127); i++) arr[metaOffset + i] = titleBytes[i]
  for (let i = 0; i < Math.min(authorBytes.length, 63); i++) arr[metaOffset + 0x80 + i] = authorBytes[i]

  view.setUint32(metaOffset + 0xF0, Math.floor(Date.now() / 1000), true)
  view.setUint16(metaOffset + 0xF4, 0, true)
  view.setUint16(metaOffset + 0xF6, chapterCount, true)

  // Chapter index
  for (let i = 0; i < chapters.length; i++) {
    const co = chapOffset + i * chapterEntrySize
    const nb = enc.encode(chapters[i].name)
    for (let j = 0; j < Math.min(nb.length, 79); j++) arr[co + j] = nb[j]
    view.setUint16(co + 0x50, chapters[i].startPage + 1, true)
    view.setUint16(co + 0x52, chapters[i].endPage + 1, true)
  }

  // Page index
  let absOff = dataOffset
  for (let i = 0; i < pageCount; i++) {
    const iea = indexOffset + i * indexEntrySize
    view.setBigUint64(iea, BigInt(absOff), true)
    view.setUint32(iea + 8, pages[i].byteLength, true)
    view.setUint16(iea + 12, dw, true); view.setUint16(iea + 14, dh, true)
    absOff += pages[i].byteLength
  }

  // Page data
  let wo = dataOffset
  for (let i = 0; i < pageCount; i++) {
    arr.set(new Uint8Array(pages[i]), wo)
    wo += pages[i].byteLength
  }

  return buf
}
