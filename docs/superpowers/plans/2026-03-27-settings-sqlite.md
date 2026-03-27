# Settings SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move converter settings from localStorage to SQLite, with server-side initial load and Zod validation.

**Architecture:** Zod schema defines the canonical Settings shape. DB stores settings as a JSON blob in a single-row table. Server component reads settings before hydration. Client writes via a fire-and-forget server action on every change.

**Tech Stack:** better-sqlite3 (existing), Zod (new dependency), Next.js 16 Server Actions

---

### Task 1: Install Zod and create settings schema

**Files:**
- Create: `src/lib/settings-schema.ts`
- Modify: `package.json` (via pnpm add)

- [ ] **Step 1: Install Zod**

Run: `pnpm add zod`

- [ ] **Step 2: Create `src/lib/settings-schema.ts`**

```ts
import { z } from "zod"

export const settingsSchema = z.object({
  deviceType: z.enum(["x4", "x3"]),
  orientation: z.number(),
  fontSize: z.number().min(14).max(48),
  fontWeight: z.number().min(100).max(900),
  lineHeight: z.number().min(80).max(200),
  margin: z.number().min(0).max(50),
  fontFace: z.string(),
  textAlign: z.number().min(-1).max(3),
  wordSpacing: z.number(),
  hyphenation: z.number().min(0).max(2),
  hyphenationLang: z.string(),
  ignoreDocMargins: z.boolean(),
  qualityMode: z.enum(["fast", "hq"]),
  enableDithering: z.boolean(),
  ditherStrength: z.number().min(0).max(100),
  enableNegative: z.boolean(),
  enableProgressBar: z.boolean(),
  progressPosition: z.enum(["top", "bottom"]),
  showProgressLine: z.boolean(),
  showChapterMarks: z.boolean(),
  showChapterProgress: z.boolean(),
  progressFullWidth: z.boolean(),
  showPageInfo: z.boolean(),
  showBookPercent: z.boolean(),
  showChapterPage: z.boolean(),
  showChapterPercent: z.boolean(),
  progressFontSize: z.number().min(10).max(20),
  progressEdgeMargin: z.number().min(0).max(30),
  progressSideMargin: z.number().min(0).max(30),
  fontHinting: z.number(),
  fontAntialiasing: z.number(),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  deviceType: "x4",
  orientation: 0,
  fontSize: 22,
  fontWeight: 400,
  lineHeight: 120,
  margin: 20,
  fontFace: "Literata",
  textAlign: -1,
  wordSpacing: 100,
  hyphenation: 2,
  hyphenationLang: "auto",
  ignoreDocMargins: false,
  qualityMode: "fast",
  enableDithering: true,
  ditherStrength: 70,
  enableNegative: false,
  enableProgressBar: true,
  progressPosition: "bottom",
  showProgressLine: true,
  showChapterMarks: true,
  showChapterProgress: false,
  progressFullWidth: false,
  showPageInfo: true,
  showBookPercent: true,
  showChapterPage: true,
  showChapterPercent: false,
  progressFontSize: 14,
  progressEdgeMargin: 0,
  progressSideMargin: 0,
  fontHinting: 1,
  fontAntialiasing: 2,
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds (new file is not yet imported anywhere).

- [ ] **Step 4: Commit**

```bash
git add src/lib/settings-schema.ts package.json pnpm-lock.yaml
git commit -m "feat: add Zod settings schema with defaults"
```

---

### Task 2: Add settings table and DB functions

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add settings table creation**

In `src/lib/db.ts`, after the existing `CREATE TABLE IF NOT EXISTS calibre_config` block, add:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)
```

- [ ] **Step 2: Add imports and prepared statements**

At the top of `db.ts`, add the import:

```ts
import { settingsSchema, type Settings } from "@/lib/settings-schema"
```

After the existing `calibreStmts` object, add:

