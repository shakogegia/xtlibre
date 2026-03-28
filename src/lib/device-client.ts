/**
 * Browser-side WebSocket client for Xteink e-reader (CrossPoint protocol).
 *
 * Protocol:
 *   1. Connect ws://<host>:<port>/
 *   2. Send text: START:<filename>:<size>:<path>
 *   3. Wait for READY
 *   4. Send binary frames (chunked)
 *   5. Wait for DONE or ERROR:<message>
 */

export interface RememberedDevice {
  label?: string
  host: string
  port: number
}

export interface DeviceUploadOptions {
  host: string
  port: number
  uploadPath: string
  filename: string
  data: ArrayBuffer
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

export class DeviceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DeviceError"
  }
}

const CHUNK_SIZE = 2048 // Device firmware buffer limit (matches Calibre plugin cap)

export async function uploadToDevice(options: DeviceUploadOptions): Promise<void> {
  const { host, port, uploadPath, filename, data, onProgress, signal } = options

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DeviceError("Upload cancelled"))
      return
    }

    const ws = new WebSocket(`ws://${host}:${port}/`)
    ws.binaryType = "arraybuffer"
    let done = false

    const cleanup = () => {
      done = true
      try { ws.close() } catch {}
    }

    const onAbort = () => {
      cleanup()
      reject(new DeviceError("Upload cancelled"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })

    const timeout = setTimeout(() => {
      if (!done) {
        cleanup()
        reject(new DeviceError("Connection timed out"))
      }
    }, 10000)

    ws.onopen = () => {
      clearTimeout(timeout)
      ws.send(`START:${filename}:${data.byteLength}:${uploadPath}`)
    }

    ws.onmessage = (event) => {
      const msg = typeof event.data === "string" ? event.data : ""

      if (msg === "READY") {
        let sent = 0
        const sendNextChunk = () => {
          if (done) return
          if (sent >= data.byteLength) return

          // Backpressure: wait if the WebSocket buffer hasn't drained
          if (ws.bufferedAmount > CHUNK_SIZE * 8) {
            setTimeout(sendNextChunk, 50)
            return
          }

          const end = Math.min(sent + CHUNK_SIZE, data.byteLength)
          const chunk = data.slice(sent, end)
          ws.send(chunk)
          sent = end
          onProgress?.(sent, data.byteLength)

          if (sent < data.byteLength) {
            setTimeout(sendNextChunk, 10)
          }
        }
        sendNextChunk()
        return
      }

      if (msg === "DONE") {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        resolve()
        return
      }

      if (msg.startsWith("ERROR")) {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        reject(new DeviceError(msg.slice(6) || "Device error"))
        return
      }
    }

    ws.onerror = () => {
      if (!done) {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        reject(new DeviceError(`Could not connect to device at ${host}:${port}`))
      }
    }

    ws.onclose = (event) => {
      if (!done) {
        cleanup()
        signal?.removeEventListener("abort", onAbort)
        reject(new DeviceError(event.reason || "Connection closed unexpectedly"))
      }
    }
  })
}

export async function testDeviceConnection(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}/`)
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      resolve(false)
    }, 5000)

    ws.onopen = () => {
      clearTimeout(timeout)
      ws.close()
      resolve(true)
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      resolve(false)
    }
  })
}
