# Settings Persistence to SQLite — Design Spec

Move converter settings from localStorage to SQLite. Server component reads settings before hydration — no flash, no client-side storage. Uses Zod for validation and Server Actions for writes.

## Scope

Only the `Settings` object (device type, font, margins, dithering, progress bar, etc.). NOT device color, NOT theme.

## Architecture

### Zod schema — `src/lib/settings-schema.ts`

Defines the canonical `Settings` shape as a Zod schema. The `Settings` type in `types.ts` becomes `z.infer<typeof settingsSchema>`. `DEFAULT_SETTINGS` stays as the fallback.

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
```

### DB layer — additions to `src/lib/db.ts`

Single-row table, JSON column:

```sql
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
)
```

Two functions:
- `getSettings(): Settings | null` — reads row, parses JSON, validates with Zod. Returns null if no row or invalid.
- `setSettings(data: Settings): void` — validates with Zod, upserts JSON.

### Server Action — `src/app/actions.ts`

```ts
"use server"
export async function saveSettings(data: Settings): Promise<void>
```

Validates with `settingsSchema.parse(data)`, calls `setSettings()`. Fire-and-forget from client — no return value needed.

### Data flow

1. **Server render**: `page.tsx` calls `getSettings()` from `db.ts`, falls back to `DEFAULT_SETTINGS`, passes `initialSettings` to `<Converter>`.
2. **Client init**: `Converter` receives `initialSettings` as prop, uses it as initial state. No localStorage hydration effect.
3. **Client changes**: `setS` wrapper calls `saveSettings(next)` fire-and-forget (no await). UI updates optimistically.
4. **Removed**: `STORAGE_KEY_SETTINGS`, `loadFromStorage` (if no longer used elsewhere), the localStorage hydration `useEffect` for settings.

### Files changed

- Create: `src/lib/settings-schema.ts`
- Modify: `src/lib/db.ts` — add settings table + functions
- Create: `src/app/actions.ts` — server action
- Modify: `src/lib/types.ts` — replace `Settings` interface with re-export from schema, remove `STORAGE_KEY_SETTINGS`, remove `loadFromStorage` if unused
- Modify: `src/app/page.tsx` — read settings from DB, pass as prop
- Modify: `src/components/converter/converter.tsx` — accept `initialSettings` prop, remove localStorage read/write for settings

### What stays in localStorage

- `xtc-device-color` — device frame color (client-only cosmetic preference)
- `theme` — light/dark theme (managed by theme-provider, separate concern)
