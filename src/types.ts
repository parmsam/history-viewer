export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visit_time: number; // Unix timestamp seconds
  browser: "firefox" | "safari" | "chrome";
  domain: string;
}

export interface BrowserStatus {
  firefox: boolean;
  safari: boolean;
  chrome: boolean;
}

export type QuickRange = "today" | "yesterday" | "last7" | "last30" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}
