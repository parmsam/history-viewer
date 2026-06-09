import { useMemo, useState, useRef, useEffect } from "react";
// useRef/useEffect used by VisitsBarChart only
import { HistoryEntry } from "../types";
import {
  fromUnixTime, format, startOfWeek, endOfWeek,
  eachDayOfInterval, getDay, getHours,
} from "date-fns";

type Granularity = "day" | "week" | "month";

interface BarDatum { key: string; label: string; count: number }

function aggregateBars(
  activityByDay: Map<string, number>,
  rangeStart: Date,
  rangeEnd: Date,
  gran: Granularity,
): BarDatum[] {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  if (gran === "day") {
    return days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return { key, label: format(d, "MMM d"), count: activityByDay.get(key) ?? 0 };
    });
  }
  if (gran === "week") {
    const map = new Map<string, BarDatum>();
    for (const d of days) {
      const ws = startOfWeek(d, { weekStartsOn: 1 });
      const key = format(ws, "yyyy-MM-dd");
      const dc = activityByDay.get(format(d, "yyyy-MM-dd")) ?? 0;
      const ex = map.get(key);
      if (ex) ex.count += dc;
      else map.set(key, { key, label: format(ws, "MMM d"), count: dc });
    }
    return Array.from(map.values());
  }
  const map = new Map<string, BarDatum>();
  for (const d of days) {
    const key = format(d, "yyyy-MM");
    const dc = activityByDay.get(format(d, "yyyy-MM-dd")) ?? 0;
    const ex = map.get(key);
    if (ex) ex.count += dc;
    else map.set(key, { key, label: format(d, "MMM"), count: dc });
  }
  return Array.from(map.values());
}

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
  const [gran, setGran] = useState<Granularity>("day");

  const { domainStats, hourDayGrid, activityByDay, summaryStats } = useMemo(() => {
    const domainMap = new Map<string, number>();
    const hourDayGrid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const activityByDay = new Map<string, number>();
    const browsers = new Set<string>();

    for (const e of entries) {
      const dt = fromUnixTime(e.visit_time);
      domainMap.set(e.domain, (domainMap.get(e.domain) ?? 0) + 1);
      const jsDay = getDay(dt);
      const monDay = jsDay === 0 ? 6 : jsDay - 1;
      hourDayGrid[monDay][getHours(dt)]++;
      const key = format(dt, "yyyy-MM-dd");
      activityByDay.set(key, (activityByDay.get(key) ?? 0) + 1);
      browsers.add(e.browser);
    }

    const domainStats = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);

    const activeDays = activityByDay.size;
    const summaryStats = {
      totalVisits: entries.length,
      activeDays,
      avgPerDay: activeDays > 0 ? Math.round(entries.length / activeDays) : 0,
      topDomain: domainStats[0]?.domain ?? "—",
      browsers: browsers.size,
    };

    return { domainStats, hourDayGrid, activityByDay, summaryStats };
  }, [entries]);

  const bars = useMemo(
    () => aggregateBars(activityByDay, rangeStart, rangeEnd, gran),
    [activityByDay, rangeStart, rangeEnd, gran],
  );

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

        {/* ── Summary cards ── */}
        <div className="stats-cards">
          {[
            { value: summaryStats.totalVisits.toLocaleString(), label: "Total Visits" },
            { value: summaryStats.activeDays.toLocaleString(), label: "Active Days" },
            { value: summaryStats.avgPerDay.toLocaleString(), label: "Avg Visits / Day" },
            { value: summaryStats.topDomain, label: "Top Domain", small: true },
            { value: summaryStats.browsers.toString(), label: "Browsers" },
          ].map(({ value, label, small }) => (
            <div key={label} className="stat-card">
              <span className={`stat-card-value${small ? " stat-card-value-sm" : ""}`}>{value}</span>
              <span className="stat-card-label">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Activity calendar ── */}
        <div className="stats-panel">
          <h3 className="stats-heading">Activity</h3>
          <div style={{ overflowX: "auto" }}>
            <ActivityCalendar
              weeks={calWeeks}
              activityByDay={activityByDay}
              maxCount={maxDayCount}
              onHover={tip}
              onLeave={noTip}
            />
          </div>
        </div>

        {/* ── Two-column: chart + hour grid | top domains ── */}
        <div className="stats-two-col">
          <div className="stats-panel stats-col-left">
            <div className="stats-heading-row">
              <h3 className="stats-heading">Visits Over Time</h3>
              <div className="gran-toggle">
                {(["day", "week", "month"] as Granularity[]).map((g) => (
                  <button
                    key={g}
                    className={`gran-btn${gran === g ? " active" : ""}`}
                    onClick={() => setGran(g)}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <VisitsBarChart bars={bars} gran={gran} onHover={tip} onLeave={noTip} />
            <h3 className="stats-heading stats-subheading">Activity by Hour</h3>
            <HourDayGrid grid={hourDayGrid} maxCount={maxHourCount} onHover={tip} onLeave={noTip} />
          </div>

          <div className="stats-panel stats-col-right">
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

// ── Visits-over-time bar chart ──────────────────────────────────────────────────

interface BarChartProps {
  bars: BarDatum[];
  gran: Granularity;
  onHover: (e: React.MouseEvent, text: string) => void;
  onLeave: () => void;
}

function VisitsBarChart({ bars, gran, onHover, onLeave }: BarChartProps) {
  const maxCount = Math.max(...bars.map((b) => b.count), 1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapW(el.clientWidth);
    const obs = new ResizeObserver((entries) => setWrapW(entries[0].contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const padLeft = 44;
  const padTop = 10;
  const padBottom = 24;
  const padRight = 12;
  const chartH = 130;
  const svgH = padTop + chartH + padBottom;

  const availW = Math.max(wrapW - padLeft - padRight, 1);
  const step = Math.max(2, Math.floor(availW / Math.max(bars.length, 1)));
  const barW = Math.max(1, step - Math.max(1, Math.round(step * 0.25)));
  const svgW = wrapW;

  const minLabelPx = 48;
  const labelEvery = Math.max(1, Math.ceil(minLabelPx / step));

  const gridFracs = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="vbc-wrap" ref={wrapRef}>
      <svg width={svgW} height={svgH} className="vbc-svg">
        {gridFracs.map((frac) => {
          const y = padTop + chartH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={padLeft} x2={svgW - 12} y1={y} y2={y} className="vbc-gridline" />
              <text x={padLeft - 5} y={y + 4} className="vbc-ylabel">
                {Math.round(maxCount * frac).toLocaleString()}
              </text>
            </g>
          );
        })}

        <line
          x1={padLeft} x2={svgW - 12}
          y1={padTop + chartH} y2={padTop + chartH}
          className="vbc-baseline"
        />

        {bars.map((b, i) => {
          const barH = b.count === 0 ? 0 : Math.max(2, (b.count / maxCount) * chartH);
          const x = padLeft + i * step;
          const y = padTop + chartH - barH;
          return (
            <rect
              key={b.key}
              x={x} y={y}
              width={barW} height={barH || 0}
              rx={gran === "month" ? 3 : gran === "week" ? 2 : 1}
              className="vbc-bar"
              onMouseEnter={(e) =>
                onHover(e, `${b.label}: ${b.count.toLocaleString()} visit${b.count !== 1 ? "s" : ""}`)
              }
              onMouseLeave={onLeave}
            />
          );
        })}

        {bars.map((b, i) => {
          if (i % labelEvery !== 0) return null;
          return (
            <text
              key={b.key}
              x={padLeft + i * step + barW / 2}
              y={svgH - 6}
              className="vbc-xlabel"
            >
              {b.label}
            </text>
          );
        })}
      </svg>
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
