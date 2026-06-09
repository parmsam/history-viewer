import { useMemo, useState } from "react";
import { HistoryEntry } from "../types";
import { DomainIcon } from "./DomainIcon";
import { format, fromUnixTime, isSameDay } from "date-fns";
import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  entries: HistoryEntry[];
}

interface HourGroup {
  hour: number;    // 0-23
  label: string;   // "2:00 PM"
  entries: HistoryEntry[];
}

interface DayGroup {
  date: Date;
  label: string;
  hours: HourGroup[];
  totalCount: number;
}

const BROWSER_LABEL: Record<string, string> = {
  firefox: "FF",
  safari:  "SF",
  chrome:  "CH",
  edge:    "ED",
  brave:   "BR",
  arc:     "AR",
};

function groupEntries(entries: HistoryEntry[]): DayGroup[] {
  const dayMap = new Map<string, DayGroup>();

  for (const entry of entries) {
    const d = fromUnixTime(entry.visit_time);
    const dayKey = format(d, "yyyy-MM-dd");

    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        date: d,
        label: format(d, "EEEE, MMMM d, yyyy"),
        hours: [],
        totalCount: 0,
      });
    }

    const day = dayMap.get(dayKey)!;
    const hour = d.getHours();
    let hourGroup = day.hours.find((h) => h.hour === hour);

    if (!hourGroup) {
      hourGroup = {
        hour,
        label: format(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour), "h:00 a"),
        entries: [],
      };
      day.hours.push(hourGroup);
    }

    hourGroup.entries.push(entry);
    day.totalCount++;
  }

  for (const day of dayMap.values()) {
    day.hours.sort((a, b) => b.hour - a.hour);
  }

  return Array.from(dayMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  const time = format(fromUnixTime(entry.visit_time), "h:mm:ss a");

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    try {
      await openUrl(entry.url);
    } catch {
      // ignore
    }
  }

  return (
    <div className="entry-row">
      <span className="entry-time">{time}</span>
      <DomainIcon domain={entry.domain} browser={entry.browser} />
      <div className="entry-content">
        <a className="entry-title" href={entry.url} onClick={handleClick} title={entry.url}>
          {entry.title || entry.url}
        </a>
        <span className="entry-url">{entry.domain}</span>
      </div>
      <span className={`browser-badge ${entry.browser}`}>
        {BROWSER_LABEL[entry.browser] ?? entry.browser.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function HourSection({ group }: { group: HourGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="hour-section">
      <button className="hour-header" onClick={() => setExpanded((p) => !p)}>
        <span className="hour-chevron">{expanded ? "▾" : "▸"}</span>
        <span className="hour-label">{group.label}</span>
        <span className="hour-count">{group.entries.length} visit{group.entries.length !== 1 ? "s" : ""}</span>
      </button>
      {expanded && (
        <div className="hour-entries">
          {group.entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function DaySection({ group }: { group: DayGroup }) {
  const isToday = isSameDay(group.date, new Date());

  return (
    <section className="day-section">
      <div className="day-header">
        <h2 className="day-label">
          {isToday ? "Today — " : ""}{group.label}
        </h2>
        <span className="day-count">{group.totalCount} visit{group.totalCount !== 1 ? "s" : ""}</span>
      </div>
      {group.hours.map((h) => (
        <HourSection key={h.hour} group={h} />
      ))}
    </section>
  );
}

export function Timeline({ entries }: Props) {
  const groups = useMemo(() => groupEntries(entries), [entries]);

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <p>No history found for this date range.</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {groups.map((g) => (
        <DaySection key={format(g.date, "yyyy-MM-dd")} group={g} />
      ))}
    </div>
  );
}
