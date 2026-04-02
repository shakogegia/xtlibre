export interface DeviceFile {
  name: string
  size: number
  isDirectory: boolean
  isEpub: boolean
}

export interface DeviceFileOps {
  listFiles(host: string, path: string): Promise<DeviceFile[]>
  deleteFile(host: string, path: string): Promise<void>
  mkdir(host: string, path: string, name: string): Promise<void>
  rename(host: string, path: string, newName: string): Promise<void>
  upload(host: string, path: string, file: File, onProgress?: (pct: number) => void): Promise<void>
  move(host: string, path: string, dest: string): Promise<void>
}

// ─── Direct implementation (browser → device HTTP on port 80) ────────────────

function xhrUpload(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
  timeoutMs = 120000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.timeout = timeoutMs

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error("Upload network error"))
    xhr.ontimeout = () => reject(new Error("Upload timed out"))

    xhr.send(formData)
  })
}

function createDirectOps(): DeviceFileOps {
  return {
    async listFiles(host, path) {
      const url = `http://${host}/api/files?path=${encodeURIComponent(path)}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!resp.ok) throw new Error(`Device returned ${resp.status}`)
      return resp.json()
    },

    async deleteFile(host, path) {
      const url = `http://${host}/delete`
      const params = new URLSearchParams({ path, type: "file" })
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`)
    },

    async mkdir(host, path, name) {
      const url = `http://${host}/mkdir`
      const params = new URLSearchParams({ name, path })
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) throw new Error(`Create folder failed: ${resp.status}`)
    },

    async rename(host, path, newName) {
      const url = `http://${host}/rename`
      const params = new URLSearchParams({ path, name: newName })
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) throw new Error(`Rename failed: ${resp.status}`)
    },

    async upload(host, path, file, onProgress) {
      const url = `http://${host}/upload?path=${encodeURIComponent(path)}`
      const formData = new FormData()
      formData.append("file", file)
      await xhrUpload(url, formData, onProgress, 120000)
    },

    async move(host, path, dest) {
      const url = `http://${host}/move`
      const params = new URLSearchParams({ path, dest })
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) throw new Error(`Move failed: ${resp.status}`)
    },
  }
}

// ─── Relay implementation (browser → Next.js server proxy) ───────────────────

async function relayFetch(url: string, body: Record<string, unknown>): Promise<void> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `Request failed: ${resp.status}` }))
    throw new Error(data.error || `Request failed: ${resp.status}`)
  }
}

function createRelayOps(): DeviceFileOps {
  return {
    async listFiles(host, path) {
      const resp = await fetch("/api/device/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, path }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: `Request failed: ${resp.status}` }))
        throw new Error(data.error || `Request failed: ${resp.status}`)
      }
      return resp.json()
    },

    async deleteFile(host, path) {
      await relayFetch("/api/device/files/delete", { host, path })
    },

    async mkdir(host, path, name) {
      await relayFetch("/api/device/files/mkdir", { host, path, name })
    },

    async rename(host, path, newName) {
      await relayFetch("/api/device/files/rename", { host, path, name: newName })
    },

    async upload(host, path, file, onProgress) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("host", host)
      formData.append("path", path)
      await xhrUpload("/api/device/files/upload", formData, onProgress, 120000)
    },

    async move(host, path, dest) {
      await relayFetch("/api/device/files/move", { host, path, dest })
    },
  }
}

// ─── Singleton instances + factory ───────────────────────────────────────────

const directOps = createDirectOps()
const relayOps = createRelayOps()

export function getDeviceOps(mode: "direct" | "relay"): DeviceFileOps {
  return mode === "direct" ? directOps : relayOps
}
