# Custom Fonts & Typography Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side custom font management with upload/remove, curated built-in reading font list, and accordion reordering in the options tab.

**Architecture:** Custom fonts stored on disk (`data/fonts/`) with metadata in SQLite. Font list passed as initial props from the server component (no client-side list fetch). API routes handle upload, delete, and serving TTF binaries. `revalidatePath("/")` after mutations refreshes the server component cache. Custom fonts integrate into the existing `loadFontFamily` flow via `/api/fonts/[id]/file` URLs.

**Tech Stack:** Next.js 16 (App Router, Server Actions, revalidatePath), SQLite (better-sqlite3), existing WASM font registration

---

### Task 1: DB layer — fonts table and CRUD

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add fonts table and prepared statements to db.ts**

Add after the `settings` table creation and after the settings statements:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS fonts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`)
```

```ts
export interface CustomFont {
  id: string
  name: string
  filename: string
  created_at: string
}

const fontStmts = {
  list: db.prepare(`SELECT id, name, filename, created_at FROM fonts ORDER BY name`),
  getById: db.prepare(`SELECT * FROM fonts WHERE id = ?`),
  insert: db.prepare(`
    INSERT INTO fonts (id, name, filename, created_at)
    VALUES (@id, @name, @filename, datetime('now'))
  `),
  deleteById: db.prepare(`DELETE FROM fonts WHERE id = ?`),
}

export function listFonts(): CustomFont[] {
  return fontStmts.list.all() as CustomFont[]
}

export function getFont(id: string): CustomFont | undefined {
  return fontStmts.getById.get(id) as CustomFont | undefined
}

export function insertFont(font: { id: string; name: string; filename: string }) {
  fontStmts.insert.run(font)
}

export function deleteFont(id: string): boolean {
  return fontStmts.deleteById.run(id).changes > 0
}

export function getFontsDir(): string {
  const dir = path.join(DATA_DIR, "fonts")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
```

- [ ] **Step 2: Verify the app still starts**

