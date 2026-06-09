use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub visit_time: i64, // Unix timestamp seconds
    pub browser: String,
    pub domain: String,
}

pub struct HistoryResult {
    pub entries: Vec<HistoryEntry>,
    pub errors: Vec<String>,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

pub fn extract_domain(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_string()
}

fn firefox_history_path() -> Option<PathBuf> {
    let profiles_dir = home_dir()?.join("Library/Application Support/Firefox/Profiles");
    fs::read_dir(&profiles_dir).ok()?.find_map(|entry| {
        let path = entry.ok()?.path();
        if path.is_dir() {
            let h = path.join("places.sqlite");
            if h.exists() { Some(h) } else { None }
        } else {
            None
        }
    })
}

fn chrome_history_path() -> Option<PathBuf> {
    let p = home_dir()?.join("Library/Application Support/Google/Chrome/Default/History");
    if p.exists() { Some(p) } else { None }
}

fn edge_history_path() -> Option<PathBuf> {
    let p = home_dir()?.join("Library/Application Support/Microsoft Edge/Default/History");
    if p.exists() { Some(p) } else { None }
}

fn brave_history_path() -> Option<PathBuf> {
    let p = home_dir()?.join("Library/Application Support/BraveSoftware/Brave-Browser/Default/History");
    if p.exists() { Some(p) } else { None }
}

fn arc_history_path() -> Option<PathBuf> {
    let p = home_dir()?.join("Library/Application Support/Arc/User Data/Default/History");
    if p.exists() { Some(p) } else { None }
}

fn safari_history_path() -> Option<PathBuf> {
    let p = home_dir()?.join("Library/Safari/History.db");
    if p.exists() { Some(p) } else { None }
}

fn copy_db(source: &PathBuf, suffix: &str) -> Result<PathBuf, String> {
    let dest = std::env::temp_dir().join(format!("hv_mcp_{}_{}.sqlite", suffix, std::process::id()));
    fs::copy(source, &dest).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            format!(
                "Permission denied reading {suffix} history. \
                 Grant Full Disk Access to your terminal in \
                 System Settings → Privacy & Security → Full Disk Access."
            )
        } else {
            format!("Failed to copy {suffix} database: {e}")
        }
    })?;
    for ext in &["sqlite-wal", "sqlite-shm"] {
        let src_extra = source.with_extension(ext);
        if src_extra.exists() {
            let _ = fs::copy(&src_extra, dest.with_extension(ext));
        }
    }
    Ok(dest)
}

fn cleanup(path: &PathBuf) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(path.with_extension("sqlite-wal"));
    let _ = fs::remove_file(path.with_extension("sqlite-shm"));
}

