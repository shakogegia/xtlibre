# Device Ops Abstraction + On-Device Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstract device file operations behind a mode-aware interface (direct vs relay), and show "On device" badges on library items.

**Architecture:** A `DeviceFileOps` interface with `createDirectOps()` and `createRelayOps()` factory functions. `DeviceFileBrowser` and `DeviceContext` call `getDeviceOps(mode)` to get the right implementation. The context tracks filenames on the device's upload path and exposes them for the library badge.

**Tech Stack:** TypeScript, React, Next.js API routes (relay mode only)

---

### Task 1: Create `device-ops.ts` — the abstraction layer

**Files:**
- Create: `src/lib/device-ops.ts`

- [ ] **Step 1: Create the interface and both implementations**

Create `src/lib/device-ops.ts`:

```ts
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

function createDirectOps(): DeviceFileOps {
  const TIMEOUT = 10000

  return {
    async listFiles(host, path) {
      const url = `http://${host}/api/files?path=${encodeURIComponent(path)}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
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
        signal: AbortSignal.timeout(TIMEOUT),
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
        signal: AbortSignal.timeout(TIMEOUT),
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
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!resp.ok) throw new Error(`Rename failed: ${resp.status}`)
    },

    async upload(host, path, file, onProgress) {
      const formData = new FormData()
      formData.append("file", file)
      const url = `http://${host}/upload?path=${encodeURIComponent(path)}`

      // Use XMLHttpRequest for progress tracking
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable && onProgress) {
            onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)))
          }
        })
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100)
            resolve()
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        })
        xhr.addEventListener("error", () => reject(new Error("Upload failed")))
        xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")))
        xhr.timeout = 120000
        xhr.open("POST", url)
        xhr.send(formData)
      })
    },

    async move(host, path, dest) {
      const url = `http://${host}/move`
      const params = new URLSearchParams({ path, dest })
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!resp.ok) throw new Error(`Move failed: ${resp.status}`)
    },
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
        const data = await resp.json().catch(() => ({ error: "Request failed" }))
        throw new Error(data.error || `HTTP ${resp.status}`)
      }
      return resp.json()
    },

    async deleteFile(host, path) {
      const resp = await fetch("/api/device/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, path }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Delete failed" }))
        throw new Error(data.error)
      }
    },

    async mkdir(host, path, name) {
      const resp = await fetch("/api/device/files/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, path, name }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Create failed" }))
        throw new Error(data.error)
      }
    },

    async rename(host, path, newName) {
      const resp = await fetch("/api/device/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, path, name: newName }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Rename failed" }))
        throw new Error(data.error)
      }
    },

    async upload(host, path, file, onProgress) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("host", host)
      formData.append("path", path)

      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable && onProgress) {
            onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)))
          }
        })
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100)
            resolve()
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        })
        xhr.addEventListener("error", () => reject(new Error("Upload failed")))
        xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")))
        xhr.timeout = 120000
        xhr.open("POST", "/api/device/files/upload")
        xhr.send(formData)
      })
    },

    async move(host, path, dest) {
      const resp = await fetch("/api/device/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, path, dest }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Move failed" }))
        throw new Error(data.error)
      }
    },
  }
}

const directOps = createDirectOps()
const relayOps = createRelayOps()