Run: `pnpm dev` — check no startup errors in terminal.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add fonts table and CRUD to DB layer"
```

---

### Task 2: API routes — upload, delete, serve

**Files:**
- Create: `src/app/api/fonts/route.ts`
- Create: `src/app/api/fonts/[id]/route.ts`
- Create: `src/app/api/fonts/[id]/file/route.ts`

- [ ] **Step 1: Create POST /api/fonts (upload)**

`src/app/api/fonts/route.ts`:

```ts
import { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth"
import { insertFont, getFontsDir } from "@/lib/db"
import { randomUUID } from "crypto"
import path from "path"
import fs from "fs"

export async function POST(request: NextRequest) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase()
  if (ext !== ".ttf" && ext !== ".otf") {
    return Response.json({ error: "Only .ttf and .otf files allowed" }, { status: 400 })
  }

  const id = randomUUID()
  const filename = `${id}${ext}`
  const fontsDir = getFontsDir()
  const data = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(path.join(fontsDir, filename), data)

  const name = path.basename(file.name, ext)
  insertFont({ id, name, filename })

  revalidatePath("/")
  return Response.json({ id, name, filename })
}
```

- [ ] **Step 2: Create DELETE /api/fonts/[id]**

`src/app/api/fonts/[id]/route.ts`:

```ts
import { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth"
import { getFont, deleteFont, getFontsDir } from "@/lib/db"
import path from "path"
import fs from "fs"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const font = getFont(id)
  if (!font) {
    return Response.json({ error: "Font not found" }, { status: 404 })
  }

  const filePath = path.join(getFontsDir(), font.filename)
  try { fs.unlinkSync(filePath) } catch {}
  deleteFont(id)

  revalidatePath("/")
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 3: Create GET /api/fonts/[id]/file (serve TTF)**

`src/app/api/fonts/[id]/file/route.ts`:

```ts
import { NextRequest } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getFont, getFontsDir } from "@/lib/db"
import path from "path"
import fs from "fs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request)
  if (denied) return denied

  const { id } = await params
  const font = getFont(id)
  if (!font) {
    return Response.json({ error: "Font not found" }, { status: 404 })
  }

  const filePath = path.join(getFontsDir(), font.filename)
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "Font file missing" }, { status: 404 })
  }

  const data = fs.readFileSync(filePath)
  const contentType = font.filename.endsWith(".otf") ? "font/otf" : "font/ttf"
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/fonts/
git commit -m "feat: add font upload, delete, and serve API routes"
```

---

### Task 3: Curate built-in font list

**Files:**
- Modify: `src/lib/config.ts`

- [ ] **Step 1: Remove non-reading fonts and add reading-optimized fonts**

Remove from `FONT_FAMILIES`: `"Open Sans"`, `"Roboto"`, `"Noto Sans"`, `"Noto Sans Georgian"`.

Add to `FONT_FAMILIES`:

```ts
Bitter: {
  variants: [
    { file: "Bitter-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bitter/Bitter%5Bwght%5D.ttf" },
    { file: "Bitter-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bitter/Bitter-Italic%5Bwght%5D.ttf" },
  ],
  isVariable: true,
},
Vollkorn: {
  variants: [
    { file: "Vollkorn-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/vollkorn/Vollkorn%5Bwght%5D.ttf" },
    { file: "Vollkorn-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/vollkorn/Vollkorn-Italic%5Bwght%5D.ttf" },
  ],
  isVariable: true,
},
Spectral: {
  variants: [
    { file: "Spectral-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/spectral/Spectral-Regular.ttf" },
    { file: "Spectral-Bold.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/spectral/Spectral-Bold.ttf" },
    { file: "Spectral-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/spectral/Spectral-Italic.ttf" },
    { file: "Spectral-BoldItalic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/spectral/Spectral-BoldItalic.ttf" },
  ],
},
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: curate font list — remove UI fonts, add Bitter/Vollkorn/Spectral"
```

---

### Task 4: Pass fonts from server component

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/converter/converter.tsx`

- [ ] **Step 1: Pass initialFonts from page.tsx**

```ts
import { Converter } from "@/components/converter/converter"
import { getSettings, listFonts } from "@/lib/db"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"

const VALID_TABS = new Set(["library", "options", "calibre"])

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tab } = await searchParams
  const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "library"
  const initialSettings = getSettings() ?? DEFAULT_SETTINGS
  const initialFonts = listFonts()
  return <Converter initialTab={initialTab} initialSettings={initialSettings} initialFonts={initialFonts} />
}
```

- [ ] **Step 2: Accept initialFonts in Converter, add state + upload/delete handlers**

In `converter.tsx`, update the component signature:

```ts
import { type CustomFont } from "@/lib/db"

export function Converter({
  initialTab, initialSettings, initialFonts,
}: {
  initialTab: string; initialSettings: Settings; initialFonts: CustomFont[]
}) {
```

Note: `CustomFont` is just `{ id: string; name: string; filename: string; created_at: string }` — export it from `db.ts`.

Add state near other state declarations:

```ts
const [customFonts, setCustomFonts] = useState(initialFonts)
```

Add upload/delete handlers:

```ts
const uploadCustomFont = useCallback(async (file: File) => {
  const form = new FormData()
  form.append("file", file)
  const resp = await fetch("/api/fonts", { method: "POST", body: form })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: "Upload failed" }))
    throw new Error(body.error || "Upload failed")
  }
  const font = await resp.json()
  setCustomFonts(prev => [...prev, font])
  return font as { id: string; name: string; filename: string }
}, [])

