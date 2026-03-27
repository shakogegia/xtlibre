# XTLibre

EPUB-to-XTC converter for [Xteink](https://xteink.com) e-readers. Renders EPUBs in the browser via CREngine (WASM), previews them on a realistic device frame, and exports `.xtc` files ready to transfer to your device.

## Features

- **Device preview** — realistic on-screen frames for Xteink X4 (480×800) and X3 (528×792)
- **Configurable rendering** — font family, size, line spacing, margins, and hyphenation
- **Landscape mode** — rotate the preview for wide-format reading
- **Floyd–Steinberg dithering** — converts pages to e-ink-optimized 16-level grayscale
- **Batch export** — export a single page or all pages at once as `.xtc`
- **Page scrubber** — quickly jump through long books
- **Persistent settings** — options are saved to `localStorage`
- **Calibre-Web integration** — browse and download EPUBs from your [Calibre-Web](https://github.com/janeczku/calibre-web) or [Calibre-Web-Automated](https://github.com/crocodilestick/Calibre-Web-Automated) library via OPDS
- **Save to Library** — save converted XTC files to the server for later access
- **OPDS catalog** — your Xteink device can browse and download XTC files directly at `/opds`
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

Open [http://localhost:3000](http://localhost:3000), drop an EPUB file, and start previewing.

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
    volumes:
      - xtlibre-data:/data
    restart: unless-stopped

volumes:
  xtlibre-data:
```

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) to use the converter. Converted XTC files saved via "Save to Library" are stored in the volume and served over OPDS.

### OPDS endpoint

Point your Xteink device to `http://<your-server>:3000/opds` to browse and download XTC files from your library.

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
