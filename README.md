# History Viewer

A native macOS app for browsing and searching your browser history across Firefox and Safari in one unified timeline.

## Features

- Unified timeline view across Firefox, Safari, and Chrome
- Filter by today, yesterday, last 7 days, last 30 days, or a custom date range
- Full-text search across titles, URLs, and domains
- Click any entry to open it in your browser
- Dark UI, grouped by day and hour

## Install

Download the latest `.dmg` from the [Releases](https://github.com/parmsam/history-viewer/releases) page, open it, and drag **History Viewer** to Applications.

**First launch:** macOS will block the app since it's unsigned. Right-click → Open to bypass, or run:

```bash
xattr -dr com.apple.quarantine "/Applications/History Viewer.app"
```

## Requirements

- macOS 11+
- Firefox, Safari, and/or Chrome installed
- **Full Disk Access** for History Viewer in System Settings → Privacy & Security → Full Disk Access

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
