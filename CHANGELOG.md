# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.3.0] — 2026-06-09

### Added
- **Edge, Brave, and Arc browser support** — history from all three Chromium-based browsers now appears in the timeline; browser toggle buttons appear automatically when a browser is detected
- **Real favicons** — each entry shows the site's actual favicon (via Google's favicon service) with a colored-initial fallback if unavailable
- **Stats view** — alternate view (toggle in filter bar) showing top 25 most visited domains with bar chart and a 24-hour time-of-day visit heatmap
- **Export to CSV / JSON** — filter results, then use ↓CSV or ↓JSON buttons to save to `~/Downloads`
- **Regex search mode** — `.*` toggle on the search input switches between plain-text and regex filtering; invalid regex highlights the input in red
- **GitHub icon** — one-click link to the repository from the topbar
- **Update checker** — on launch, checks the GitHub releases API and shows a dismissable banner with a Download button if a newer version is available
- **Version number in topbar** — always-visible `vX.X.X` label next to the app title

---

## [0.2.1] — 2026-06-09

### Added
- Refresh button (↻) in the filter bar to manually re-fetch history without restarting the app
- README note explaining history sync behavior: data is a snapshot taken at load/refresh, and Chrome may lag due to buffered writes

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
