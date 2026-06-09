use std::io::{self, BufRead, Write};

use chrono::TimeZone;
use serde_json::{json, Value};

mod history;

const VERSION: &str = "0.3.2";
fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let msg: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // MCP notifications have no "id" — do not respond to them
        let id = match msg.get("id") {
            Some(id) => id.clone(),
            None => continue,
        };

        let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = msg.get("params").cloned().unwrap_or(Value::Null);

        let response = match dispatch(method, &params) {
            Ok(result) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": result,
            }),
            Err(e) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {"code": -32603, "message": e},
            }),
        };

        if writeln!(out, "{}", serde_json::to_string(&response).unwrap()).is_err() {
            break;
        }
        let _ = out.flush();
    }
}

fn dispatch(method: &str, params: &Value) -> Result<Value, String> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "history-viewer", "version": VERSION},
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": tool_definitions()})),
        "tools/call" => call_tool(params),
        _ => Err(format!("unknown method: {method}")),
    }
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_history",
            "description": "Fetch browser history entries within a date range, sorted newest-first.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "browsers": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["firefox", "safari", "chrome", "edge", "brave", "arc"]
                        },
                        "description": "Browsers to include. Defaults to all detected browsers."
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Range start as ISO 8601 (e.g. '2024-01-15' or '2024-01-15T09:00:00Z'). Defaults to 7 days ago."
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Range end as ISO 8601. Defaults to now."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max entries to return. Defaults to 200."
                    }
                }
            }
        },
        {
            "name": "search_history",
            "description": "Search browser history using a regex pattern matched against URL and page title. Case-insensitive by default.",
            "inputSchema": {
                "type": "object",
                "required": ["pattern"],
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern to match against URL and title (e.g. 'github\\.com', 'rust.*async', '^https://news')."
                    },
                    "browsers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Browsers to search. Defaults to all detected browsers."
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Range start as ISO 8601. Defaults to 30 days ago."
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Range end as ISO 8601. Defaults to now."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max matches to return. Defaults to 50."
                    }
                }
            }
        }
    ])
}

fn call_tool(params: &Value) -> Result<Value, String> {
    let name = params
        .get("name")
        .and_then(|n| n.as_str())
        .ok_or("missing tool name")?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    match name {
        "get_history" => tool_get_history(&args),
        "search_history" => tool_search_history(&args),
        _ => Err(format!("unknown tool: {name}")),
    }
}

fn tool_get_history(args: &Value) -> Result<Value, String> {
    let now = chrono::Utc::now().timestamp();
    let start_ts = parse_date_arg(args, "start_date", now - 7 * 86400)?;
    let end_ts = parse_date_arg(args, "end_date", now)?;
    let limit = args.get("limit").and_then(|l| l.as_u64()).unwrap_or(200) as usize;
    let browsers = parse_browsers_arg(args);

    let result = history::get_history(&browsers, start_ts, end_ts);
    let entries: Vec<Value> = result
        .entries
        .iter()
        .take(limit)
        .map(format_entry)
        .collect();

    let mut lines = vec![format!(
        "{} entries ({} — {})",
        entries.len(),
        fmt_ts(start_ts),
        fmt_ts(end_ts),
    )];
    if !result.errors.is_empty() {
        lines.push(format!("Errors: {}", result.errors.join("; ")));
    }
    lines.push(serde_json::to_string_pretty(&entries).unwrap_or_default());

    Ok(json!({"content": [{"type": "text", "text": lines.join("\n")}]}))
}

fn tool_search_history(args: &Value) -> Result<Value, String> {
    let pattern_str = args
        .get("pattern")
        .and_then(|p| p.as_str())
        .ok_or("missing required parameter: pattern")?;

    let re = regex::RegexBuilder::new(pattern_str)
        .case_insensitive(true)
        .build()
        .map_err(|e| format!("invalid regex '{pattern_str}': {e}"))?;

    let now = chrono::Utc::now().timestamp();
    let start_ts = parse_date_arg(args, "start_date", now - 30 * 86400)?;
    let end_ts = parse_date_arg(args, "end_date", now)?;
    let limit = args.get("limit").and_then(|l| l.as_u64()).unwrap_or(50) as usize;
    let browsers = parse_browsers_arg(args);

    let result = history::get_history(&browsers, start_ts, end_ts);
    let matches: Vec<Value> = result
        .entries
        .iter()
        .filter(|e| re.is_match(&e.url) || re.is_match(&e.title))
        .take(limit)
        .map(format_entry)
        .collect();

    let mut lines = vec![format!(
        "{} matches for /{pattern_str}/ ({} — {})",
        matches.len(),
        fmt_ts(start_ts),
        fmt_ts(end_ts),
    )];
    if !result.errors.is_empty() {
        lines.push(format!("Errors: {}", result.errors.join("; ")));
    }
    lines.push(serde_json::to_string_pretty(&matches).unwrap_or_default());

    Ok(json!({"content": [{"type": "text", "text": lines.join("\n")}]}))
}

// --- helpers ---

fn format_entry(e: &history::HistoryEntry) -> Value {
    json!({
        "visited_at": fmt_ts(e.visit_time),
        "title": e.title,
        "url": e.url,
        "browser": e.browser,
        "domain": e.domain,
    })
}

fn fmt_ts(ts: i64) -> String {
    chrono::Utc
        .timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d %H:%M UTC").to_string())
        .unwrap_or_else(|| ts.to_string())
}

fn parse_date_arg(args: &Value, key: &str, default: i64) -> Result<i64, String> {
    match args.get(key).and_then(|v| v.as_str()) {
        None => Ok(default),
        Some(s) => parse_date(s),
    }
}

fn parse_date(s: &str) -> Result<i64, String> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Ok(dt.timestamp());
    }
    // Accept bare dates: "2024-01-15"
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Ok(d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp());
    }
    Err(format!("cannot parse date '{s}': expected ISO 8601 (e.g. '2024-01-15')"))
}

fn parse_browsers_arg(args: &Value) -> Vec<String> {
    args.get("browsers")
        .and_then(|b| b.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(history::available_browsers)
}
