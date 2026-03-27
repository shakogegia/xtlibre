@AGENTS.md

# XTLibre

EPUB-to-XTC converter for Xteink e-readers (X4, X3). Renders EPUBs via CREngine WASM, previews on a realistic device frame, and exports .xtc files.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 with OKLch color tokens (CSS variables in `globals.css`)
- shadcn/ui (base-nova style) on top of @base-ui/react
- Icons: lucide-react
- WASM: CREngine (`public/lib/crengine.wasm`) for EPUB rendering
- Dithering: Web Worker (`public/dither-worker.js`)
- Package manager: pnpm

## Project structure

- `src/app/page.tsx` — main app component (large, single-file client component)
- `src/lib/config.ts` — device specs, font families, language/hyphenation patterns
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `src/components/ui/` — shadcn components
- `public/lib/` — WASM and JS engine files

## Rules

- **Read Next.js 16 docs first.** Before touching routing, layouts, or APIs, read the relevant guide in `node_modules/next/dist/docs/`. This version has breaking changes from what you know.
- **SelectItem must be wrapped in SelectGroup.** Always. See `src/components/ui/select.tsx`.
- **Use shadcn/base-ui for interactive elements.** Don't reach for raw HTML `<select>`, `<input>`, etc. when a component exists in `src/components/ui/`.
- **OKLch color system.** Use CSS variables (`--background`, `--primary`, etc.) defined in `globals.css`. Don't hardcode hex/rgb colors.
- **Path alias.** Use `@/*` which maps to `src/*`.
- **Don't split `page.tsx` without asking.** It's large by design — the converter is a single-page client app with tightly coupled state. Refactoring it into smaller files is a significant architectural decision.