const deleteCustomFont = useCallback(async (id: string) => {
  const resp = await fetch(`/api/fonts/${id}`, { method: "DELETE" })
  if (!resp.ok) throw new Error("Delete failed")
  setCustomFonts(prev => prev.filter(f => f.id !== id))
  // If the deleted font is currently selected, reset to default
  if (sRef.current.fontFace === customFonts.find(f => f.id === id)?.name) {
    handleFontChange("Literata")
  }
}, [customFonts, handleFontChange])
```

- [ ] **Step 3: Update loadFontFamily to handle custom fonts**

Modify `loadFontFamily` to check custom fonts when the name isn't in `FONT_FAMILIES`:

```ts
const loadFontFamily = useCallback(async (familyName: string): Promise<boolean> => {
  if (loadedFontsRef.current.has(familyName)) return true
  const family = FONT_FAMILIES[familyName]
  if (family) {
    const results = await Promise.all(family.variants.map(v => loadFontFromUrl(v.url, v.file)))
    if (results.some(r => r)) { loadedFontsRef.current.add(familyName); return true }
    return false
  }
  // Check custom fonts
  const custom = customFontsRef.current.find(f => f.name === familyName)
  if (custom) {
    const ok = await loadFontFromUrl(`/api/fonts/${custom.id}/file`, custom.filename)
    if (ok) { loadedFontsRef.current.add(familyName); return true }
  }
  return false
}, [loadFontFromUrl])
```

Add a ref to keep customFonts accessible in callbacks:

```ts
const customFontsRef = useRef(initialFonts)
useEffect(() => { customFontsRef.current = customFonts }, [customFonts])
```

- [ ] **Step 4: Remove old single-file custom font state and handler**

Remove `customFontName`, `setCustomFontName`, `handleCustomFont`, and `fontInputRef` from converter.tsx. These are replaced by the new upload flow.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/converter/converter.tsx src/lib/db.ts
git commit -m "feat: pass custom fonts from server, add upload/delete handlers"
```

---

### Task 5: Font management UI in options tab

**Files:**
- Modify: `src/components/converter/options-tab.tsx`

- [ ] **Step 1: Update OptionsTabProps**

Replace old custom font props with new ones:

```ts
interface OptionsTabProps {
  s: Settings
  meta: BookMetadata
  toc: TocItem[]
  customFonts: Array<{ id: string; name: string; filename: string }>
  update: (patch: Partial<Settings>) => void
  updateAndReformat: (patch: Partial<Settings>) => void
  updateAndRender: (patch: Partial<Settings>) => void
  flushReformat: () => void
  flushRender: () => void
  handleFontChange: (fontName: string | null) => void
  handleQualityChange: (mode: "fast" | "hq") => void
  handleHyphenationChange: (val: number) => void
  handleHyphenLangChange: (lang: string | null) => void
  uploadCustomFont: (file: File) => Promise<{ id: string; name: string; filename: string }>
  deleteCustomFont: (id: string) => Promise<void>
  renderPreview: () => void
  rendererRef: React.MutableRefObject<Renderer>
}
```

- [ ] **Step 2: Add Fonts accordion section**

Add a new "Fonts" accordion section. This goes as the first section in the accordion (before Typography). The accordion `defaultValue` changes to `["text"]` (only Typography expanded).

```tsx
{/* Custom Fonts */}
<AccordionItem value="fonts" className="border border-border/40 rounded-lg px-3 data-[state=open]:bg-muted/20">
  <AccordionTrigger className="py-2.5 text-[12px] font-medium text-foreground hover:no-underline gap-2">
    <span className="flex items-center gap-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      Fonts
    </span>
  </AccordionTrigger>
  <AccordionContent className="pb-3 space-y-2">
    {customFonts.length > 0 && (
      <div className="space-y-1">
        {customFonts.map(f => (
          <div key={f.id} className="flex items-center justify-between py-1 px-2 rounded bg-muted/30">
            <span className="text-[12px] truncate">{f.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => deleteCustomFont(f.id)}
              title="Remove font"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </Button>
          </div>
        ))}
      </div>
    )}
    <Button
      variant="outline"
      size="sm"
      className="w-full h-7 text-[12px]"
      onClick={() => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = ".ttf,.otf"
        input.onchange = async () => {
          const file = input.files?.[0]
          if (file) {
            try {
              await uploadCustomFont(file)
            } catch (err) {
              // toast or ignore
            }
          }
        }
        input.click()
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Upload Font
    </Button>
    {customFonts.length === 0 && (
      <p className="text-[11px] text-muted-foreground text-center">Upload .ttf or .otf files to use as reading fonts</p>
    )}
  </AccordionContent>
</AccordionItem>
```

