import { useMemo, useState } from "react";
import { HistoryEntry } from "../types";
import {
  fromUnixTime, format, startOfWeek, endOfWeek,
  eachDayOfInterval, getDay, getHours,
} from "date-fns";

interface Props {
  entries: HistoryEntry[];
  rangeStart: Date;
  rangeEnd: Date;
}

interface Tooltip { x: number; y: number; text: string }

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ghLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0;
  const r = count / max;
  if (r < 0.15) return 1;
  if (r < 0.40) return 2;
  if (r < 0.70) return 3;
  return 4;
}

export function StatsView({ entries, rangeStart, rangeEnd }: Props) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const { domainStats, hourDayGrid, activityByDay } = useMemo(() => {
    const domainMap = new Map<string, number>();
    const hourDayGrid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const activityByDay = new Map<string, number>();

    for (const e of entries) {
      const dt = fromUnixTime(e.visit_time);
      domainMap.set(e.domain, (domainMap.get(e.domain) ?? 0) + 1);
      const jsDay = getDay(dt);
      const monDay = jsDay === 0 ? 6 : jsDay - 1;
      hourDayGrid[monDay][getHours(dt)]++;
      const key = format(dt, "yyyy-MM-dd");
      activityByDay.set(key, (activityByDay.get(key) ?? 0) + 1);
    }

    const domainStats = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);

    return { domainStats, hourDayGrid, activityByDay };
  }, [entries]);

  const maxDayCount = useMemo(
    () => Math.max(...Array.from(activityByDay.values()), 1),
    [activityByDay],
  );
  const maxHourCount = useMemo(() => {
    let max = 1;
    for (const row of hourDayGrid) for (const v of row) if (v > max) max = v;
    return max;
  }, [hourDayGrid]);

  const calWeeks = useMemo(() => {
    const calStart = startOfWeek(rangeStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(rangeEnd, { weekStartsOn: 1 });
    const all = eachDayOfInterval({ start: calStart, end: calEnd });
    const weeks: { date: Date; key: string; inRange: boolean }[][] = [];
    for (let i = 0; i < all.length; i += 7) {
      weeks.push(
        all.slice(i, i + 7).map((date) => ({
          date,
          key: format(date, "yyyy-MM-dd"),
          inRange: date >= rangeStart && date <= rangeEnd,
        })),
      );
    }
    return weeks;
  }, [rangeStart, rangeEnd]);

  const maxDomain = domainStats[0]?.count ?? 1;
  const tip = (e: React.MouseEvent, text: string) => setTooltip({ x: e.clientX, y: e.clientY, text });
  const noTip = () => setTooltip(null);

  if (entries.length === 0) {
    return <div className="empty-state"><p>No history found for this date range.</p></div>;
  }

  return (
    <>
      {tooltip && (
        <div className="gh-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 38 }}>
          {tooltip.text}
        </div>
      )}

      <div className="stats-view">
        <div className="stats-section">
          <h3 className="stats-heading">Most Visited Sites</h3>
          <div className="domain-stats">
            {domainStats.map((s) => (
              <div key={s.domain} className="domain-stat-row">
                <span className="domain-stat-name">{s.domain}</span>
                <div className="domain-stat-bar-wrap">
                  <div className="domain-stat-bar" style={{ width: `${(s.count / maxDomain) * 100}%` }} />
                </div>
                <span className="domain-stat-count">{s.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stats-section">
          <h3 className="stats-heading">Activity by Hour</h3>
          <HourDayGrid grid={hourDayGrid} maxCount={maxHourCount} onHover={tip} onLeave={noTip} />
        </div>

        <div className="stats-section stats-section-full">
          <h3 className="stats-heading">Activity by Day</h3>
          <ActivityCalendar
            weeks={calWeeks}
            activityByDay={activityByDay}
            maxCount={maxDayCount}
            onHover={tip}
            onLeave={noTip}
          />
        </div>
      </div>
    </>
  );
}

// ── Hour × Day grid ────────────────────────────────────────────────────────────

interface HourDayProps {
  grid: number[][];
  maxCount: number;
  onHover: (e: React.MouseEvent, text: string) => void;
  onLeave: () => void;
}

function HourDayGrid({ grid, maxCount, onHover, onLeave }: HourDayProps) {
  return (
    <div className="hdg">
      <div className="hdg-header">
        <div className="hdg-corner" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="hdg-hlabel">{h % 3 === 0 ? h : ""}</div>
        ))}
      </div>
      {grid.map((row, di) => (
        <div key={di} className="hdg-row">
          <span className="hdg-dlabel">{DAY_LABELS[di]}</span>
          {row.map((count, h) => (
            <div
              key={h}
              className={`hdg-cell gh-${ghLevel(count, maxCount)}`}
              onMouseEnter={(e) => onHover(e, `${DAY_LABELS[di]} ${h}:00 — ${count.toLocaleString()} visit${count !== 1 ? "s" : ""}`)}
              onMouseLeave={onLeave}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Activity-by-day calendar ────────────────────────────────────────────────────

interface CalProps {
  weeks: { date: Date; key: string; inRange: boolean }[][];
  activityByDay: Map<string, number>;
  maxCount: number;
  onHover: (e: React.MouseEvent, text: string) => void;
  onLeave: () => void;
}

function ActivityCalendar({ weeks, activityByDay, maxCount, onHover, onLeave }: CalProps) {
  const showDayLabel = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

  const monthWeeks = new Set<number>();
  weeks.forEach((week, wi) => {
    if (wi === 0 || week.some((d) => d.date.getDate() === 1)) monthWeeks.add(wi);
  });

  return (
    <div className="actcal">
      <div className="actcal-months">
        <div className="actcal-corner" />
        {weeks.map((week, wi) => (
          <div key={wi} className="actcal-month-cell">
            {monthWeeks.has(wi)
              ? format(week.find((d) => d.date.getDate() === 1)?.date ?? week[0].date, "MMM")
              : ""}
          </div>
        ))}
      </div>

      <div className="actcal-body">
        <div className="actcal-daylabels">
          {showDayLabel.map((label, i) => (
            <div key={i} className="actcal-daylabel">{label}</div>
          ))}
        </div>

        <div className="actcal-weeks">
          {weeks.map((week, wi) => (
            <div key={wi} className="actcal-week">
              {week.map((day, di) => {
                const count = activityByDay.get(day.key) ?? 0;
                const cls = !day.inRange ? "gh-out" : `gh-${ghLevel(count, maxCount)}`;
                return (
                  <div
                    key={di}
                    className={`actcal-cell ${cls}`}
                    onMouseEnter={(e) =>
                      day.inRange && onHover(e, `${format(day.date, "MMM d, yyyy")} — ${count.toLocaleString()} visit${count !== 1 ? "s" : ""}`)
                    }
                    onMouseLeave={onLeave}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
