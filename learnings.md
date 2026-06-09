# Key Learnings

Concepts and non-obvious insights behind this codebase. Useful if you're reading the code to learn, or returning after time away.

---

## 1. Tauri Architecture — Two Processes, One App

The app has two completely separate runtimes:

- **Rust process** (`src-tauri/src/lib.rs`) — native OS access, file I/O, SQLite reads
- **Web process** (`src/`) — React UI running in a WebView

They communicate via **IPC (Inter-Process Communication)**. Rust exposes named commands; TypeScript calls them like async functions:

```rust
// Rust: declare and register a command
#[tauri::command]
fn get_history(browsers: Vec<String>, start_ts: i64, end_ts: i64) -> HistoryResult { ... }

.invoke_handler(tauri::generate_handler![get_history, get_browser_status])
```

```ts
// TypeScript: call it
const result = await invoke<{ entries: HistoryEntry[]; errors: string[] }>("get_history", { ... });
```

The IPC boundary is also a **trust boundary** — the web layer cannot touch the filesystem directly. Only Rust can. That separation is intentional security design.

---

## 2. Rust Error Handling — Errors as Values

Rust has no exceptions. Every failure is a value you must handle explicitly.

- `Option<T>` — either `Some(value)` or `None` (like nullable, but enforced by the compiler)
- `Result<T, E>` — either `Ok(value)` or `Err(error)`
- The `?` operator — if the value is `None`/`Err`, return early from the current function immediately

```rust
fn copy_db(source: &PathBuf, suffix: &str) -> Result<PathBuf, String> {
    let dest = ...;
    fs::copy(source, &dest).map_err(|e| format!("Failed: {e}"))?;
    // ^ if copy fails, returns Err early. Otherwise continues.
    Ok(dest)
}
```

This makes failure impossible to ignore. The compiler forces you to handle every error case.

---

## 3. Three Different Timestamp Systems

Each browser stores visit times with a different epoch and unit — getting this wrong produces dates in 1601 or 2054:

| Browser | Unit | Epoch |
|---------|------|-------|
| Firefox | Microseconds | Unix epoch: 1970-01-01 |
| Chrome  | Microseconds | Windows FILETIME: 1601-01-01 |
| Safari  | Seconds (float) | Apple epoch: 2001-01-01 |

```rust
// Firefox
let start_us = start_ts * 1_000_000;

// Chrome — offset from 1601 to 1970
const FILETIME_TO_UNIX_US: i64 = 11_644_473_600 * 1_000_000;
let start_chrome = start_ts * 1_000_000 + FILETIME_TO_UNIX_US;

// Safari — offset from 1970 to 2001
const APPLE_EPOCH_OFFSET: f64 = 978_307_200.0;
let start_apple = start_ts as f64 - APPLE_EPOCH_OFFSET;
```

Whenever you work with raw timestamps from any database or API, always identify: *what epoch* and *what unit*.

---

## 4. SQLite WAL Mode — Why We Copy Before Reading

SQLite in WAL (Write-Ahead Log) mode uses **three files**: `.sqlite`, `.sqlite-wal`, `.sqlite-shm`. Two reasons we copy to `/tmp` before reading:

1. The browser holds a lock on the live file — reading it directly fails.
2. If you copy only the main `.sqlite` file, recent writes still in the WAL are missing — you get an inconsistent snapshot.

Copying all three files together gives a self-consistent, unlocked snapshot to query safely.

---

## 5. React `useEffect` Dependency Array

```ts
// Runs once on mount
useEffect(() => { ... }, []);

// Runs whenever fetchHistory changes identity
useEffect(() => { fetchHistory(); }, [fetchHistory]);

// Event listener with cleanup — the return function runs on unmount
useEffect(() => {
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

**The rule:** everything the effect *reads* must be in the dependency array. Omit a dependency and the effect runs with a stale value. Missing the cleanup return = memory leaks and ghost event listeners.

---

## 6. `useCallback` and `useMemo` — Referential Stability

Every React re-render creates new function and object references. Without memoization, this causes infinite loops:

```ts
// Without useCallback, fetchHistory is a new function every render.
// The useEffect sees a new dependency every render → fires again → re-render → repeat.
const fetchHistory = useCallback(async () => { ... }, [enabledBrowsers, activeRange]);
useEffect(() => { fetchHistory(); }, [fetchHistory]);
```

```ts
// groupEntries is expensive — useMemo skips re-running it unless entries changes
const groups = useMemo(() => groupEntries(entries), [entries]);
```

- `useCallback` — memoizes a **function reference**
- `useMemo` — memoizes a **computed value**

---

## 7. `Map` for O(1) Grouping

Grouping entries by day then hour uses a `Map` for a single O(n) pass:

```ts
const dayMap = new Map<string, DayGroup>();
for (const entry of entries) {
  const dayKey = format(d, "yyyy-MM-dd");
  if (!dayMap.has(dayKey)) dayMap.set(dayKey, { ... });
  dayMap.get(dayKey)!.hours...
}
```

The naive alternative — `filter()` for each day — is O(n²). For 10,000 entries that's 100,000,000 operations vs. 10,000. Use a Map whenever grouping or deduplicating by a key.

---

## 8. Component Composition — State Lives Where It's Used

The UI hierarchy:

```
App
├── DateFilter
└── Timeline
    └── DaySection (per day)
        └── HourSection (per hour) ← owns its own expanded/collapsed state
            └── EntryRow (per visit)
