
# Minimal Japa Counter (React + TypeScript)

A minimalist prayer/chant counter with haptic feedback, daily logs & streaks, offline support, and fullscreen mode.

## Features
- Increment / decrement / reset with large readable display
- Haptic vibration on each count (mobile)
- Daily session log & streaks (localStorage)
- Offline-first PWA (Service Worker + Manifest)
- Fullscreen toggle
- Mobile-first UI; keyboard shortcuts on desktop

## Quick start
```bash
npm i
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages
1. Create a new GitHub repo (e.g. `japa-counter`).
2. In `vite.config.ts`, set:
   ```ts
   export default defineConfig({
     base: '/japa-counter/'
   })
   ```
3. Commit and push. Then:
   ```bash
   npm run build
   ```
4. Push the `dist/` folder to a `gh-pages` branch (or use a GitHub Action).
   ```bash
   git subtree push --prefix dist origin gh-pages
   ```
5. In GitHub → Settings → Pages, choose "Deploy from a branch" → `gh-pages` → `/ (root)`.

## Notes
- Vibration requires a user gesture; desktop may ignore it.
- Offline works after the first successful load (assets cached at runtime).
- Data is stored only on your device (localStorage).
