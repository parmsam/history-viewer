import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DateFilter, presetRange } from "./components/DateFilter";
import { Timeline } from "./components/Timeline";
import { HistoryEntry, BrowserStatus, QuickRange, DateRange } from "./types";
import { endOfDay, startOfDay } from "date-fns";
import "./App.css";

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

  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>({ firefox: false, safari: false, chrome: false });
  const [enabledBrowsers, setEnabledBrowsers] = useState<Set<string>>(new Set());

  const [quickRange, setQuickRange] = useState<QuickRange>("today");
  const [customRange, setCustomRange] = useState<DateRange>(() => presetRange("today"));
  const [activeRange, setActiveRange] = useState<DateRange>(() => presetRange("today"));

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filtered, setFiltered] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // Detect which browsers are available
  useEffect(() => {
    invoke<BrowserStatus>("get_browser_status").then((status) => {
      setBrowserStatus(status);
      const enabled = new Set<string>();
      if (status.firefox) enabled.add("firefox");
      if (status.safari) enabled.add("safari");
      if (status.chrome) enabled.add("chrome");
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

  // Client-side search filter
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(entries);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(
      entries.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.url.toLowerCase().includes(q) ||
          e.domain.toLowerCase().includes(q)
      )
    );
  }, [query, entries]);

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
          <div className="browser-toggles">
            {browserStatus.firefox && (
              <button
                className={`browser-toggle firefox ${enabledBrowsers.has("firefox") ? "on" : "off"}`}
                onClick={() => toggleBrowser("firefox")}
              >
                Firefox
              </button>
            )}
            {browserStatus.safari && (
              <button
                className={`browser-toggle safari ${enabledBrowsers.has("safari") ? "on" : "off"}`}
                onClick={() => toggleBrowser("safari")}
              >
                Safari
              </button>
            )}
            {browserStatus.chrome && (
              <button
                className={`browser-toggle chrome ${enabledBrowsers.has("chrome") ? "on" : "off"}`}
                onClick={() => toggleBrowser("chrome")}
              >
                Chrome
              </button>
            )}
          </div>
        </div>
        <div className="topbar-right">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode">
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              placeholder="Search titles, URLs, domains… (⌘F)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
        <div className="result-count">
          {loading ? (
            <span className="loading-label">Loading…</span>
          ) : (
            <span>{visibleCount.toLocaleString()} visit{visibleCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      <main className="main-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Reading browser history…</p>
          </div>
        ) : (
          <Timeline entries={filtered} />
        )}
      </main>
    </div>
  );
}
