export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visit_time: number; // Unix timestamp seconds
  browser: "firefox" | "safari" | "chrome" | "edge" | "brave" | "arc";
  domain: string;
}

export interface BrowserStatus {
  firefox: boolean;
  safari: boolean;
  chrome: boolean;
  edge: boolean;
  brave: boolean;
  arc: boolean;
}

export type QuickRange = "today" | "yesterday" | "last7" | "last30" | "last90" | "last365" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}