- [ ] **Step 3: Update Typography font dropdown to include custom fonts**

Replace the old custom font item in the Select with:

```tsx
<Select value={s.fontFace} onValueChange={handleFontChange}>
  <SelectTrigger className="h-8 text-[12px]"><SelectValue>{s.fontFace === "epub-default" ? "Default (EPUB)" : s.fontFace}</SelectValue></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="epub-default">Default (EPUB)</SelectItem>
      {Object.keys(FONT_FAMILIES).map(f => (
        <SelectItem key={f} value={f}>{f}</SelectItem>
      ))}
      {customFonts.map(f => (
        <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>
```

- [ ] **Step 4: Remove old "Upload Custom Font" button from Typography section**

Delete the `<input ref={fontInputRef}>` and the "Upload Custom Font" button and the `customFontName` display at the bottom of the Typography accordion content (lines ~238-244 in current file).

- [ ] **Step 5: Reorder accordion sections and change default expanded**

New order: Fonts, Typography, Device, Image, Progress Bar, Chapters.

Change `defaultValue` from `["device", "text"]` to `["text"]`.

- [ ] **Step 6: Commit**

```bash
git add src/components/converter/options-tab.tsx
git commit -m "feat: add fonts section, curate dropdown, reorder accordion"
```

---

### Task 6: Wire everything together in converter.tsx

**Files:**
- Modify: `src/components/converter/converter.tsx`
- Modify: `src/components/converter/sidebar.tsx` (if it passes props through)

- [ ] **Step 1: Update OptionsTab props in converter.tsx render**

Replace the old props passed to `<OptionsTab>`:

```tsx
<OptionsTab
  s={s} meta={meta} toc={toc}
  customFonts={customFonts}
  update={update} updateAndReformat={updateAndReformat} updateAndRender={updateAndRender}
  flushReformat={flushReformat} flushRender={flushRender}
  handleFontChange={handleFontChange} handleQualityChange={handleQualityChange}
  handleHyphenationChange={handleHyphenationChange} handleHyphenLangChange={handleHyphenLangChange}
  uploadCustomFont={uploadCustomFont} deleteCustomFont={deleteCustomFont}
  renderPreview={renderPreview} rendererRef={rendererRef}
/>
```

Remove `customFontName`, `handleCustomFont`, and `fontInputRef` from the props.

- [ ] **Step 2: Update sidebar.tsx if it forwards options-tab props**

Check `sidebar.tsx` — if it passes through `customFontName`/`handleCustomFont`/`fontInputRef`, replace with `customFonts`/`uploadCustomFont`/`deleteCustomFont`.

- [ ] **Step 3: Verify the app compiles and fonts section renders**

Run: `pnpm dev`, navigate to `?tab=options`, verify:
- Fonts section shows with upload button
- Typography section has curated font list
- Accordion order is: Fonts, Typography, Device, Image, Progress Bar, Chapters
- Only Typography is expanded by default

- [ ] **Step 4: Test upload flow**

Upload a .ttf file via the Fonts section. Verify:
- Font appears in the Fonts list
- Font appears in the Typography font dropdown
- Selecting the font loads it and applies it to the preview

- [ ] **Step 5: Test delete flow**

Delete a custom font. Verify:
- Font removed from Fonts list and dropdown
- If it was selected, font resets to Literata

- [ ] **Step 6: Commit**

```bash
git add src/components/converter/converter.tsx src/components/converter/sidebar.tsx
git commit -m "feat: wire custom fonts through converter and sidebar"
```
