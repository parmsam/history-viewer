import { useMemo } from "react";
import { HistoryEntry } from "../types";
import { fromUnixTime } from "date-fns";

interface Props {
  entries: HistoryEntry[];
}

interface DomainStat {
  domain: string;
  count: number;
}

const HOUR_LABELS = [
  "12a","1a","2a","3a","4a","5a","6a","7a","8a","9a","10a","11a",
  "12p","1p","2p","3p","4p","5p","6p","7p","8p","9p","10p","11p",
];

export function StatsView({ entries }: Props) {
  const { domainStats, hourCounts, maxHourCount } = useMemo(() => {
    const domainMap = new Map<string, number>();
    const hourCounts = new Array(24).fill(0) as number[];

    for (const e of entries) {
      domainMap.set(e.domain, (domainMap.get(e.domain) ?? 0) + 1);
      const hour = fromUnixTime(e.visit_time).getHours();
      hourCounts[hour]++;
    }

    const domainStats: DomainStat[] = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);

    const maxHourCount = Math.max(...hourCounts, 1);

    return { domainStats, hourCounts, maxHourCount };
  }, [entries]);

  const maxCount = domainStats[0]?.count ?? 1;

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <p>No history found for this date range.</p>
      </div>
    );
  }

  return (
    <div className="stats-view">
      <div className="stats-section">
        <h3 className="stats-heading">Most Visited Sites</h3>
        <div className="domain-stats">
          {domainStats.map((s) => (
            <div key={s.domain} className="domain-stat-row">
              <span className="domain-stat-name">{s.domain}</span>
              <div className="domain-stat-bar-wrap">
                <div
                  className="domain-stat-bar"
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="domain-stat-count">{s.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-section">
        <h3 className="stats-heading">Time of Day</h3>
        <div className="heatmap">
          {hourCounts.map((count, hour) => {
            const intensity = count / maxHourCount;
            return (
              <div
                key={hour}
                className="heatmap-cell"
                style={{ "--intensity": intensity } as React.CSSProperties}
                title={`${HOUR_LABELS[hour]} — ${count.toLocaleString()} visit${count !== 1 ? "s" : ""}`}
              >
                <span className="heatmap-label">{HOUR_LABELS[hour]}</span>
              </div>
            );
          })}
        </div>
        <p className="heatmap-caption">Hover a cell to see the count. Color intensity = relative visit frequency.</p>
      </div>
    </div>
  );
}
