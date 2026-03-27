@AGENTS.md

# XTLibre

EPUB-to-XTC converter for Xteink e-readers (X4, X3). Renders EPUBs via CREngine WASM, previews on a realistic device frame, and exports .xtc files. Includes a server-side library with OPDS feed, Calibre-Web integration, and JWT authentication.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 with OKLch color tokens (CSS variables in `globals.css`)
- shadcn/ui (base-nova style) on top of @base-ui/react
- Icons: lucide-react
- SQLite via better-sqlite3 (library metadata, settings, fonts, Calibre config)
- JWT auth (jose) with HTTP Basic Auth for OPDS
- Zod for schema validation
- WASM: CREngine (`public/lib/crengine.wasm`) for EPUB rendering
- Dithering: Web Worker (`public/dither-worker.js`)
- Package manager: pnpm

## Project structure

- `src/app/page.tsx` — thin server component, loads settings from DB and renders `<Converter />`
- `src/app/layout.tsx` — root layout with ThemeProvider and Toaster
- `src/app/login/` — login page + form component
- `src/app/actions.ts` — server actions (saveSettings)
- `src/app/opds/route.ts` — OPDS Atom XML feed for e-readers
- `src/app/api/auth/` — login/logout routes (JWT session cookie)
- `src/app/api/library/` — XTC/EPUB upload, list, download, delete, covers
- `src/app/api/calibre/` — Calibre-Web config CRUD + OPDS feed proxy + EPUB download
- `src/app/api/fonts/` — custom font upload, metadata, file serving, delete
- `src/components/converter/` — main app UI (converter, sidebar, toolbar, device-preview, options-tab, library-tab, calibre-tab, calibre-dialog, chapter-list)
- `src/components/ui/` — shadcn components
- `src/lib/auth.ts` — JWT session, HTTP Basic Auth middleware
- `src/lib/db.ts` — SQLite database (books, calibre_config, settings, fonts tables)
- `src/lib/config.ts` — device specs, font families, language/hyphenation patterns
- `src/lib/device.ts` — device dimensions, bezel metrics, screen DPI math
- `src/lib/image-processing.ts` — XTC/XTH file generation, dithering, quantization
- `src/lib/opds.ts` — OPDS feed parsing, Calibre API client
- `src/lib/settings-schema.ts` — Zod schema for rendering settings
- `src/lib/types.ts` — TypeScript interfaces
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `public/lib/` — WASM and JS engine files

## Rules

- **Read Next.js 16 docs first.** Before touching routing, layouts, or APIs, read the relevant guide in `node_modules/next/dist/docs/`. This version has breaking changes from what you know.
- **SelectItem must be wrapped in SelectGroup.** Always. See `src/components/ui/select.tsx`.
- **Use shadcn/base-ui for interactive elements.** Don't reach for raw HTML `<select>`, `<input>`, etc. when a component exists in `src/components/ui/`.
- **OKLch color system.** Use CSS variables (`--background`, `--primary`, etc.) defined in `globals.css`. Don't hardcode hex/rgb colors.
- **Path alias.** Use `@/*` which maps to `src/*`.
- **Don't restructure `converter.tsx` without asking.** It's the main client component (~1000 lines) with tightly coupled state. The converter was intentionally kept as a single component — splitting it further is a significant architectural decision.
