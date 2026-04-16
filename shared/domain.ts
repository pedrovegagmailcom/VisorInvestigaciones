export type LineStatus = "active" | "paused" | "archived" | "unknown";
export type Priority = "low" | "medium" | "high" | "unknown";
export type EntryStatus = "new" | "active" | "validated" | "uncertain" | "archived";
export type ActionStatus = "pending" | "in_progress" | "done" | "blocked";
export type ItemOrigin = "legacy" | "structured";
export type SourceKind = "web" | "document" | "repo" | "dataset" | "person" | "other";

export interface Source {
  id: string;
  lineSlug: string;
  entryId?: string;
  title: string;
  url?: string;
  note?: string;
  tags: string[];
  kind: SourceKind;
  createdAt?: string;
  origin: ItemOrigin;
}

export interface Finding {
  id: string;
  lineSlug: string;
  entryId?: string;
  title: string;
  summary: string;
  detail?: string;
  tags: string[];
  topicHints: string[];
  status: EntryStatus;
  createdAt?: string;
  origin: ItemOrigin;
  /** IDs de fuentes relacionadas con este hallazgo */
  sourceIds?: string[];
}

export interface ActionItem {
  id: string;
  lineSlug: string;
  entryId?: string;
  title: string;
  detail?: string;
  status: ActionStatus;
  priority: Priority;
  owner?: string;
  dueDate?: string;
  tags: string[];
  origin: ItemOrigin;
}

export interface ResearchEntry {
  id: string;
  lineSlug: string;
  slug: string;
  title: string;
  summary: string;
  summaryMarkdown?: string;
  timestamp: string;
  year: string;
  tags: string[];
  status: EntryStatus;
  priority: Priority;
  sources: Source[];
  findings: Finding[];
  actions: ActionItem[];
  artifacts: string[];
  origin: ItemOrigin;
}

export interface ResearchLine {
  slug: string;
  title: string;
  description: string;
  strategyMarkdown: string;
  tags: string[];
  status: LineStatus;
  priority: Priority;
  origins: ItemOrigin[];
  sources: Source[];
  findings: Finding[];
  actions: ActionItem[];
  entries: ResearchEntry[];
  lastUpdated?: string;
  visualStatus?: "active" | "hidden" | "archived";
}

export interface TopicReference {
  type: "line" | "entry" | "finding" | "action" | "source";
  lineSlug: string;
  entryId?: string;
  entityId: string;
}

export interface RepeatedTopic {
  id: string;
  label: string;
  normalizedLabel: string;
  occurrenceCount: number;
  lineSlugs: string[];
  entryIds: string[];
  references: TopicReference[];
}

export interface ResearchStats {
  lineCount: number;
  entryCount: number;
  findingCount: number;
  actionCount: number;
  sourceCount: number;
}

export interface ResearchIndex {
  generatedAt: string;
  sourcePath: string;
  stats: ResearchStats;
  repeatedTopics: RepeatedTopic[];
  lines: ResearchLine[];
}

export const lineStatuses: LineStatus[] = ["active", "paused", "archived", "unknown"];
export const priorities: Priority[] = ["high", "medium", "low", "unknown"];
export const entryStatuses: EntryStatus[] = ["active", "new", "validated", "uncertain", "archived"];
export const actionStatuses: ActionStatus[] = ["pending", "in_progress", "done", "blocked"];
