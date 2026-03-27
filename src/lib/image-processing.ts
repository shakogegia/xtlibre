export function applyDitheringSyncToData(
  data: Uint8ClampedArray, width: number, height: number,
  bits: number, strength: number, xthMode = false
) {
  const factor = strength / 100
  const pixelCount = width * height
  const err7_16 = factor * 7 / 16, err3_16 = factor * 3 / 16
  const err5_16 = factor * 5 / 16, err1_16 = factor * 1 / 16

  let quantize: (val: number) => number
  if (xthMode) {
    quantize = (val) => val > 212 ? 255 : val > 127 ? 170 : val > 42 ? 85 : 0
  } else {
    const levels = Math.pow(2, bits)
    const step = 255 / (levels - 1), invStep = 1 / step
    quantize = (val) => Math.round(val * invStep) * step
  }

  const gray = new Float32Array(pixelCount)
  for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4)
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]

  const widthM1 = width - 1, heightM1 = height - 1
  for (let y = 0; y < height; y++) {
    const row = y * width, next = row + width, notLast = y < heightM1
    for (let x = 0; x < width; x++) {
      const idx = row + x, old = gray[idx], nw = quantize(old)
      gray[idx] = nw; const err = old - nw
      if (x < widthM1) gray[idx + 1] += err * err7_16
      if (notLast) {
        if (x > 0) gray[next + x - 1] += err * err3_16
        gray[next + x] += err * err5_16
        if (x < widthM1) gray[next + x + 1] += err * err1_16
      }
    }
  }
  for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
    const g = gray[i] < 0 ? 0 : gray[i] > 255 ? 255 : (gray[i] + 0.5) | 0
    data[idx] = data[idx + 1] = data[idx + 2] = g
  }
}

export function quantizeImageData(
  data: Uint8ClampedArray, bits: number, xthMode = false
) {
  const len = data.length
  if (xthMode) {
    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const q = gray > 212 ? 255 : gray > 127 ? 170 : gray > 42 ? 85 : 0
      data[i] = data[i + 1] = data[i + 2] = q
    }
  } else {
    const levels = Math.pow(2, bits), step = 255 / (levels - 1), inv = 1 / step
    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const q = ((gray * inv + 0.5) | 0) * step
      data[i] = data[i + 1] = data[i + 2] = q
    }
  }
}

export function applyNegativeToData(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2]
  }
}

export function generateXtgData(canvas: HTMLCanvasElement, bits: number): ArrayBuffer {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const imgData = ctx.getImageData(0, 0, w, h)
  const data = imgData.data

  function writeHeader(view: DataView, dataSize: number, bitCode: number) {
    view.setUint8(0, 0x58); view.setUint8(1, 0x54); view.setUint8(2, 0x47); view.setUint8(3, 0x00)
    view.setUint16(4, w, true); view.setUint16(6, h, true)
    view.setUint8(8, 0); view.setUint8(9, bitCode); view.setUint32(10, dataSize, true)
  }

  if (bits === 1) {
    const bpr = (w + 7) >> 3, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 0)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 8) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 8, w); bx++) {
          if (data[pi] >= 128) byte |= (1 << (7 - (bx - x)))
          pi += 4
        }
        arr[ro + (x >> 3)] = byte
      }
    }
    return buf
  } else if (bits === 2) {
    const bpr = (w + 3) >> 2, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 1)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 4) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 4, w); bx++) {
          byte |= ((data[pi] >> 6) << ((3 - (bx - x)) * 2))
          pi += 4
        }
        arr[ro + (x >> 2)] = byte
      }
    }
    return buf
  } else {
    const bpr = (w + 1) >> 1, ds = bpr * h
    const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)
    writeHeader(v, ds, 2)
    let pi = 0
    for (let y = 0; y < h; y++) {
      const ro = 22 + y * bpr
      for (let x = 0; x < w; x += 2) {
        let byte = 0
        for (let bx = x; bx < Math.min(x + 2, w); bx++) {
          byte |= ((data[pi] >> 4) << ((1 - (bx - x)) * 4))
          pi += 4
        }
        arr[ro + (x >> 1)] = byte
      }
    }
    return buf
  }
}

export function generateXthData(canvas: HTMLCanvasElement): ArrayBuffer {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, w, h).data
  const bpc = Math.ceil(h / 8), planeSize = bpc * w, ds = planeSize * 2
  const buf = new ArrayBuffer(22 + ds), v = new DataView(buf), arr = new Uint8Array(buf)

  v.setUint8(0, 0x58); v.setUint8(1, 0x54); v.setUint8(2, 0x48); v.setUint8(3, 0x00)
  v.setUint16(4, w, true); v.setUint16(6, h, true)
  v.setUint8(8, 0); v.setUint8(9, 0); v.setUint32(10, ds, true)

  const p1 = 22, p2 = 22 + planeSize
  for (let x = w - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) {
      const gray = data[(y * w + x) * 4]
      const val = gray > 212 ? 0 : gray > 127 ? 2 : gray > 42 ? 1 : 3
      const colIdx = w - 1 - x, byteIdx = colIdx * bpc + Math.floor(y / 8), bitIdx = 7 - (y % 8)
      if ((val >> 1) & 1) arr[p1 + byteIdx] |= (1 << bitIdx)
      if (val & 1) arr[p2 + byteIdx] |= (1 << bitIdx)
    }
  }
  return buf
}

export function downloadFile(data: ArrayBuffer, filename: string) {
  const blob = new Blob([data], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}
