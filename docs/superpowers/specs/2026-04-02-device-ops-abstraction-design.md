# Device File Operations Abstraction + On-Device Badge

## Problem

The `DeviceFileBrowser` currently routes all file operations (list, delete, mkdir, rename, upload, move) through server-side API routes (`/api/device/files/*`). This is incorrect for **Direct mode**, where the browser communicates with the device directly — the server may be on a different network entirely.

Additionally, there's no indication in the Library tab of which books already exist on a connected device.

## Design

### Device File Operations Interface

A single abstraction in `src/lib/device-ops.ts` with two implementations selected by connection mode:

```ts
interface DeviceFileOps {
  listFiles(host: string, path: string): Promise<DeviceFile[]>
  deleteFile(host: string, path: string): Promise<void>
  mkdir(host: string, path: string, name: string): Promise<void>
  rename(host: string, path: string, newName: string): Promise<void>
  upload(host: string, path: string, file: File, onProgress?: (pct: number) => void): Promise<void>
  move(host: string, path: string, dest: string): Promise<void>
}
```

**Direct implementation** — browser fetches `http://${host}/api/files`, `http://${host}/api/files/delete`, etc. directly. Same mixed-content constraints as WebSocket (blocked on HTTPS pages).

**Relay implementation** — browser fetches `/api/device/files`, `/api/device/files/delete`, etc. (existing server proxy routes, unchanged).

A factory function selects the implementation:

```ts
function getDeviceOps(mode: "direct" | "relay"): DeviceFileOps
```

### DeviceFileBrowser Changes

- Receives `transferMode` prop (from settings via DeviceTab)
- Calls `getDeviceOps(transferMode)` and uses the returned interface for all operations
- No mode-specific logic inside the component itself

### DeviceContext Changes

- Add `deviceFiles: Set<string>` state — set of filenames on the device's upload path
- When `connectionStatus` becomes `"reachable"`, fetch files from the upload path using `getDeviceOps(mode).listFiles(host, uploadPath)`
- Export `refreshDeviceFiles()` action so it can be called after successful transfers
- Needs access to `settings.deviceUploadPath` and `settings.deviceTransferMode`

### On-Device Badge in Library Tab

- `LibraryTab` receives `deviceFileNames: Set<string>` prop
- For each library book with a `.filename` (has XTC), reconstruct the device filename using the same sanitization as `sendToDevice`:
  ```ts
  const ext = book.filename.endsWith(".xtch") ? ".xtch" : ".xtc"
  const nameBase = book.author ? `${book.title} - ${book.author}` : book.title
  const sanitized = nameBase.replace(/[^a-zA-Z0-9 ._-]/g, "_").substring(0, 80).trim() + ext
  ```
- If `deviceFileNames.has(sanitized)`, show a badge: `<Badge>On device</Badge>`
- Badge appears alongside existing EPUB/XTC badges

### Converter Changes

- After successful `sendToDevice`, call `refreshDeviceFiles()` from DeviceContext
- Pass `deviceFileNames` through Sidebar → LibraryTab

## Files Changed

| File | Change |
|------|--------|
| `src/lib/device-ops.ts` | **New** — interface + direct/relay implementations |
| `src/lib/device-client.ts` | No change (WebSocket transfer stays separate) |
| `src/contexts/device-context.ts` | Add `deviceFiles` state, `refreshDeviceFiles` action, needs settings props |
| `src/components/converter/device-file-browser.tsx` | Use `getDeviceOps()` instead of inline fetch calls |
| `src/components/converter/device-tab.tsx` | Pass `transferMode` to DeviceFileBrowser |
| `src/components/converter/library-tab.tsx` | Add `deviceFileNames` prop, render badge |
| `src/components/converter/sidebar.tsx` | Thread `deviceFileNames` prop |
| `src/components/converter/converter.tsx` | Call `refreshDeviceFiles` after send, pass `deviceFileNames` |

## Device HTTP API Assumptions

The device's HTTP API (port 80) supports:
- `GET /api/files?path=...` — list files
- `POST /api/files/delete` with `{ path }` — delete
- `POST /api/files/mkdir` with `{ path, name }` — create folder
- `POST /api/files/rename` with `{ path, name }` — rename
- `POST /api/files/upload` with multipart form data — upload
- `POST /api/files/move` with `{ path, dest }` — move

These are inferred from the existing server proxy routes which forward to `http://${host}/api/...`. If the device API shape differs, the direct implementation will need adjustment.

## CORS Consideration

In direct mode, browser fetch to `http://${host}/api/...` requires CORS headers from the device. If the device doesn't serve them, direct file operations will fail. The UI already handles errors gracefully (error messages, retry buttons). No special fallback to relay mode — the user chose direct mode for a reason.