fn read_firefox(start_ts: i64, end_ts: i64) -> Result<Vec<HistoryEntry>, String> {
    let src = firefox_history_path().ok_or("Firefox profile not found")?;
    let tmp = copy_db(&src, "firefox")?;
    let conn = Connection::open_with_flags(
        &tmp,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Open Firefox db: {e}"))?;

    let start_us = start_ts * 1_000_000;
    let end_us = end_ts * 1_000_000;
    let mut stmt = conn
        .prepare(
            "SELECT v.id, p.url, COALESCE(NULLIF(p.title,''), p.url), v.visit_date
             FROM moz_historyvisits v
             JOIN moz_places p ON v.place_id = p.id
             WHERE v.visit_date >= ?1 AND v.visit_date <= ?2
               AND p.hidden = 0
             ORDER BY v.visit_date DESC",
        )
        .map_err(|e| format!("Prepare Firefox query: {e}"))?;

    let entries: Vec<HistoryEntry> = stmt
        .query_map([start_us, end_us], |row| {
            let visit_us: i64 = row.get(3)?;
            let url: String = row.get(1)?;
            let domain = extract_domain(&url);
            Ok(HistoryEntry {
                id: format!("firefox_{}", row.get::<_, i64>(0)?),
                url,
                title: row.get(2)?,
                visit_time: visit_us / 1_000_000,
                browser: "firefox".to_string(),
                domain,
            })
        })
        .map_err(|e| format!("Firefox query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    cleanup(&tmp);
    Ok(entries)
}

fn read_chromium(src: &PathBuf, browser: &str, start_ts: i64, end_ts: i64) -> Result<Vec<HistoryEntry>, String> {
    let tmp = copy_db(src, browser)?;
    let conn = Connection::open_with_flags(
        &tmp,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Open {browser} db: {e}"))?;

    const FILETIME_TO_UNIX_US: i64 = 11_644_473_600 * 1_000_000;
    let start_ch = start_ts * 1_000_000 + FILETIME_TO_UNIX_US;
    let end_ch = end_ts * 1_000_000 + FILETIME_TO_UNIX_US;
    let mut stmt = conn
        .prepare(
            "SELECT v.id, u.url, COALESCE(NULLIF(u.title,''), u.url), v.visit_time
             FROM visits v
             JOIN urls u ON v.url = u.id
             WHERE v.visit_time >= ?1 AND v.visit_time <= ?2
             ORDER BY v.visit_time DESC",
        )
        .map_err(|e| format!("Prepare {browser} query: {e}"))?;

    let browser_str = browser.to_string();
    let entries: Vec<HistoryEntry> = stmt
        .query_map([start_ch, end_ch], |row| {
            let visit_ch: i64 = row.get(3)?;
            let url: String = row.get(1)?;
            let domain = extract_domain(&url);
            Ok(HistoryEntry {
                id: format!("{}_{}", browser_str, row.get::<_, i64>(0)?),
                url,
                title: row.get(2)?,
                visit_time: (visit_ch - FILETIME_TO_UNIX_US) / 1_000_000,
                browser: browser_str.clone(),
                domain,
            })
        })
        .map_err(|e| format!("{browser} query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    cleanup(&tmp);
    Ok(entries)
}

fn read_safari(start_ts: i64, end_ts: i64) -> Result<Vec<HistoryEntry>, String> {
    let src = safari_history_path().ok_or("Safari history not found")?;
    let tmp = copy_db(&src, "safari")?;
    let conn = Connection::open_with_flags(
        &tmp,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Open Safari db: {e}"))?;

    const APPLE_EPOCH_OFFSET: f64 = 978_307_200.0;
    let start_apple = start_ts as f64 - APPLE_EPOCH_OFFSET;
    let end_apple = end_ts as f64 - APPLE_EPOCH_OFFSET;
    let mut stmt = conn
        .prepare(
            "SELECT v.id, i.url, COALESCE(NULLIF(v.title,''), i.url), v.visit_time
             FROM history_visits v
             JOIN history_items i ON v.history_item = i.id
             WHERE v.visit_time >= ?1 AND v.visit_time <= ?2
             ORDER BY v.visit_time DESC",
        )
        .map_err(|e| format!("Prepare Safari query: {e}"))?;

    let entries: Vec<HistoryEntry> = stmt
        .query_map([start_apple, end_apple], |row| {
            let visit_apple: f64 = row.get(3)?;
            let url: String = row.get(1)?;
            let domain = extract_domain(&url);
            Ok(HistoryEntry {
                id: format!("safari_{}", row.get::<_, i64>(0)?),
                url,
                title: row.get(2)?,
                visit_time: (visit_apple + APPLE_EPOCH_OFFSET) as i64,
                browser: "safari".to_string(),
                domain,
            })
        })
        .map_err(|e| format!("Safari query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    cleanup(&tmp);
    Ok(entries)
}

pub fn available_browsers() -> Vec<String> {
    let mut out = Vec::new();
    if firefox_history_path().is_some() { out.push("firefox".into()); }
    if safari_history_path().is_some()  { out.push("safari".into()); }
    if chrome_history_path().is_some()  { out.push("chrome".into()); }
    if edge_history_path().is_some()    { out.push("edge".into()); }
    if brave_history_path().is_some()   { out.push("brave".into()); }
    if arc_history_path().is_some()     { out.push("arc".into()); }
    out
}

pub fn get_history(browsers: &[String], start_ts: i64, end_ts: i64) -> HistoryResult {
    let mut all: Vec<HistoryEntry> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    if browsers.contains(&"firefox".to_string()) {
        match read_firefox(start_ts, end_ts) {
            Ok(mut v) => all.append(&mut v),
            Err(e) => errors.push(format!("Firefox: {e}")),
        }
    }
    if browsers.contains(&"safari".to_string()) {
        match read_safari(start_ts, end_ts) {
            Ok(mut v) => all.append(&mut v),
            Err(e) => errors.push(format!("Safari: {e}")),
        }
    }
    for browser in &["chrome", "edge", "brave", "arc"] {
        if browsers.contains(&browser.to_string()) {
            let path = match *browser {
                "chrome" => chrome_history_path(),
                "edge"   => edge_history_path(),
                "brave"  => brave_history_path(),
                "arc"    => arc_history_path(),
                _        => None,
            };
            match path {
                Some(p) => match read_chromium(&p, browser, start_ts, end_ts) {
                    Ok(mut v) => all.append(&mut v),
                    Err(e) => errors.push(e),
                },
                None => errors.push(format!("{browser}: profile not found")),
            }
        }
    }

    all.sort_by(|a, b| b.visit_time.cmp(&a.visit_time));
    HistoryResult { entries: all, errors }
}