```ts
const settingsStmts = {
  get: db.prepare(`SELECT data FROM settings WHERE id = 1`),
  upsert: db.prepare(`
    INSERT INTO settings (id, data, updated_at)
    VALUES (1, @data, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      data = @data,
      updated_at = datetime('now')
  `),
}
```

- [ ] **Step 3: Add getSettings and setSettings functions**

At the bottom of `db.ts`, before the closing (or after `linkXtcToBook`), add:

```ts
export function getSettings(): Settings | null {
  const row = settingsStmts.get.get() as { data: string } | undefined
  if (!row) return null
  try {
    return settingsSchema.parse(JSON.parse(row.data))
  } catch {
    return null
  }
}

export function setSettings(data: Settings): void {
  settingsSchema.parse(data)
  settingsStmts.upsert.run({ data: JSON.stringify(data) })
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add settings table and DB functions"
```

---

### Task 3: Create server action

**Files:**
- Create: `src/app/actions.ts`

- [ ] **Step 1: Create `src/app/actions.ts`**

```ts
"use server"

import { setSettings } from "@/lib/db"
import { settingsSchema, type Settings } from "@/lib/settings-schema"

export async function saveSettings(data: Settings): Promise<void> {
  const validated = settingsSchema.parse(data)
  setSettings(validated)
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: add saveSettings server action"
```

---

### Task 4: Update types.ts — replace Settings with re-export

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Replace Settings interface and DEFAULT_SETTINGS with re-exports**

In `src/lib/types.ts`:

1. Add import at top: `import { type Settings as SettingsType, DEFAULT_SETTINGS as _DEFAULT_SETTINGS } from "@/lib/settings-schema"`
2. Remove the `Settings` interface (lines 27-59)
3. Remove `DEFAULT_SETTINGS` constant (lines 63-95)
4. Add re-exports: `export type Settings = SettingsType` and `export const DEFAULT_SETTINGS = _DEFAULT_SETTINGS`
5. Remove `STORAGE_KEY_SETTINGS` (line 101) — no longer needed
6. Remove the `import { type DeviceType } from "@/lib/config"` if it's only used by the removed `Settings` interface (check: `DeviceType` is no longer referenced in types.ts after removal)

Keep: `STORAGE_KEY_DEVICE_COLOR`, `loadFromStorage` (still used for device color).

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds. All existing imports of `Settings` and `DEFAULT_SETTINGS` from `@/lib/types` continue to work via re-export.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "refactor: replace Settings interface with Zod schema re-export"
```

---

### Task 5: Wire up server-side settings load in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read settings from DB and pass to Converter**

Update `src/app/page.tsx`:

```ts
import { Converter } from "@/components/converter/converter"
import { getSettings } from "@/lib/db"
import { DEFAULT_SETTINGS } from "@/lib/settings-schema"

const VALID_TABS = new Set(["files", "options", "calibre", "library"])

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { tab } = await searchParams
  const initialTab = typeof tab === "string" && VALID_TABS.has(tab) ? tab : "files"
  const initialSettings = getSettings() ?? DEFAULT_SETTINGS
  return <Converter initialTab={initialTab} initialSettings={initialSettings} />
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build fails — `Converter` doesn't accept `initialSettings` yet. That's expected; Task 6 fixes this.

- [ ] **Step 3: Commit (WIP)**

Don't commit yet — this will be committed together with Task 6.

---

### Task 6: Update Converter to use initialSettings and server action

**Files:**
- Modify: `src/components/converter/converter.tsx`

- [ ] **Step 1: Update Converter props and imports**

Change the function signature from:

```ts
export function Converter({ initialTab }: { initialTab: string }) {
```

to:

```ts
import { saveSettings } from "@/app/actions"
// ... existing imports, but remove STORAGE_KEY_SETTINGS from the types import

export function Converter({ initialTab, initialSettings }: { initialTab: string; initialSettings: Settings }) {
```

Update the types import to remove `STORAGE_KEY_SETTINGS`:

```ts
import {
  type WasmModule, type Renderer, type TocItem, type FileInfo, type BookMetadata,
  type Settings, type DeviceColor,
  DEFAULT_SETTINGS, PROGRESS_BAR_HEIGHT, PROGRESS_BAR_HEIGHT_FULLWIDTH,
  PROGRESS_BAR_HEIGHT_EXTENDED, STORAGE_KEY_DEVICE_COLOR,
  loadFromStorage,
} from "@/lib/types"
```

- [ ] **Step 2: Use initialSettings as initial state**

Change the settings state initialization from:

```ts
const [s, _setS] = useState<Settings>(DEFAULT_SETTINGS)
const sRef = useRef<Settings>(DEFAULT_SETTINGS)
```

to:

```ts
const [s, _setS] = useState<Settings>(initialSettings)
const sRef = useRef<Settings>(initialSettings)
```

- [ ] **Step 3: Replace localStorage write with server action**

Change the `setS` callback from:

```ts
const setS = useCallback((updater: Settings | ((prev: Settings) => Settings)) => {
  _setS(prev => {
    const next = typeof updater === "function" ? updater(prev) : updater
    sRef.current = next
    try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(next)) } catch {}
    return next
  })
}, [])
```

to:

```ts
const setS = useCallback((updater: Settings | ((prev: Settings) => Settings)) => {
  _setS(prev => {
    const next = typeof updater === "function" ? updater(prev) : updater
    sRef.current = next
    saveSettings(next)
    return next
  })
}, [])
```

- [ ] **Step 4: Remove localStorage settings hydration from useEffect**

Change the hydration useEffect from:

```ts
useEffect(() => {
  const savedSettings = loadFromStorage<Partial<Settings>>(STORAGE_KEY_SETTINGS, {})
  if (Object.keys(savedSettings).length > 0) {
    setS(prev => ({ ...prev, ...savedSettings }))
  }
  const savedColor = loadFromStorage<DeviceColor | null>(STORAGE_KEY_DEVICE_COLOR, null)
  if (savedColor) setDeviceColor(savedColor)
  fetchCalibreConfig().then(config => {
    if (config) setCalibreConnected(true)
  })
}, [setS])
```

to:

```ts
useEffect(() => {
  const savedColor = loadFromStorage<DeviceColor | null>(STORAGE_KEY_DEVICE_COLOR, null)
  if (savedColor) setDeviceColor(savedColor)
  fetchCalibreConfig().then(config => {
    if (config) setCalibreConnected(true)
  })
}, [])
```

Note: `setS` is removed from the dependency array since we no longer call it in this effect.

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/converter/converter.tsx
git commit -m "feat: load settings from SQLite server-side, save via server action"
```

---

### Task 7: Cleanup — remove unused exports from types.ts

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Check if `loadFromStorage` is still imported anywhere**

Run: `grep -r "loadFromStorage" src/` — it should still be used in `converter.tsx` for device color. If so, keep it. If not, remove it.

Check if `STORAGE_KEY_DEVICE_COLOR` is still imported. It should be — keep it.

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit (if changes were made)**

```bash
git add src/lib/types.ts
git commit -m "refactor: clean up unused settings exports from types.ts"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: Build succeeds, zero errors.

- [ ] **Step 2: Start dev server and test**

Run: `pnpm dev`
Open the app. Verify:
1. Default settings load correctly on first visit (no saved settings in DB yet)
2. Change a setting (e.g., font size slider) — it should persist
3. Refresh the page — the changed setting should still be there (loaded server-side, no flash)
4. Check the URL tab persistence still works (`?tab=options` etc.)
5. Device color toggle still works (still localStorage)

- [ ] **Step 3: Verify DB has settings**

Run: `sqlite3 data/library.db "SELECT data FROM settings WHERE id = 1"`
Expected: JSON blob of the current settings.

- [ ] **Step 4: Verify no localStorage for settings**

In browser devtools, check localStorage. `xtc-settings` key should NOT be present after the migration. `xtc-device-color` and `theme` should still be there.
