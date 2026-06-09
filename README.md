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
3. **First launch:** macOS will block the app since it's unsigned. You may see *"History Viewer is damaged and can't be opened"* — this is a Gatekeeper false positive. Run:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/History Viewer.app"
   ```
   <details>
   <summary>Why is this needed?</summary>

   When you download a file from the internet, macOS silently tags it with a hidden attribute called `com.apple.quarantine`. This is the Gatekeeper flag that triggers the "damaged" warning for unsigned apps. The command above removes (`-d`) that attribute recursively (`-r`) from the app and everything inside it — after that, macOS treats it as if it was never downloaded from the internet and opens it without complaint.

   Fully eliminating this warning without the workaround requires Apple notarization, which requires an Apple Developer Program membership ($99/year). This is a personal open-source project, so that cost isn't justified.

   </details>
4. **Grant Full Disk Access** so the app can read your browser databases:
   - Open **System Settings → Privacy & Security → Full Disk Access**
   - Click the `+` button and add **History Viewer**
   - Relaunch the app

> Without Full Disk Access, History Viewer cannot read any browser history.

## Keeping history up to date

History Viewer reads a snapshot of your browser databases at the moment you open the app or hit the **↻ refresh button**. Data is not updated automatically while the app is open.

**Chrome:** Chrome holds a write lock on its history file while it's running. The app copies the file before reading, but Chrome may not have flushed recent visits to disk yet — visits from your current session can appear missing or incomplete. Close Chrome and refresh, or just refresh and accept that the last few minutes of Chrome history may lag.

**Firefox / Safari:** Generally flush to disk more reliably while open, but the same principle applies — refresh to get the latest data.

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
