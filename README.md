<div align="center">
  <img src="public/tauri.svg" width="96" height="96" alt="History Viewer logo"/>
  <h1>History Viewer</h1>
  <p>A native macOS app for browsing and searching your browser history<br>across Firefox, Safari, and Chrome in one unified timeline.</p>
</div>

---

## Features

- Unified timeline view across Firefox, Safari, and Chrome
- Filter by today, yesterday, last 7 days, last 30 days, or a custom date range
- Full-text search across titles, URLs, and domains
- Click any entry to open it in your browser
- Dark UI, grouped by day and hour

## Install

1. Download the latest `.dmg` from the [Releases](https://github.com/parmsam/history-viewer/releases) page
2. Open the `.dmg` and drag **History Viewer** to Applications
3. **First launch:** macOS will block the app since it's unsigned. You may see *"History Viewer is damaged and can't be opened"* — this is a Gatekeeper false positive. Right-click → Open to bypass, or run:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/History Viewer.app"
   ```
   > Fully eliminating this warning requires Apple notarization, which requires an Apple Developer Program membership ($99/year). This is a personal open-source project, so that cost isn't justified — the `xattr` workaround is the intended install path.
4. **Grant Full Disk Access** so the app can read your browser databases:
   - Open **System Settings → Privacy & Security → Full Disk Access**
   - Click the `+` button and add **History Viewer**
   - Relaunch the app

> Without Full Disk Access, History Viewer cannot read any browser history.

## Requirements

- macOS 11+
- Firefox, Safari, and/or Chrome installed

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

The `.app` bundle will be in `src-tauri/target/release/bundle/macos/`.

## Tech stack

- [Tauri v2](https://tauri.app) — native shell
- React + TypeScript — UI
- Rust + rusqlite — reads browser SQLite databases directly