export function getDeviceOps(mode: "direct" | "relay"): DeviceFileOps {
  return mode === "direct" ? directOps : relayOps
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/device-ops.ts
git commit -m "feat(device): add device file ops abstraction with direct/relay implementations"
```

---

### Task 2: Refactor `DeviceFileBrowser` to use `device-ops`

**Files:**
- Modify: `src/components/converter/device-file-browser.tsx`
- Modify: `src/components/converter/device-tab.tsx` (pass `transferMode`)

- [ ] **Step 1: Update DeviceFileBrowser props and imports**

In `device-file-browser.tsx`, add `transferMode` prop and import `getDeviceOps`:

```ts
import { getDeviceOps, type DeviceFile } from "@/lib/device-ops"

interface DeviceFileBrowserProps {
  host: string
  port: number
  transferMode: "direct" | "relay"
}
```

Remove the local `DeviceFile` interface (now imported from `device-ops`).

- [ ] **Step 2: Replace all inline fetch calls with `ops` calls**

At the top of the component function, get the ops:

```ts
const ops = useMemo(() => getDeviceOps(transferMode), [transferMode])
```

Replace each fetch call:

**`loadFiles`** — replace the body of the try block:
```ts
const entries = await ops.listFiles(host, path)
entries.sort((a, b) => {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
  return a.name.localeCompare(b.name)
})
setFiles(entries)
```
Remove `port` from the dependency array (not needed by ops).

**`handleDelete`** — replace:
```ts
await ops.deleteFile(host, deleteTarget.path)
```

**`handleCreateFolder`** — replace:
```ts
await ops.mkdir(host, currentPath, name)
```

**`handleRename`** — replace:
```ts
await ops.rename(host, renameTarget.path, name)
```

**`handleUpload`** — replace the XHR block with:
```ts
setUploading(true)
setUploadProgress(0)
try {
  await ops.upload(host, currentPath, file, (pct) => setUploadProgress(pct))
  loadFiles(currentPath)
} catch {
  // error handled silently
} finally {
  setUploading(false)
  setUploadProgress(0)
  if (fileInputRef.current) fileInputRef.current.value = ""
}
```

**`loadMoveFolders`** — replace:
```ts
const data = await ops.listFiles(host, path)
const dirs = data.filter((f) => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
setMoveFolders(dirs)
```

**`handleMove`** — replace:
```ts
await ops.move(host, moveTarget.path, moveDest)
```

- [ ] **Step 3: Pass `transferMode` from DeviceTab**

In `device-tab.tsx`, change the `DeviceFileBrowser` usage:

```tsx
<DeviceFileBrowser host={s.deviceHost} port={s.devicePort} transferMode={s.deviceTransferMode} />
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/components/converter/device-file-browser.tsx src/components/converter/device-tab.tsx
git commit -m "refactor(device): use device-ops abstraction in file browser"
```

---

### Task 3: Add device file tracking to `DeviceContext`

**Files:**
- Modify: `src/contexts/device-context.tsx`

- [ ] **Step 1: Add `deviceFileNames` state and `refreshDeviceFiles` action**

Add to the context value interface:

```ts
deviceFileNames: Set<string>
refreshDeviceFiles: () => Promise<void>
```

Add to the provider:

```ts
import { getDeviceOps } from "@/lib/device-ops"
```

Add state:

```ts
const [deviceFileNames, setDeviceFileNames] = useState<Set<string>>(new Set())
```

Add the refresh function:

```ts
const refreshDeviceFiles = useCallback(async () => {
  if (!settings.deviceHost) {
    setDeviceFileNames(new Set())
    return
  }
  try {
    const ops = getDeviceOps(settings.deviceTransferMode)
    const files = await ops.listFiles(settings.deviceHost, settings.deviceUploadPath)
    setDeviceFileNames(new Set(files.filter(f => !f.isDirectory).map(f => f.name)))
  } catch {
    // Silently fail — badge just won't show
  }
}, [settings.deviceHost, settings.deviceUploadPath, settings.deviceTransferMode])
```

Note: `settings` here refers to the props passed to `DeviceProvider`. The provider currently receives `settings` and `updateSettings`. We need to destructure the specific fields from `settings`:
- `settings.deviceHost`
- `settings.deviceUploadPath`  
- `settings.deviceTransferMode`

These are already available via the `settings` prop.

- [ ] **Step 2: Trigger refresh when device becomes reachable**

Add an effect after the existing initial check effect:

```ts
useEffect(() => {
  if (connectionStatus === "reachable") {
    refreshDeviceFiles()
  } else {
    setDeviceFileNames(new Set())
  }
}, [connectionStatus, refreshDeviceFiles])
```

- [ ] **Step 3: Clear on disconnect**

In the `disconnect` callback, add:

```ts
setDeviceFileNames(new Set())
```

- [ ] **Step 4: Expose in context value**

Add `deviceFileNames` and `refreshDeviceFiles` to the `useMemo` value object and the `DeviceContextValue` interface.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/device-context.tsx
git commit -m "feat(device): track device file names in context for on-device badge"
```

---

### Task 4: Add "On device" badge to library items

**Files:**
- Modify: `src/components/converter/library-tab.tsx`
- Modify: `src/components/converter/sidebar.tsx`
- Modify: `src/components/converter/converter.tsx`

- [ ] **Step 1: Add `deviceFileNames` prop to `LibraryTab`**

In `library-tab.tsx`, add to `LibraryTabProps`:

```ts
deviceFileNames: Set<string>
```

Add to the destructured props.

- [ ] **Step 2: Add filename matching helper and badge rendering**

Inside `LibraryTab`, add a helper before the return:

```ts
const isOnDevice = (book: LibraryBook): boolean => {
  if (!book.filename || deviceFileNames.size === 0) return false
  const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
  const nameBase = book.author ? `${book.title} - ${book.author}` : book.title
  const sanitized = nameBase.replace(/[^a-zA-Z0-9 ._-]/g, "_").substring(0, 80).trim() + ext
  return deviceFileNames.has(sanitized)
}
```

In the book row's badge area (inside the `<div className="flex gap-1">` after the EPUB and XTC badges), add:

```tsx
{isOnDevice(book) && (
  <Badge variant="outline" className="h-auto text-[9px] px-1 py-0 text-emerald-600 border-emerald-600/30">On device</Badge>
)}
```

- [ ] **Step 3: Thread prop through `Sidebar`**

In `sidebar.tsx`, add `deviceFileNames: Set<string>` to `SidebarProps` and pass it to `LibraryTab`:

```tsx
<LibraryTab
  ...existing props...
  deviceFileNames={deviceFileNames}
/>
```

- [ ] **Step 4: Pass `deviceFileNames` from `Converter`**

In `converter.tsx`, get `deviceFileNames` from the device context:

```ts
const { deviceFileNames } = useDevice()
```

Wait — check if `converter.tsx` already uses `useDevice()`. Search for it.

If not, it may get device state via the `DeviceProvider` wrapping. The converter needs to pass `deviceFileNames` to `Sidebar`. If `useDevice()` isn't used in `converter.tsx`, add:

```ts
import { useDevice } from "@/contexts/device-context"
```

And in the component body:

```ts
const { deviceFileNames, refreshDeviceFiles } = useDevice()
```

Then pass to `Sidebar`:

```tsx
<Sidebar
  ...existing props...
  deviceFileNames={deviceFileNames}
/>
```

- [ ] **Step 5: Refresh after successful `sendToDevice`**

In `converter.tsx`, in the `sendToDevice` callback, after the success toast (both relay and direct branches), add:

```ts
refreshDeviceFiles()
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add src/components/converter/library-tab.tsx src/components/converter/sidebar.tsx src/components/converter/converter.tsx
git commit -m "feat(library): show 'On device' badge for books present on connected device"
```