```

`HourSection` manages its own `expanded` boolean — `App` doesn't know or care. `EntryRow` receives one entry. The principle: push state down as close to where it's used as possible, and lift it up only when siblings need to share it.

---

## 9. Serde — Rust ↔ JSON Without Boilerplate

The `#[derive(Serialize, Deserialize)]` attribute auto-generates all JSON conversion code:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub visit_time: i64,
    ...
}
```

Tauri serializes this automatically when it crosses the IPC bridge. The matching TypeScript type in `src/types.ts` must be kept in sync manually — drift between the two is a common source of bugs in Tauri apps.

---

## 10. TypeScript Generics on External Calls

```ts
const result = await invoke<{ entries: HistoryEntry[]; errors: string[] }>("get_history", { ... });
```

The `<{ ... }>` tells TypeScript what shape to expect. Without it, `result` is `unknown` and you can't access any properties. This pattern applies everywhere you call an external API or boundary — the type doesn't come from the runtime, you assert it, so you're responsible for keeping it accurate.

---

## 11. macOS Gatekeeper, Quarantine, and Code Signing Tiers

When you download a file from the internet, macOS silently attaches a hidden extended attribute to it:

```bash
com.apple.quarantine
```

This is the Gatekeeper flag. When you try to open an app that has this flag, macOS checks whether the app is signed and notarized. What happens depends on the signing tier:

| Tier | How | macOS behavior |
|------|-----|----------------|
| Unsigned | No signing | "App is damaged and can't be opened" — hard block, Terminal required |
| Ad-hoc signed | `codesign -s -` (free) | "Unidentified developer" — right-click → Open works |
| Developer ID signed | $99/year Apple Developer account | "Unidentified developer" — right-click → Open works |
| Signed + notarized | Developer ID + Apple's notary service | No warning at all |

The `xattr` workaround simply removes the quarantine flag entirely:

```bash
xattr -dr com.apple.quarantine "/Applications/History Viewer.app"
```

- `-d` removes the attribute
- `-r` applies recursively to everything inside the `.app` bundle

Once the flag is gone, Gatekeeper never runs its check and the app opens freely. This is the practical install path for unsigned open-source apps distributed outside the Mac App Store.

**Why notarization costs money:** the "Developer ID Application" certificate required for distribution outside the App Store is only available with a paid Apple Developer Program membership ($99/year). Without it, you can ad-hoc sign for free (better UX than unsigned), but you can't fully bypass Gatekeeper for end users.

---

## 12. MCP Server — stdio JSON-RPC, Not HTTP

The MCP server (`mcp-server/`) is a standalone Rust binary that speaks JSON-RPC 2.0 over **stdin/stdout**, not a network socket. Claude Code (or any MCP host) spawns it as a subprocess and pipes messages to it.

Key rules of the protocol:
- Every request has an `"id"` field. Responses must echo it back.
- **Notifications** (e.g., `notifications/initialized`) have **no `"id"`**. You must silently ignore them — responding to a notification would violate the protocol.
- Each response is one JSON line followed by a newline flush. Buffering without flushing means the host never sees the reply.

```rust
// Notifications have no "id" — skip them
let id = match msg.get("id") {
    Some(id) => id.clone(),
    None => continue,   // ← silently drop notifications
};
```

The four methods the host calls: `initialize`, `ping`, `tools/list`, `tools/call`. Everything else returns an error.

---

## 13. Favicon Fallback — Google's CDN + `onError`

Rather than bundling any icons, `DomainIcon` fetches favicons from Google's public service:

```ts
<img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
     onError={() => setImgFailed(true)} />
```

If the image fails (unknown domain, offline, privacy blocker), `onError` sets state and the component re-renders as a colored letter avatar instead. The color is deterministic — derived by hashing the domain string — so the same domain always gets the same color.

The `onError` + state swap pattern is the standard React approach for graceful image degradation. The key insight: you can't know whether a remote image will load until the browser tries, so you handle failure reactively rather than pre-checking.

---

## 14. JavaScript `getDay()` Is Sunday-First — Converting to Mon-First

JavaScript's `Date.getDay()` returns 0 for Sunday, 1 for Monday, …, 6 for Saturday. Most calendar UIs (and this heatmap) show Monday as the first row. The conversion is a one-liner, but the formula is non-obvious:

```ts
const jsDay = getDay(dt);             // 0 = Sun, 1 = Mon, ..., 6 = Sat
const monDay = jsDay === 0 ? 6 : jsDay - 1;  // 0 = Mon, ..., 6 = Sun
```

Sunday (`0`) wraps to `6` (last row). Every other day just shifts back by one. Get this wrong and Sunday visits appear in the Monday row and everything is off by one.

---

## 15. Build-Time Constants via Vite `define`

The app displays its own version number and compares it to the latest GitHub release. The version comes from `package.json` — but that file isn't readable at runtime in a compiled Tauri bundle. Vite's `define` config solves this by replacing a token with a literal value **at build time**:

```ts
// vite.config.ts
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
```

```ts
// App.tsx — __APP_VERSION__ is replaced with e.g. "0.3.2" before bundling
if (semverGt(latest, __APP_VERSION__)) { ... }
```

After bundling, every occurrence of `__APP_VERSION__` in the source is replaced with the string literal `"0.3.2"` (or whatever version is in `package.json`). TypeScript needs a declaration too — `vite-env.d.ts` adds `declare const __APP_VERSION__: string` to satisfy the type checker.
