# XTLibre

A self-hosted companion app for [Xteink](https://xteink.com) and [CrossPoint](https://github.com/crosspoint-reader/crosspoint-reader) e-readers. Convert EPUBs to XTC format, manage your library, send books wirelessly to your device, and browse device files — all from your browser.

<img width="1418" height="959" alt="Xnip2026-03-27_22-32-46" src="https://github.com/user-attachments/assets/ca2cee9f-2074-4068-a2d5-59fd6f19b833" />


## Features

### Converter
- **Device preview** — realistic on-screen frames for Xteink X4 (480×800) and X3 (528×792)
- **Configurable rendering** — font family, size, weight, line spacing, margins, text alignment, and hyphenation
- **Custom fonts** — upload TTF/OTF fonts for rendering
- **Landscape mode** — rotate the preview for wide-format reading
- **Floyd–Steinberg dithering** — 1-bit and 2-bit quantization modes for e-ink optimization
- **Progress bar** — configurable progress bar with chapter marks, page info, and dither control
- **Batch export** — export a single page or all pages at once as `.xtc`
- **Page scrubber** — quickly jump through long books

### Library & Calibre
- **Save to Library** — save converted XTC files and source EPUBs to the server for later access
- **Calibre-Web integration** — browse and download EPUBs from your [Calibre-Web](https://github.com/janeczku/calibre-web) or [Calibre-Web-Automated](https://github.com/crocodilestick/Calibre-Web-Automated) library via OPDS
- **OPDS catalog** — your Xteink device can browse and download XTC files directly at `/opds`

### Device
- **Send to device** — upload XTC files wirelessly to your Xteink/CrossPoint e-reader over WebSocket
- **Auto-discovery** — scan for devices on your local network via UDP broadcast
- **File browser** — browse, navigate, and delete files on your device
- **Two transfer modes** — Direct (browser → device) for remote servers, Relay (server → device) for same-network setups
- **Device info** — view firmware version, WiFi signal, memory, and uptime

### General
- **Persistent settings** — options are saved server-side to SQLite
- **Authentication** — login page with JWT session cookies; HTTP Basic Auth for OPDS
- **Docker support** — single-container deployment with persistent storage

## Supported devices

| Device     | Resolution |
| ---------- | ---------- |
| Xteink X4  | 480 × 800  |
| Xteink X3  | 528 × 792  |

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), drop an EPUB file, and start converting.

### Authentication

XTLibre requires authentication. Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_USERNAME` | Yes | Login username |
| `AUTH_PASSWORD` | Yes | Login password |

For local development:

```bash
AUTH_USERNAME=admin AUTH_PASSWORD=secret pnpm dev
```

The web UI uses a session cookie after login. The OPDS endpoint (`/opds`) also supports HTTP Basic Auth so Xteink devices can authenticate directly.

### Calibre-Web / OPDS

Switch to the **Library** tab and enter your Calibre-Web server URL and credentials when prompted. XTLibre connects via the OPDS 1.2 catalog feed to browse your library and download EPUBs directly — no file transfer needed.

Works with any OPDS-compatible server, including:
- [Calibre-Web](https://github.com/janeczku/calibre-web)
- [Calibre-Web-Automated](https://github.com/crocodilestick/Calibre-Web-Automated)

## Self-hosting with Docker

The quickest way to get started is with the pre-built image from Docker Hub:

```bash
docker run -d \
  --name xtlibre \
  -p 3000:3000 \
  -e PUBLIC_URL=https://books.example.com \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=changeme \
  -v xtlibre-data:/data \
  shakogegia/xtlibre
```

Or with `docker-compose.yml`:

```yaml
services:
  xtlibre:
    image: shakogegia/xtlibre
    ports:
      - "3000:3000"
    environment:
      - PUBLIC_URL=https://books.example.com
      - AUTH_USERNAME=admin
      - AUTH_PASSWORD=changeme
    volumes:
      - xtlibre-data:/data
    restart: unless-stopped

volumes:
  xtlibre-data:
```

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) to use XTLibre. Converted XTC files are saved to the library and can be sent to the device wirelessly or served over OPDS.

### Sending to device

Go to the **Device** tab to connect to your e-reader. On your device, enter **File Transfer** and select **Join a Network** or **Calibre Wireless**.

- **Direct mode** — your browser connects to the device directly. Use when the server is remote (e.g. Docker on a VPS).
- **Relay mode** — the server sends files to the device. Use when both are on the same LAN.

You can also enter `crosspoint.local` as the hostname if your network supports mDNS.

### OPDS endpoint

Point your Xteink device to `http://<your-server>:3000/opds` to browse and download XTC files from your library.

The endpoint requires HTTP Basic Auth using the same `AUTH_USERNAME` and `AUTH_PASSWORD` credentials.

Set `PUBLIC_URL` to the externally reachable address (e.g. `https://books.example.com`) so that OPDS feed links use the correct host. When omitted, URLs are derived from the incoming request.

### Building from source

If you want to build the image yourself:

```bash
make build
make run
```

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `make build` | Build the Docker image             |
| `make run`   | Build and start the container      |
| `make stop`  | Stop and remove the container      |
| `make logs`  | Tail container logs                |
| `make shell` | Open a shell in the container      |
| `make push`  | Tag and push to Docker Hub         |
| `make clean` | Stop container, remove image/volume|

Override defaults with environment variables:

```bash
make run PORT=8080                          # custom port
make push DOCKER_REPO=shakogegia/xtlibre   # Docker Hub repo
```

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) (base-nova) on @base-ui/react
- [CREngine WASM](https://github.com/nickelc/crengine-wasm) for EPUB rendering
- [SQLite](https://github.com/WiseLibs/better-sqlite3) for library metadata
- Web Worker for Floyd–Steinberg dithering

## License

[MIT](LICENSE)
