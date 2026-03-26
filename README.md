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

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) (base-nova) on @base-ui/react
- [CREngine WASM](https://github.com/nickelc/crengine-wasm) for EPUB rendering
- Web Worker for Floyd–Steinberg dithering

## License

[MIT](LICENSE)
