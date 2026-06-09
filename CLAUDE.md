# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task | Command |
|------|---------|
| Dev server (Rust + React together) | `npm run tauri dev` |
| Type-check + frontend build | `npm run build` |
| Build .app bundle only | `npm run tauri build -- --bundles app` |
| Full release (app + DMG) | Use `/release` skill — do NOT use `npm run tauri build` alone |

## DMG Build Gotcha

`npm run tauri build` fails at the DMG step due to a leftover-temp-file issue in Tauri's bundler. The correct release process:

1. Build the .app: `npm run tauri build -- --bundles app`
2. Clean up any leftover temp files: `rm -f src-tauri/target/release/bundle/macos/rw.*.dmg`
3. Stage in a clean temp dir and create DMG with `hdiutil`:
   ```bash
   rm -rf /tmp/hv-staging && mkdir /tmp/hv-staging
   cp -r "src-tauri/target/release/bundle/macos/History Viewer.app" /tmp/hv-staging/
   hdiutil create -volname "History Viewer" -srcfolder /tmp/hv-staging -ov -format UDZO \
     "src-tauri/target/release/bundle/dmg/History Viewer_<version>_aarch64.dmg"
   ```

Use the `/release` skill to run this automatically.

## Architecture

- **macOS-only** despite Tauri's cross-platform support — hardcodes macOS library paths for browser databases
- **IPC boundary**: React (frontend) cannot access the filesystem. All database reads happen in Rust (`src-tauri/src/lib.rs`) and are exposed as Tauri commands (`get_history`, `get_browser_status`)
- **No server** — pure local app, all data stays on device
- **All app state lives in `App.tsx`** — no external state library
- **Client-side filtering** — search and browser toggles filter already-fetched entries in React, not via re-querying Rust

## Rust ↔ TypeScript Type Sync

Rust structs with `#[derive(Serialize, Deserialize)]` (in `lib.rs`) must be kept in sync manually with TypeScript interfaces (in `src/types.ts`). There is no automated validation across the IPC boundary — drift causes silent runtime failures.

## Browser Timestamp Epochs

Each browser stores visit times differently — getting this wrong produces dates in 1601 or 2054:

| Browser | Unit | Epoch |
|---------|------|-------|
| Firefox | Microseconds | Unix: 1970-01-01 |
| Chrome | Microseconds | Windows FILETIME: 1601-01-01 |
| Safari | Seconds (float) | Apple: 2001-01-01 |

## Theme Persistence

Light/dark mode preference is stored in `localStorage` under key `"hv-theme"`. The theme is applied before first paint via an inline script in `index.html` to avoid flash.

## Workflow

- Push directly to `main` — no branch or PR process
- Update `CHANGELOG.md` before bumping the version
- Version is defined in three places (keep in sync): `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- After changing the SVG logo, regenerate all platform icons: `npx tauri icon public/tauri.svg`
