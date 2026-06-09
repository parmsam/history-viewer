import { QuickRange, DateRange } from "../types";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

interface Props {
  quickRange: QuickRange;
  customRange: DateRange;
  onQuickRange: (r: QuickRange) => void;
  onCustomRange: (r: DateRange) => void;
}

function todayRange(): DateRange {
  const now = new Date();
  return { start: startOfDay(now), end: endOfDay(now) };
}

export function presetRange(r: QuickRange): DateRange {
  const now = new Date();
  switch (r) {
    case "today":     return todayRange();
    case "yesterday": return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
    case "last7":     return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "last30":    return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case "last90":    return { start: startOfDay(subDays(now, 89)), end: endOfDay(now) };
    case "last365":   return { start: startOfDay(subDays(now, 364)), end: endOfDay(now) };
    default:          return todayRange();
  }
}

export function DateFilter({ quickRange, customRange, onQuickRange, onCustomRange }: Props) {
  const presets: { label: string; value: QuickRange }[] = [
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "Last 7 days", value: "last7" },
    { label: "Last 30 days", value: "last30" },
    { label: "Last 90 days", value: "last90" },
    { label: "Last 1 year", value: "last365" },
    { label: "Custom", value: "custom" },
  ];

  const toInputDate = (d: Date) => format(d, "yyyy-MM-dd");

  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = new Date(e.target.value + "T00:00:00");
    if (!isNaN(d.getTime())) {
      onCustomRange({ start: startOfDay(d), end: customRange.end });
    }
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = new Date(e.target.value + "T00:00:00");
    if (!isNaN(d.getTime())) {
      onCustomRange({ start: customRange.start, end: endOfDay(d) });
    }
  }

  return (
    <div className="date-filter">
      <div className="preset-buttons">
        {presets.map((p) => (
          <button
            key={p.value}
            className={`preset-btn ${quickRange === p.value ? "active" : ""}`}
            onClick={() => onQuickRange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {quickRange === "custom" && (
        <div className="custom-range">
          <input
            type="date"
            value={toInputDate(customRange.start)}
            max={toInputDate(customRange.end)}
            onChange={handleStartChange}
          />
          <span className="range-sep">→</span>
          <input
            type="date"
            value={toInputDate(customRange.end)}
            min={toInputDate(customRange.start)}
            max={toInputDate(new Date())}
            onChange={handleEndChange}
          />
        </div>
      )}
    </div>
  );
}
