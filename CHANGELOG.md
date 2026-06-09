# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.0] — 2026-06-09

### Added
- Light and dark mode with a persistent toggle button (☀︎/☾) in the toolbar — preference saved across sessions
- Custom timeline icon replacing the default Tauri logo, regenerated across all platform sizes (dock, taskbar, DMG)
- `learnings.md` — documents key concepts and non-obvious insights behind the codebase

### Changed
- README header redesigned with centered logo, title, and tagline
- Gatekeeper install warning now includes a collapsible explanation of why the `xattr` workaround is needed
- `Cargo.toml` metadata updated with correct package name, description, and author

---

## [0.1.0] — 2026-06-04

### Added
- Unified timeline view across Firefox, Safari, and Chrome
- History grouped by day and hour, collapsible per hour
- Filter by today, yesterday, last 7 days, last 30 days, or custom date range
- Full-text search across titles, URLs, and domains (⌘F to focus)
- Browser toggle buttons to show/hide per-browser results
- Click any entry to open the URL in your default browser
- Dark UI with browser badges (FF / SF / CH) per entry
- Reads browser SQLite databases directly via Rust + rusqlite
- Copies browser databases to `/tmp` before reading to avoid lock conflicts and WAL inconsistencies

### Fixed
- Missing `chrome` field in `BrowserStatus` initial state
