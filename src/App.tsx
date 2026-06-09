import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DateFilter, presetRange } from "./components/DateFilter";
import { Timeline } from "./components/Timeline";
import { StatsView } from "./components/StatsView";
import { HistoryEntry, BrowserStatus, QuickRange, DateRange } from "./types";
import { endOfDay, format, startOfDay } from "date-fns";
import "./App.css";

const GITHUB_URL = "https://github.com/parmsam/history-viewer";
const RELEASES_URL = "https://github.com/parmsam/history-viewer/releases/latest";
const RELEASES_API = "https://api.github.com/repos/parmsam/history-viewer/releases/latest";

function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

const BROWSER_CONFIG: { key: keyof BrowserStatus; label: string }[] = [
  { key: "firefox", label: "Firefox" },
  { key: "safari",  label: "Safari"  },
  { key: "chrome",  label: "Chrome"  },
  { key: "edge",    label: "Edge"    },
  { key: "brave",   label: "Brave"   },
  { key: "arc",     label: "Arc"     },
];

type ViewMode = "timeline" | "stats";

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "dark"
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("hv-theme", next);
    setTheme(next);
  }

  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>({
    firefox: false, safari: false, chrome: false, edge: false, brave: false, arc: false,
  });
  const [enabledBrowsers, setEnabledBrowsers] = useState<Set<string>>(new Set());

  const [quickRange, setQuickRange] = useState<QuickRange>("today");
  const [customRange, setCustomRange] = useState<DateRange>(() => presetRange("today"));
  const [activeRange, setActiveRange] = useState<DateRange>(() => presetRange("today"));

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filtered, setFiltered] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [regexMode, setRegexMode] = useState(false);
  const [regexError, setRegexError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Check for a newer GitHub release once on mount
  useEffect(() => {
    fetch(RELEASES_API, { headers: { Accept: "application/vnd.github.v3+json" } })
      .then((r) => r.json())
      .then((data: { tag_name?: string }) => {
        const latest = (data.tag_name ?? "").replace(/^v/, "");
        if (latest && semverGt(latest, __APP_VERSION__)) {
          setUpdateVersion(latest);
        }
      })
      .catch(() => {/* no-op: offline or API error */});
  }, []);

  useEffect(() => {
    invoke<BrowserStatus>("get_browser_status").then((status) => {
      setBrowserStatus(status);
      const enabled = new Set<string>();
      for (const { key } of BROWSER_CONFIG) {
        if (status[key]) enabled.add(key);
      }
      setEnabledBrowsers(enabled);
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    if (enabledBrowsers.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<{ entries: HistoryEntry[]; errors: string[] }>("get_history", {
        browsers: Array.from(enabledBrowsers),
        startTs: Math.floor(activeRange.start.getTime() / 1000),
        endTs: Math.floor(activeRange.end.getTime() / 1000),
      });
      setEntries(result.entries);
      setError(result.errors.length > 0 ? result.errors.join(" | ") : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [enabledBrowsers, activeRange]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Client-side search filter — plain text or regex
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(entries);
      setRegexError(false);
      return;
    }

    if (regexMode) {
      try {
        const re = new RegExp(query, "i");
        setRegexError(false);
        setFiltered(entries.filter((e) => re.test(e.title) || re.test(e.url) || re.test(e.domain)));
      } catch {
        setRegexError(true);
        setFiltered([]);
      }
    } else {
      const q = query.toLowerCase();
      setFiltered(
        entries.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.url.toLowerCase().includes(q) ||
            e.domain.toLowerCase().includes(q)
        )
      );
    }
  }, [query, entries, regexMode]);

  function handleQuickRange(r: QuickRange) {
    setQuickRange(r);
    if (r !== "custom") {
      const range = presetRange(r);
      setActiveRange(range);
      setCustomRange(range);
    }
  }

  function handleCustomRange(r: DateRange) {
    setCustomRange(r);
    setActiveRange({ start: startOfDay(r.start), end: endOfDay(r.end) });
  }

  function toggleBrowser(b: string) {
    setEnabledBrowsers((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  function showExportMsg(msg: string) {
    setExportMsg(msg);
    setTimeout(() => setExportMsg(null), 4000);
  }

  async function exportData(fmt: "csv" | "json") {
    let content: string;
    if (fmt === "json") {
      content = JSON.stringify(filtered, null, 2);
    } else {
      const headers = ["visit_time", "title", "url", "domain", "browser"];
      const rows = filtered.map((e) =>
        [
          new Date(e.visit_time * 1000).toISOString(),
          `"${e.title.replace(/"/g, '""')}"`,
          `"${e.url.replace(/"/g, '""')}"`,
          e.domain,
          e.browser,
        ].join(",")
      );
      content = [headers.join(","), ...rows].join("\n");
    }

    const ts = format(new Date(), "yyyyMMdd-HHmmss");
    const filename = `history-${ts}.${fmt}`;
    try {
      const path = await invoke<string>("save_export", { content, filename });
      showExportMsg(`Saved to ${path.replace(/.*\//, "~/Downloads/")}`);
    } catch (e) {
      showExportMsg(`Export failed: ${e}`);
    }
  }

  // Cmd+F focuses search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleCount = filtered.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="app-title">History Viewer</span>
          <span className="app-version">v{__APP_VERSION__}</span>
          <div className="browser-toggles">
            {BROWSER_CONFIG.filter(({ key }) => browserStatus[key]).map(({ key, label }) => (
              <button
                key={key}
                className={`browser-toggle ${key} ${enabledBrowsers.has(key) ? "on" : "off"}`}
                onClick={() => toggleBrowser(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-right">
          <button
            className="icon-btn"
            onClick={() => openUrl(GITHUB_URL)}
            title="View on GitHub"
            aria-label="GitHub repository"
          >
            <svg className="github-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09
                2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82
                2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01
                2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </button>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode">
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              ref={searchRef}
              className={`search-input${regexError ? " search-input-error" : ""}`}
              type="text"
              placeholder={regexMode ? "Regex… (⌘F)" : "Search titles, URLs, domains… (⌘F)"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className={`regex-toggle${regexMode ? " active" : ""}`}
              onClick={() => { setRegexMode((p) => !p); setRegexError(false); }}
              title={regexMode ? "Switch to plain text search" : "Switch to regex search"}
            >
              .*
            </button>
            {query && (
              <button className="search-clear" onClick={() => setQuery("")}>✕</button>
            )}
          </div>
        </div>
      </header>

      <div className="filter-bar">
        <DateFilter
          quickRange={quickRange}
          customRange={customRange}
          onQuickRange={handleQuickRange}
          onCustomRange={handleCustomRange}
        />
        <div className="view-toggle">
          <button
            className={`view-btn${viewMode === "timeline" ? " active" : ""}`}
            onClick={() => setViewMode("timeline")}
          >
            Timeline
          </button>
          <button
            className={`view-btn${viewMode === "stats" ? " active" : ""}`}
            onClick={() => setViewMode("stats")}
          >
            Stats
          </button>
        </div>
        <div className="result-count">
          {exportMsg ? (
            <span className="export-msg">{exportMsg}</span>
          ) : loading ? (
            <span className="loading-label">Loading…</span>
          ) : (
            <span>{visibleCount.toLocaleString()} visit{visibleCount !== 1 ? "s" : ""}</span>
          )}
          <button className="refresh-btn" onClick={fetchHistory} disabled={loading} title="Refresh history">↻</button>
          <button className="export-btn" onClick={() => exportData("csv")} disabled={loading || filtered.length === 0} title="Export as CSV">↓CSV</button>
          <button className="export-btn" onClick={() => exportData("json")} disabled={loading || filtered.length === 0} title="Export as JSON">↓JSON</button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {updateVersion && !updateDismissed && (
        <div className="update-banner">
          <span>↑ History Viewer v{updateVersion} is available</span>
          <button
            className="update-download-btn"
            onClick={() => openUrl(RELEASES_URL)}
          >
            Download
          </button>
          <button className="update-dismiss-btn" onClick={() => setUpdateDismissed(true)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <main className="main-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Reading browser history…</p>
          </div>
        ) : viewMode === "stats" ? (
          <StatsView entries={filtered} rangeStart={activeRange.start} rangeEnd={activeRange.end} />
        ) : (
          <Timeline entries={filtered} />
        )}
      </main>
    </div>
  );
}
