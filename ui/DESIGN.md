# CodeNex design system

Principle: **a focused workspace, not a landing page.** The product is the editor and the agent; chrome stays quiet. Clarity first, one accent, motion only where it explains something.

## Layout
- **Empty state** (no files yet): a centred composer with suggestion chips and a `⌘↵` hint. Nothing else.
- **Workspace**: three resizable panes (`react-resizable-panels`): Files (~240px, collapsible) | Editor (tabs, dirty dot) | Agent (~360px, thread + composer at the bottom). Sizes persist.
- **< 768px**: one pane at a time, switched with a Files / Code / Agent segmented control.
- Empty → workspace transition animates once (layout animation).

## Tokens (`ui/styles/globals.css`, mapped in `tailwind.config.js`)
- Dark first, light supported (`data-theme` on `<html>`, saved in `localStorage`, set before paint in `_document.js`).
- Neutrals: zinc-like scale (`bg`, `panel`, `raised`, `hover`, `border`). Elevation = hairline border + soft shadow. No glass, no blur.
- One accent (violet). Used only for the primary action, focus rings and the active selection. Semantic `success` / `warn` / `danger`.
- Type: Geist Sans + Geist Mono (self-hosted via `geist`). Scale 12 / 13 / 14 / 16 / 20 / 28, weights 400 / 500 / 600. UI and code are 13px.
- Spacing on a 4px grid. Radius: 6px controls, 10px panels, 14px composer.
- Contrast: all text pairs meet WCAG 2.2 AA in both themes (checked with a contrast script).

## Motion
- 120–180ms, ease-out for enter, spring only for layout. Animate `opacity` and `transform` only.
- Respect `prefers-reduced-motion` (CSS + `MotionConfig reducedMotion="user"`). No ambient/looping motion except the loading skeleton.
- `framer-motion` runs through `LazyMotion` (`m.*` components) to keep the bundle small.

## Interaction
- `⌘/Ctrl+K` command palette · `⌘/Ctrl+Enter` run · `⌘/Ctrl+S` save · `⌘/Ctrl+B` toggle files · `⌘/Ctrl+/` focus composer.
- **Edit and Fix show a diff first** (backend `preview: true`). The user accepts (saves) or rejects. Nothing is written silently.
- Honest status: the header pill reflects `/api/health` (amber = demo/mock model, red = offline). The API-key field lives in Settings and opens only when the server requires auth.
- Progress is a stage line in the agent thread ("Thinking… → Wrote app.py"). Real token streaming (SSE) is phase 2.

## Performance and accessibility budget
- First-load JS for `/` ≤ ~180 kB; CodeMirror is lazy-loaded (`next/dynamic`).
- Visible `:focus-visible` rings, full keyboard path, `aria-live` for status and toasts, 24px+ hit targets.
