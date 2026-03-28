# Mobile Responsiveness Design

**Date:** 2026-03-28
**Approach:** Full-screen tab views with bottom navigation (Approach A)
**Priority:** Library-first — library/Calibre browsing optimized for mobile, converter usable but not primary focus

## Breakpoint Strategy

- **Desktop (>= md / 768px):** No changes. Existing `flex-row` layout with 360px sidebar + content area.
- **Mobile (< md):** Sidebar and preview become full-screen views. Bottom tab bar for navigation. Each tab gets full viewport width and height (minus bottom bar).

Implemented via Tailwind responsive classes only — no JS media queries or "isMobile" state.

## Layout Changes

### converter.tsx (minimal)

The render block wraps both mobile and desktop layouts sharing the same state and props:

```
<div className="flex h-screen flex-col md:flex-row">
  {/* Desktop sidebar — hidden on mobile */}
  <Sidebar className="hidden md:flex md:w-[360px] ..." ... />

  {/* Desktop content area — hidden on mobile */}
  <div className="hidden md:flex md:flex-1 md:flex-col">
    <Toolbar ... />
    <DevicePreview ... />
  </div>

  {/* Mobile layout — hidden on desktop */}
  <MobileLayout className="flex md:hidden ..." ... />
</div>
```

No restructuring of state logic. Both layouts receive the same props from converter's existing state.

### New: mobile-layout.tsx

Thin wrapper component that renders:
1. Active tab content (full screen)
2. Bottom tab bar (fixed at bottom)

Receives the same props as Sidebar + DevicePreview + Toolbar (passed through from converter). Reuses existing tab content components directly — no duplication:
- `LibraryTab` — as-is
- `CalibreTab` — as-is
- `OptionsTab` — as-is
- `DeviceTab` — as-is
- Preview tab — renders `DevicePreview` + compact `Toolbar` strip

### sidebar.tsx

No internal changes. Gets `className` passthrough for `hidden md:flex` responsive classes.

### toolbar.tsx

On mobile (inside MobileLayout's Preview tab), renders with larger touch targets: `h-9` buttons instead of `h-7`.

### device-preview.tsx

Remove hardcoded 420px assumption from the width calc. On mobile without the sidebar, the preview naturally fills the screen using `100vw`.

## Bottom Tab Bar

Fixed `h-14` bar at screen bottom.

| Tab | Icon (lucide-react) | Label |
|-----|---------------------|-------|
| Library | `Library` | Library |
| Calibre | `BookOpen` | Calibre |
| Options | `SlidersHorizontal` | Options |
| Device | `Tablet` | Device |
| Preview | `Eye` | Preview |

Styling:
- `border-t border-border/50 bg-card`
- Icons: 20px
- Labels: `text-[10px]`
- Active: `text-primary`
- Inactive: `text-muted-foreground`
- Safe area: `pb-[env(safe-area-inset-bottom)]` for notched phones

State:
- Local `useState<string>` defaulting to `"library"` (library-first)
- URL sync via existing `tab` query param for deep linking
- No swipe gestures — tap only

## Touch & Mobile Polish

- **Upload area (LibraryTab):** Text changes to "Tap to upload" on mobile (no drag-drop on touch). File input click handler works as-is.
- **Library book actions:** Buttons get `h-9 w-9` touch targets on mobile.
- **Options/Sliders/Selects:** shadcn/base-ui components are already touch-compatible.
- **Page slider (DevicePreview):** Radix Slider already handles touch.
- **Viewport meta:** Add `viewport-fit=cover` to `layout.tsx` for safe area support on notched phones.

## Out of Scope

- PWA / service worker / offline support
- Web Worker activation for dithering
- Changes to WASM loading
- Changes to converter.tsx state management internals
- Responsive changes to existing dialogs (CalibreDialog already has `sm:` breakpoint)
- Landscape-specific mobile handling
- Performance optimizations for mobile (separate effort)

## Files Changed

| File | Change |
|------|--------|
| `src/components/converter/converter.tsx` | Wrap render in responsive layout (mobile hidden on desktop, desktop hidden on mobile) |
| `src/components/converter/mobile-layout.tsx` | **New** — mobile full-screen tab view + bottom bar |
| `src/components/converter/sidebar.tsx` | Add className passthrough, `hidden md:flex` |
| `src/components/converter/toolbar.tsx` | Accept optional `compact?: boolean` prop — when true (passed by MobileLayout), renders with `h-9` touch targets instead of `h-7` |
| `src/components/converter/device-preview.tsx` | Remove 420px min-width assumption |
| `src/app/layout.tsx` | Add `viewport-fit=cover` to viewport meta |
