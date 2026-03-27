# Send to Device — Design Spec

Upload XTC/XTCH files from XTLibre directly to an Xteink e-reader (X4, X3) over the local network.

## Protocol

The Xteink device runs a web server with WebSocket support (based on the [CrossPoint Reader Calibre plugin](https://github.com/crosspoint-reader/calibre-plugins)):

- **UDP Discovery**: Broadcast `hello` on ports `[8134, 54982, 48123, 39001, 44044, 59678]`. Device responds with `<ip>;<ws_port>`.
- **WebSocket Upload** (default port 81):
  1. Connect to `ws://<host>:<port>/`
  2. Send text: `START:<filename>:<size>:<path>`
  3. Wait for `READY`
  4. Send binary frames (chunked file data, 16 KB chunks)
  5. Wait for `DONE` or `ERROR:<message>`
- **HTTP API** on device:
  - `GET /api/files?path=<path>` — list files
  - `POST /mkdir` — create directory (`name`, `path` form fields)
  - `POST /delete` — delete file (`path`, `type` form fields)
  - `GET /download?path=<path>` — download file

## Transfer Modes

Two configurable modes to handle different network topologies:

### Direct (browser -> device)

Browser fetches the XTC file from the server via HTTP, then opens a WebSocket to the device and streams it. Works when the user's browser is on the same WiFi as the device, even if the server is remote.

Flow:
```
Browser --HTTP GET--> Server (fetch XTC)
Browser --WebSocket--> Device (stream XTC)
```

### Relay (server -> device)

Server reads the XTC file from disk and streams it directly to the device over WebSocket. More efficient (single hop, no browser memory usage), but requires the server to be on the same network as the device.

Flow:
```
Browser --POST /api/device/send--> Server --WebSocket--> Device
Browser <--SSE progress-- Server
```

Default mode: **Direct** (works in more network scenarios).

## UI Changes

### New: Device Tab (4th sidebar tab)

A new tab in the sidebar alongside Library, Options, and Calibre. Icon: `Smartphone` from lucide-react.

**Sections:**

1. **Device Connection**
   - IP address text input (placeholder: `192.168.4.1`)
   - Port number input (default: `81`, range 1-65535)
   - Upload path input (default: `/`)
   - "Scan" button — triggers server-side UDP discovery, populates IP/port if found
   - Connection status indicator (green dot = reachable, gray = unknown, red = unreachable)
   - "Test Connection" button — quick WebSocket handshake to verify connectivity

2. **Transfer Mode**
   - Toggle/select between "Direct" and "Relay"
   - Brief description under each option explaining when to use it

3. **Remembered Devices**
   - Dropdown of previously connected devices (IP:port pairs with optional label)
   - Select to populate the connection fields
   - Delete button to remove saved entries

4. **Active Transfer**
   - Shown only during an active upload
   - File name, progress bar, percentage, transfer speed
   - Cancel button

### Library Tab Changes

- XTC and XTCH books get a new "Send to Device" icon button (lucide `Send` or `Upload` icon)
- Button is placed next to the existing download button
- **Disabled state**: When no device is configured (no IP set), button is grayed out with tooltip "Configure device in Device tab"
- **During transfer**: Button shows a spinner, other send buttons are disabled (one transfer at a time)
- **Success**: Toast notification "Sent {title} to device"
- **Failure**: Toast with error message from device or connection failure

### Post-Generation Hook

After XTC generation completes and the file is saved to the library, if a device is configured, show a toast with a "Send to Device" action button. Clicking it triggers the send flow for the just-generated file.

## API Routes

### `POST /api/device/discover`

Server-side UDP discovery. Broadcasts `hello` on the known discovery ports, listens for responses.

**Request**: Empty body (or optional `{ extraHosts?: string[] }` to add directed broadcasts)

**Response**:
```json
{
  "devices": [
    { "host": "192.168.1.42", "port": 81 }
  ]
}
```

Returns empty array if no devices found within 3 second timeout. Multiple broadcast rounds (3 attempts as per the reference implementation).

### `POST /api/device/send`

Relay mode only. Server reads XTC from disk and streams to device via WebSocket.

**Request**:
```json
{
  "bookId": "uuid",
  "host": "192.168.1.42",
  "port": 81,
  "uploadPath": "/"
}
```

**Response**: Server-Sent Events stream:
```
data: {"type":"progress","sent":16384,"total":1048576}
data: {"type":"progress","sent":32768,"total":1048576}
data: {"type":"done"}
```
Or on error:
```
data: {"type":"error","message":"Connection refused"}
```

### `GET /api/device/status`

Quick connectivity check. Attempts WebSocket handshake with the device, closes immediately.

**Query params**: `host`, `port`

**Response**:
```json
{ "reachable": true }
```

## Client-Side WebSocket (Direct Mode)

New module: `src/lib/device-client.ts`

Implements the CrossPoint WebSocket protocol in the browser:

```typescript
interface DeviceUploadOptions {
  host: string
  port: number
  uploadPath: string
  filename: string
  data: ArrayBuffer
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
}

async function uploadToDevice(options: DeviceUploadOptions): Promise<void>
```

Uses the browser's native `WebSocket` API. Sends the file in 16 KB binary frames. Handles `READY`, `DONE`, and `ERROR` text messages from the device.

**Important**: The browser connects to `ws://<ip>:<port>/` (plain WS, not WSS). This works from HTTPS pages in most browsers when connecting to private/local IPs. If mixed-content issues arise, the user would need to access XTLibre over HTTP or use the Relay mode.

## Settings Storage

New fields in the `settings` table (existing key-value store):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `deviceHost` | string | `""` | Last-used device IP |
| `devicePort` | number | `81` | Last-used device port |
| `deviceUploadPath` | string | `"/"` | Upload directory on device |
| `deviceTransferMode` | `"direct" \| "relay"` | `"direct"` | Transfer mode |
| `rememberedDevices` | JSON string | `"[]"` | Array of `{ label?, host, port }` |

Settings are persisted via the existing `saveSettings()` server action. The settings schema (`settings-schema.ts`) will be extended with these fields.

## New Files

| File | Purpose |
|------|---------|
| `src/lib/device-client.ts` | Browser-side WebSocket upload + types |
| `src/lib/device-discovery.ts` | Server-side UDP discovery logic |
| `src/components/converter/device-tab.tsx` | Device tab UI component |
| `src/app/api/device/discover/route.ts` | UDP discovery API route |
| `src/app/api/device/send/route.ts` | Relay mode upload API route |
| `src/app/api/device/status/route.ts` | Connection test API route |

## Modified Files

| File | Change |
|------|--------|
| `src/components/converter/sidebar.tsx` | Add Device tab |
| `src/components/converter/library-tab.tsx` | Add "Send to Device" button on XTC/XTCH books |
| `src/components/converter/converter.tsx` | Pass device settings to sidebar, handle post-generation send prompt |
| `src/lib/settings-schema.ts` | Add device-related fields to Zod schema |
| `src/lib/types.ts` | Add device-related types if needed |

## Error Handling

- **Device unreachable**: Toast with "Could not connect to device at {ip}:{port}. Check that the device is on and connected to WiFi."
- **Transfer rejected (ERROR from device)**: Toast with the device's error message
- **WebSocket closed mid-transfer**: Toast with "Transfer interrupted. Check device connection."
- **Mixed content block (Direct mode over HTTPS)**: Toast suggesting Relay mode or accessing XTLibre over HTTP
- **Discovery finds nothing**: "No devices found. Make sure the device is on the same network and discoverable."
- **Timeout**: 10 second timeout for WebSocket handshake, 30 second timeout for waiting for READY/DONE responses

## Out of Scope (Future)

- Browsing/managing files on the device from the Device tab
- Batch send (multiple books at once)
- Auto-send after generation (without user confirmation)
- Device file deletion from XTLibre
