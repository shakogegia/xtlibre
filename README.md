# XTLibre

XTLibre is a self-hosted companion app for [Xteink](https://xteink.com) and [CrossPoint](https://github.com/crosspoint-reader/crosspoint-reader) e-readers. It turns EPUB files into device-ready `XTC` packages, stores them in a local library, exposes them over OPDS, and can send them straight to a reader over WiFi.

It is built for people who want a practical replacement for manual USB workflows: drop in a book, tune the rendering for e-ink, save it to your library, then download or transfer it to the device.

https://github.com/user-attachments/assets/4fdc84e8-ef6f-4507-b719-63970012ea24

## Why XTLibre

- Built around Xteink/CrossPoint instead of generic EPUB reading
- Self-hosted, with your library and settings stored on your own server
- Real conversion controls for e-ink output, not just file sync
- OPDS support so devices can browse your generated books directly
- Wireless transfer to the device without leaving the browser

## What It Does

### EPUB to XTC conversion

- Render EPUB files for Xteink X4 and X3 screen sizes
- Tune font family, size, weight, margins, line height, alignment, and hyphenation
- Upload custom TTF/OTF fonts
- Preview the result in a device-style frame before exporting
- Generate standard `XTC` output or high-quality `XTCH` output
- Apply 1-bit / 2-bit e-ink quantization and Floyd-Steinberg dithering
- Add a configurable reading progress bar with chapter markers and page info

### Library and catalog

- Save source EPUB files and generated XTC files on the server
- Edit title and author metadata after import
- Re-open saved EPUBs for reconversion
- Publish generated books through an authenticated OPDS feed at `/opds`
- Browse and import books from Calibre-Web or any OPDS-compatible source

### Device workflow

- Discover compatible devices on the local network
- Test connectivity before sending books
- Transfer books wirelessly in direct or relay mode
- Browse files on the device from the web UI
- View device status such as firmware, WiFi mode, signal, memory, and uptime

## Supported Devices

| Device | Resolution |
| --- | --- |
| Xteink X4 | 480 x 800 |
| Xteink X3 | 528 x 792 |

## Typical Flow

1. Open XTLibre in the browser and log in.
2. Drop in an EPUB or import one from your OPDS / Calibre catalog.
3. Tune typography and e-ink rendering while previewing pages live.
4. Generate an `XTC` or `XTCH` file and store it in the library.
5. Download it, browse it through OPDS, or send it directly to the device.

## Quick Start

### Docker

The fastest way to run XTLibre is with Docker:

```bash
docker run -d \
  --name xtlibre \
  -p 3000:3000 \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=changeme \
  -e PUBLIC_URL=http://localhost:3000 \
  -v xtlibre-data:/data \
  shakogegia/xtlibre
```

Then open [http://localhost:3000](http://localhost:3000).

### Docker Compose

```yaml
services:
  xtlibre:
    image: shakogegia/xtlibre
    ports:
      - "3000:3000"
    environment:
      AUTH_USERNAME: admin
      AUTH_PASSWORD: changeme
      PUBLIC_URL: http://localhost:3000
    volumes:
      - xtlibre-data:/data
    restart: unless-stopped

volumes:
  xtlibre-data:
```

```bash
docker compose up -d
```

## Local Development

```bash
pnpm install
AUTH_USERNAME=admin AUTH_PASSWORD=secret pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

XTLibre requires authentication. These environment variables matter in practice:

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_USERNAME` | Yes | Login username for the web UI and OPDS basic auth |
| `AUTH_PASSWORD` | Yes | Login password and signing secret for sessions / download tokens |
| `PUBLIC_URL` | Recommended | Public base URL used when building OPDS links |
| `DATA_DIR` | No | Storage directory for the SQLite DB, uploaded fonts, EPUBs, and XTC files |

### Data stored on disk

By default XTLibre stores persistent data in `./data` locally or `/data` in Docker:

- `library.db` for metadata and saved settings
- `library/` for EPUB, XTC, and XTCH files
- `fonts/` for uploaded custom fonts

Mount that directory as a volume in production.

## Using OPDS and Calibre-Web

XTLibre exposes an authenticated OPDS catalog at `/opds`. Add that URL to your e-reader to browse and download generated books from your XTLibre library.

The app can also connect to Calibre-Web, Calibre-Web-Automated, or another OPDS-compatible source. Configure the server from the `Calibre` tab, browse the catalog in the UI, and import EPUBs directly into XTLibre.

## Sending Books to the Device

Open the `Device` tab, put the reader into `File Transfer`, and connect it over WiFi.

XTLibre supports two transfer modes:

- `Direct`: the browser connects to the device directly
- `Relay`: the XTLibre server connects to the device and streams the file

Use `Relay` when XTLibre is running on the same LAN as the e-reader. Use `Direct` when the browser can reach the device directly.

### Network note

Direct mode is currently intended for HTTP/local-network usage. If you access XTLibre over HTTPS, use relay mode instead.

## Building From Source

```bash
pnpm build
pnpm start
```

The repository also includes convenience `make` targets:

| Command | Description |
| --- | --- |
| `make dev` | Run the development server |
| `make build` | Build the Docker image |
| `make run` | Build and start the container |
| `make stop` | Stop and remove the container |
| `make logs` | Tail container logs |
| `make shell` | Open a shell inside the container |
| `make push` | Build and push the multi-arch image |
| `make clean` | Remove the local image and volume |

When using `make run`, pass the required auth env vars:

```bash
make run AUTH_USERNAME=admin AUTH_PASSWORD=changeme
```

## Tech Stack

- Next.js 16 with React 19 and TypeScript
- Tailwind CSS 4
- SQLite via `better-sqlite3`
- CREngine WASM for EPUB layout and rendering
- Web Workers for image processing and dithering
- WebSocket and HTTP APIs for device communication

## License

[MIT](LICENSE)
