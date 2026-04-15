import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type {
  ActionItem,
  ActionStatus,
  EntryStatus,
  Finding,
  LineStatus,
  Priority,
  RepeatedTopic,
  ResearchEntry,
  ResearchIndex,
  ResearchLine,
  Source,
  SourceKind,
  TopicReference,
} from "../../../shared/domain";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sampleResearchPath = path.join(repoRoot, "data", "sample", "research");
const generatedIndexPath = path.join(repoRoot, "data", "generated", "index.json");
const publicIndexPath = path.join(repoRoot, "web", "public", "data", "generated", "index.json");

const stopWords = new Set([
  "about",
  "after",
  "algo",
  "ante",
  "cada",
  "como",
  "con",
  "contra",
  "cuando",
  "desde",
  "donde",
  "esta",
  "este",
  "esto",
  "foco",
  "hacia",
  "hasta",
  "into",
  "para",
  "pero",
  "porque",
  "sobre",
  "that",
  "their",
  "there",
  "these",
  "usar",
  "using",
  "with",
  "without",
  "desde",
  "linea",
  "lineas",
  "entry",
  "entries",
  "hallazgo",
  "hallazgos",
  "fuente",
  "fuentes",
  "accion",
  "acciones",
  "research",
  "visor",
  "gemma",
  "gema",
  "openclaw",
  "local",
  "primera",
  "version",
  "the",
  "and",
  "del",
  "las",
  "los",
  "una",
  "unos",
  "unas",
  "por",
  "que",
  "sus",
  "mas",
  "muy",
  "sin",
  "not",
  "all",
  "are",
  "los",
  "las",
  "from"
]);

const WATCH_MODE = process.argv.includes("--watch");
const WATCH_INTERVAL_MS = 3000;

let lastMtimes = new Map<string, number>();

const API_PORT = parseInt(process.env.INDEXER_API_PORT || "3456", 10);
let currentResearchPath: string | null = null;
let isIndexing = false;

async function main() {
  const researchPath = await resolveResearchPath();
  currentResearchPath = researchPath;

  if (WATCH_MODE) {
    process.stdout.write(`Watch mode enabled for: ${researchPath}\n`);
    process.stdout.write(`Polling every ${WATCH_INTERVAL_MS}ms\n`);
    process.stdout.write(`API server on http://127.0.0.1:${API_PORT}\n\n`);

    await runIndexer(researchPath);

    startApiServer();

    setInterval(async () => {
      try {
        const hasChanges = await checkForChanges(researchPath);
        if (hasChanges) {
          process.stdout.write(`[${new Date().toISOString()}] Changes detected, reindexing...\n`);
          await runIndexer(researchPath);
        }
      } catch (error) {
        process.stderr.write(`[${new Date().toISOString()}] Watch error: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }, WATCH_INTERVAL_MS);

    process.stdout.write("Watching for changes... (Ctrl+C to stop)\n");
  } else {
    await runIndexer(researchPath);
  }
}

function startApiServer() {
  const server = http.createServer(async (req, res) => {
    const setCors = () => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    };

    setCors();

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/api/status" && req.method === "GET") {
      try {
        const indexContent = await fs.readFile(generatedIndexPath, "utf8");
        const index = JSON.parse(indexContent) as ResearchIndex;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          isIndexing,
          generatedAt: index.generatedAt,
          sourcePath: index.sourcePath,
          stats: index.stats,
        }));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: "Could not read index" }));
      }
      return;
    }

    if (req.url === "/api/reindex" && req.method === "POST") {
      if (isIndexing) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "busy", message: "Indexing already in progress" }));
        return;
      }

      if (!currentResearchPath) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: "No research path configured" }));
        return;
      }

      isIndexing = true;
      const startTime = Date.now();

      try {
        await runIndexer(currentResearchPath);
        const duration = Date.now() - startTime;

        const indexContent = await fs.readFile(generatedIndexPath, "utf8");
        const index = JSON.parse(indexContent) as ResearchIndex;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "success",
          duration,
          generatedAt: index.generatedAt,
          stats: index.stats,
        }));
      } catch (error) {
        const duration = Date.now() - startTime;
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "error",
          duration,
          message: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        isIndexing = false;
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "error", message: "Not found" }));
  });

  server.listen(API_PORT, "127.0.0.1", () => {
    process.stdout.write(`[${new Date().toISOString()}] API server listening on http://127.0.0.1:${API_PORT}\n`);
    process.stdout.write(`  POST http://127.0.0.1:${API_PORT}/api/reindex - Trigger manual reindex\n`);
    process.stdout.write(`  GET  http://127.0.0.1:${API_PORT}/api/status   - Get index status\n\n`);
  });
}

async function runIndexer(researchPath: string) {
  const startTime = Date.now();
  const legacyLines = await loadLegacyLines(researchPath);
  const structuredLines = await loadStructuredLines(researchPath);
  const mergedLines = mergeLines([...legacyLines, ...structuredLines]);
  const repeatedTopics = buildRepeatedTopics(mergedLines);

  const index: ResearchIndex = {
    generatedAt: new Date().toISOString(),
    sourcePath: researchPath,
    stats: buildStats(mergedLines),
    repeatedTopics,
    lines: mergedLines,
  };

  const payload = `${JSON.stringify(index, null, 2)}\n`;

  await fs.mkdir(path.dirname(generatedIndexPath), { recursive: true });
  await fs.mkdir(path.dirname(publicIndexPath), { recursive: true });
  await fs.writeFile(generatedIndexPath, payload, "utf8");
  await fs.writeFile(publicIndexPath, payload, "utf8");

  const duration = Date.now() - startTime;
  process.stdout.write(`[${new Date().toISOString()}] Index generated in ${duration}ms from ${researchPath}\n`);
  process.stdout.write(`  lines: ${index.stats.lineCount}, entries: ${index.stats.entryCount}, findings: ${index.stats.findingCount}, actions: ${index.stats.actionCount}, sources: ${index.stats.sourceCount}\n`);

  await updateMtimes(researchPath);
}

async function checkForChanges(researchPath: string): Promise<boolean> {
  const currentMtimes = await collectMtimes(researchPath);

  if (currentMtimes.size !== lastMtimes.size) {
    return true;
  }

  for (const [filePath, mtime] of currentMtimes) {
    if (lastMtimes.get(filePath) !== mtime) {
      return true;
    }
  }

  return false;
}

async function updateMtimes(researchPath: string) {
  lastMtimes = await collectMtimes(researchPath);
}

async function collectMtimes(dir: string): Promise<Map<string, number>> {
  const mtimes = new Map<string, number>();

  async function traverse(currentDir: string) {
    const entries = await safeReadDir(currentDir);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) {
          await traverse(fullPath);
        }
      } else if (entry.isFile()) {
        if (isRelevantFile(entry.name)) {
          try {
            const stat = await fs.stat(fullPath);
            mtimes.set(fullPath, stat.mtimeMs);
          } catch {
            // skip files we can't stat
          }
        }
      }
    }
  }

  await traverse(dir);
  return mtimes;
}

function isRelevantFile(filename: string): boolean {
  const relevantExtensions = [".md", ".json"];
  return relevantExtensions.some(ext => filename.endsWith(ext));
}

async function resolveResearchPath() {
  const configuredPath = process.env.RESEARCH_PATH?.trim();

  if (!configuredPath) {
    return sampleResearchPath;
  }

  const absolutePath = path.resolve(configuredPath);

  try {
    const stats = await fs.stat(absolutePath);

    if (!stats.isDirectory()) {
      throw new Error(`RESEARCH_PATH is not a directory: ${absolutePath}`);
    }
  } catch (error) {
    throw new Error(`RESEARCH_PATH does not exist or is not readable: ${absolutePath}`, { cause: error });
  }

  return absolutePath;
}

async function loadLegacyLines(researchPath: string) {
  const children = await safeReadDir(researchPath);
  const lines: ResearchLine[] = [];

  for (const child of children) {
    if (!child.isDirectory() || child.name === "lines") {
      continue;
    }

    const lineDir = path.join(researchPath, child.name);
    const readmePath = path.join(lineDir, "README.md");
    const findingsPath = path.join(lineDir, "findings.md");
    const sourcesPath = path.join(lineDir, "sources.md");

    if (!(await exists(readmePath)) && !(await exists(findingsPath)) && !(await exists(sourcesPath))) {
      continue;
    }

    const [strategyMarkdown, findingsMarkdown, sourcesMarkdown] = await Promise.all([
      readText(readmePath),
      readText(findingsPath),
      readText(sourcesPath),
    ]);

    const title = extractTitle(strategyMarkdown) ?? humanizeSlug(child.name);
    const description = extractDescription(strategyMarkdown) || "Linea importada desde formato legado.";
    const findings = buildLegacyFindings(child.name, findingsMarkdown);
    const sources = buildLegacySources(child.name, sourcesMarkdown);
    const updatedAt = await latestTimestamp([readmePath, findingsPath, sourcesPath]);
    const entryId = `${child.name}--legacy-snapshot`;
    const entry: ResearchEntry = {
      id: entryId,
      lineSlug: child.name,
      slug: "legacy-snapshot",
      title: "Legacy snapshot",
      summary: "Entrada sintetica generada desde README.md, findings.md y sources.md.",
      summaryMarkdown: findingsMarkdown.trim() || "Sin hallazgos estructurados en formato legado.",
      timestamp: updatedAt,
      year: updatedAt.slice(0, 4),
      tags: deriveTagsFromTexts([strategyMarkdown, findingsMarkdown, sourcesMarkdown]).slice(0, 5),
      status: findings.length > 0 ? "active" : "new",
      priority: "unknown",
      sources: [],
      findings: findings.map((finding) => ({ ...finding, entryId })),
      actions: [],
      artifacts: [],
      origin: "legacy",
    };

    lines.push({
      slug: child.name,
      title,
      description,
      strategyMarkdown,
      tags: deriveTagsFromTexts([title, description, findingsMarkdown, sourcesMarkdown]).slice(0, 8),
      status: "unknown",
      priority: "unknown",
      origins: ["legacy"],
      sources,
      findings: entry.findings,
      actions: [],
      entries: [entry],
      lastUpdated: updatedAt,
    });
  }

  return lines;
}

async function loadStructuredLines(researchPath: string) {
  const linesRoot = path.join(researchPath, "lines");

  if (!(await exists(linesRoot))) {
    return [] as ResearchLine[];
  }

  const children = await safeReadDir(linesRoot);
  const result: ResearchLine[] = [];

  for (const child of children) {
    if (!child.isDirectory()) {
      continue;
    }

    const lineSlug = child.name;
    const lineDir = path.join(linesRoot, lineSlug);
    const lineJsonPath = path.join(lineDir, "line.json");
    const strategyPath = path.join(lineDir, "strategy.md");
    const sourcesPath = path.join(lineDir, "sources", "sources.json");
    const lineMeta = await readJsonFile<Record<string, unknown>>(lineJsonPath);
    const strategyMarkdown = await readText(strategyPath);
    const lineSources = buildStructuredSources(lineSlug, undefined, await readJsonArray(sourcesPath));
    const entries = await loadStructuredEntries(lineDir, lineSlug);
    const entryFindings = entries.flatMap((entry) => entry.findings);
    const entryActions = entries.flatMap((entry) => entry.actions);
    const lastUpdated = [
      ...entries.map((entry) => entry.timestamp),
      await latestTimestamp([lineJsonPath, strategyPath, sourcesPath]),
    ].filter(Boolean).sort().at(-1);

    result.push({
      slug: lineSlug,
      title: stringValue(lineMeta?.title) ?? humanizeSlug(lineSlug),
      description: stringValue(lineMeta?.description) ?? extractDescription(strategyMarkdown) ?? "Linea estructurada sin descripcion adicional.",
      strategyMarkdown,
      tags: normalizeStringArray(lineMeta?.tags),
      status: normalizeLineStatus(lineMeta?.status),
      priority: normalizePriority(lineMeta?.priority),
      origins: ["structured"],
      sources: lineSources,
      findings: entryFindings,
      actions: entryActions,
      entries,
      lastUpdated,
    });
  }

  return result;
}

async function loadStructuredEntries(lineDir: string, lineSlug: string) {
  const entriesRoot = path.join(lineDir, "entries");

  if (!(await exists(entriesRoot))) {
    return [] as ResearchEntry[];
  }

  const years = await safeReadDir(entriesRoot);
  const entries: ResearchEntry[] = [];

  for (const year of years) {
    if (!year.isDirectory()) {
      continue;
    }

    const yearDir = path.join(entriesRoot, year.name);
    const entryDirs = await safeReadDir(yearDir);

    for (const entryDir of entryDirs) {
      if (!entryDir.isDirectory()) {
        continue;
      }

      const folderName = entryDir.name;
      const folderPath = path.join(yearDir, folderName);
      const [rawMeta, summaryMarkdown, findingsData, actionsData] = await Promise.all([
        readJsonFile<Record<string, unknown>>(path.join(folderPath, "entry.json")),
        readText(path.join(folderPath, "summary.md")),
        readJsonArray(path.join(folderPath, "findings.json")),
        readJsonArray(path.join(folderPath, "actions.json")),
      ]);

      const entryId = `${lineSlug}--${folderName}`;
      const fallbackSlug = folderName.split("--").slice(1).join("--") || folderName;
      const timestamp = normalizeTimestamp(
        stringValue(rawMeta?.timestamp) ?? folderName.split("--")[0] ?? new Date().toISOString(),
      );
      const sources = buildStructuredSources(lineSlug, entryId, rawMeta?.sources);
      const findings = buildStructuredFindings(lineSlug, entryId, findingsData, timestamp);
      const actions = buildStructuredActions(lineSlug, entryId, actionsData);
      const artifacts = await readArtifactPaths(path.join(folderPath, "artifacts"), lineSlug, folderName);

      entries.push({
        id: entryId,
        lineSlug,
        slug: stringValue(rawMeta?.slug) ?? fallbackSlug,
        title: stringValue(rawMeta?.title) ?? humanizeSlug(fallbackSlug),
        summary: stringValue(rawMeta?.summary) ?? extractDescription(summaryMarkdown) ?? "Entrada estructurada sin resumen adicional.",
        summaryMarkdown,
        timestamp,
        year: year.name,
        tags: normalizeStringArray(rawMeta?.tags),
        status: normalizeEntryStatus(rawMeta?.status),
        priority: normalizePriority(rawMeta?.priority),
        sources,
        findings,
        actions,
        artifacts,
        origin: "structured",
      });
    }
  }

  return entries.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function mergeLines(lines: ResearchLine[]) {
  const bySlug = new Map<string, ResearchLine>();

  for (const line of lines) {
    const current = bySlug.get(line.slug);

    if (!current) {
      bySlug.set(line.slug, line);
      continue;
    }

    bySlug.set(line.slug, {
      slug: line.slug,
      title: preferText(current.title, line.title),
      description: preferText(current.description, line.description),
      strategyMarkdown: preferText(current.strategyMarkdown, line.strategyMarkdown),
      tags: uniqueStrings([...current.tags, ...line.tags]),
      status: current.status === "unknown" ? line.status : current.status,
      priority: current.priority === "unknown" ? line.priority : current.priority,
      origins: uniqueStrings([...current.origins, ...line.origins]) as ResearchLine["origins"],
      sources: mergeById([...current.sources, ...line.sources]),
      findings: mergeById([...current.findings, ...line.findings]),
      actions: mergeById([...current.actions, ...line.actions]),
      entries: mergeById([...current.entries, ...line.entries]),
      lastUpdated: [current.lastUpdated, line.lastUpdated].filter(Boolean).sort().at(-1),
    });
  }

  return [...bySlug.values()]
    .sort((left, right) => {
      const byUpdated = (right.lastUpdated ?? "").localeCompare(left.lastUpdated ?? "");
      return byUpdated !== 0 ? byUpdated : left.title.localeCompare(right.title);
    })
    .map((line) => ({
      ...line,
      entries: [...line.entries].sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
      findings: [...line.findings].sort((left, right) => (right.createdAt ?? line.lastUpdated ?? "").localeCompare(left.createdAt ?? line.lastUpdated ?? "")),
      actions: [...line.actions],
      sources: [...line.sources],
    }));
}

function buildStats(lines: ResearchLine[]) {
  return {
    lineCount: lines.length,
    entryCount: lines.reduce((total, line) => total + line.entries.length, 0),
    findingCount: lines.reduce((total, line) => total + line.findings.length, 0),
    actionCount: lines.reduce((total, line) => total + line.actions.length, 0),
    sourceCount: lines.reduce((total, line) => total + line.sources.length + line.entries.reduce((lineTotal, entry) => lineTotal + entry.sources.length, 0), 0),
  };
}

function buildLegacyFindings(lineSlug: string, markdown: string) {
  return extractMarkdownItems(markdown).map((item, index) => {
    const title = sentenceTitle(item);

    return {
      id: `${lineSlug}--finding-${index + 1}`,
      lineSlug,
      title,
      summary: item,
      detail: undefined,
      tags: deriveTagsFromTexts([item]).slice(0, 5),
      topicHints: deriveTagsFromTexts([title, item]).slice(0, 4),
      status: inferFindingStatus(item),
      createdAt: undefined,
      origin: "legacy",
    } satisfies Finding;
  });
}

function buildLegacySources(lineSlug: string, markdown: string) {
  return extractMarkdownItems(markdown).map((item, index) => {
    const parsed = parseSourceText(item);

    return {
      id: `${lineSlug}--source-${index + 1}`,
      lineSlug,
      title: parsed.title,
      url: parsed.url,
      note: parsed.note,
      tags: deriveTagsFromTexts([item]).slice(0, 5),
      kind: parsed.kind,
      createdAt: undefined,
      origin: "legacy",
    } satisfies Source;
  });
}

function buildStructuredSources(lineSlug: string, entryId: string | undefined, data: unknown): Source[] {
  const rawItems = coerceArray(data);

  return rawItems.flatMap((item, index) => {
    if (typeof item === "string") {
      const parsed = parseSourceText(item);

      return [{
        id: `${entryId ?? lineSlug}--source-${index + 1}`,
        lineSlug,
        entryId,
        title: parsed.title,
        url: parsed.url,
        note: parsed.note,
        tags: deriveTagsFromTexts([item]).slice(0, 5),
        kind: parsed.kind,
        createdAt: undefined,
        origin: "structured",
      } satisfies Source];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = stringValue(record.title) ?? stringValue(record.label) ?? stringValue(record.url) ?? `Source ${index + 1}`;

    return [{
      id: `${entryId ?? lineSlug}--source-${index + 1}`,
      lineSlug,
      entryId,
      title,
      url: stringValue(record.url),
      note: stringValue(record.note) ?? stringValue(record.summary),
      tags: normalizeStringArray(record.tags),
      kind: normalizeSourceKind(record.kind),
      createdAt: normalizeOptionalTimestamp(record.createdAt),
      origin: "structured",
    } satisfies Source];
  });
}

function buildStructuredFindings(lineSlug: string, entryId: string, data: unknown, fallbackTimestamp: string) {
  return coerceArray(data).flatMap((item, index) => {
    if (typeof item === "string") {
      return [{
        id: `${entryId}--finding-${index + 1}`,
        lineSlug,
        entryId,
        title: sentenceTitle(item),
        summary: item,
        detail: undefined,
        tags: deriveTagsFromTexts([item]).slice(0, 5),
        topicHints: deriveTagsFromTexts([item]).slice(0, 4),
        status: "active",
        createdAt: fallbackTimestamp,
        origin: "structured",
      } satisfies Finding];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const summary = stringValue(record.summary) ?? stringValue(record.detail) ?? stringValue(record.title) ?? `Finding ${index + 1}`;

    return [{
      id: `${entryId}--finding-${index + 1}`,
      lineSlug,
      entryId,
      title: stringValue(record.title) ?? sentenceTitle(summary),
      summary,
      detail: stringValue(record.detail),
      tags: normalizeStringArray(record.tags),
      topicHints: normalizeStringArray(record.topicHints),
      status: normalizeEntryStatus(record.status),
      createdAt: normalizeOptionalTimestamp(record.createdAt) ?? fallbackTimestamp,
      origin: "structured",
    } satisfies Finding];
  });
}

function buildStructuredActions(lineSlug: string, entryId: string, data: unknown) {
  return coerceArray(data).flatMap((item, index) => {
    if (typeof item === "string") {
      return [{
        id: `${entryId}--action-${index + 1}`,
        lineSlug,
        entryId,
        title: sentenceTitle(item),
        detail: item,
        status: "pending",
        priority: "medium",
        owner: undefined,
        dueDate: undefined,
        tags: deriveTagsFromTexts([item]).slice(0, 5),
        origin: "structured",
      } satisfies ActionItem];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;

    return [{
      id: `${entryId}--action-${index + 1}`,
      lineSlug,
      entryId,
      title: stringValue(record.title) ?? `Action ${index + 1}`,
      detail: stringValue(record.detail) ?? stringValue(record.summary),
      status: normalizeActionStatus(record.status),
      priority: normalizePriority(record.priority),
      owner: stringValue(record.owner),
      dueDate: normalizeOptionalTimestamp(record.dueDate),
      tags: normalizeStringArray(record.tags),
      origin: "structured",
    } satisfies ActionItem];
  });
}

function buildRepeatedTopics(lines: ResearchLine[]): RepeatedTopic[] {
  const buckets = new Map<string, { label: string; references: TopicReference[]; lineSlugs: Set<string>; entryIds: Set<string> }>();

  for (const line of lines) {
    addTopicReferences(buckets, line, [{ id: line.slug, text: `${line.title} ${line.description}`, type: "line" }]);

    for (const source of [...line.sources, ...line.entries.flatMap((entry) => entry.sources)]) {
      addTopicReferences(buckets, line, [{ id: source.id, text: `${source.title} ${source.note ?? ""}`, type: "source", entryId: source.entryId }]);
    }

    for (const finding of line.findings) {
      addTopicReferences(buckets, line, [{ id: finding.id, text: `${finding.title} ${finding.summary} ${finding.detail ?? ""} ${finding.topicHints.join(" ")}`, type: "finding", entryId: finding.entryId }]);
    }

    for (const action of line.actions) {
      addTopicReferences(buckets, line, [{ id: action.id, text: `${action.title} ${action.detail ?? ""}`, type: "action", entryId: action.entryId }]);
    }

    for (const entry of line.entries) {
      addTopicReferences(buckets, line, [{ id: entry.id, text: `${entry.title} ${entry.summary} ${entry.summaryMarkdown ?? ""}`, type: "entry", entryId: entry.id }]);
    }
  }

  return [...buckets.entries()]
    .map(([normalizedLabel, bucket]) => ({
      id: `topic-${normalizedLabel}`,
      label: bucket.label,
      normalizedLabel,
      occurrenceCount: bucket.references.length,
      lineSlugs: [...bucket.lineSlugs].sort(),
      entryIds: [...bucket.entryIds].sort(),
      references: bucket.references,
    }))
    .filter((topic) => topic.occurrenceCount >= 2)
    .sort((left, right) => {
      const byCount = right.occurrenceCount - left.occurrenceCount;
      return byCount !== 0 ? byCount : left.label.localeCompare(right.label);
    })
    .slice(0, 40);
}

function addTopicReferences(
  buckets: Map<string, { label: string; references: TopicReference[]; lineSlugs: Set<string>; entryIds: Set<string> }>,
  line: ResearchLine,
  items: Array<{ id: string; text: string; type: TopicReference["type"]; entryId?: string }>,
) {
  for (const item of items) {
    const seenTokens = new Set<string>();

    for (const token of extractTopicTokens(item.text)) {
      if (seenTokens.has(token)) {
        continue;
      }

      seenTokens.add(token);
      const current = buckets.get(token) ?? {
        label: humanizeToken(token),
        references: [],
        lineSlugs: new Set<string>(),
        entryIds: new Set<string>(),
      };

      current.references.push({
        type: item.type,
        lineSlug: line.slug,
        entryId: item.entryId,
        entityId: item.id,
      });
      current.lineSlugs.add(line.slug);

      if (item.entryId) {
        current.entryIds.add(item.entryId);
      }

      buckets.set(token, current);
    }
  }
}

function extractTopicTokens(text: string) {
  const words = normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));

  const tokens = [...words];

  for (let index = 0; index < words.length - 1; index += 1) {
    const bigram = `${words[index]} ${words[index + 1]}`;

    if (!stopWords.has(words[index] ?? "") && !stopWords.has(words[index + 1] ?? "")) {
      tokens.push(bigram);
    }
  }

  return tokens;
}

function deriveTagsFromTexts(texts: string[]) {
  const scores = new Map<string, number>();

  for (const text of texts) {
    for (const token of extractTopicTokens(text)) {
      if (token.includes(" ")) {
        continue;
      }

      scores.set(token, (scores.get(token) ?? 0) + 1);
    }
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token)
    .slice(0, 10);
}

function mergeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function preferText(current: string, candidate: string) {
  return candidate.trim().length > current.trim().length ? candidate : current;
}

function extractMarkdownItems(markdown: string) {
  const bulletItems = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*+]\s+|\d+\.\s+)/.test(line))
    .map((line) => line.replace(/^([-*+]\s+|\d+\.\s+)/, "").trim());

  if (bulletItems.length > 0) {
    return bulletItems;
  }

  return markdown
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.replace(/^#+\s+/gm, "").replace(/\r?\n/g, " ").trim())
    .filter((block) => block.length > 0);
}

function extractTitle(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function extractDescription(markdown: string) {
  return markdown
    .split(/\r?\n\s*\r?\n/)
    .map((block) => ({
      raw: block.trim(),
      normalized: block.replace(/^#+\s+/gm, "").replace(/\r?\n/g, " ").trim(),
    }))
    .find((block) => block.normalized.length > 0 && !/^#+\s+/.test(block.raw))
    ?.normalized;
}

function sentenceTitle(text: string) {
  return text.split(/[.!?]/)[0]?.trim().slice(0, 80) || text.slice(0, 80);
}

function parseSourceText(text: string) {
  const markdownLink = text.match(/\[(.+?)\]\((https?:\/\/[^)]+)\)/);
  const bareUrl = text.match(/https?:\/\/\S+/);
  const title = markdownLink?.[1] ?? text.split(" - ")[0]?.trim() ?? text;
  const url = markdownLink?.[2] ?? bareUrl?.[0];
  const strippedNote = text.replace(markdownLink?.[0] ?? url ?? title, "").replace(/^\s*[-:]\s*/, "").trim();
  const note = strippedNote || undefined;

  return {
    title,
    url,
    note,
    kind: normalizeSourceKind(text.includes("repo") ? "repo" : url ? "web" : "other"),
  };
}

function inferFindingStatus(text: string): EntryStatus {
  const normalized = normalizeText(text);

  if (normalized.includes("riesgo") || normalized.includes("duda") || normalized.includes("incierto")) {
    return "uncertain";
  }

  if (normalized.includes("conviene") || normalized.includes("aparece") || normalized.includes("sirve")) {
    return "active";
  }

  return "validated";
}

function humanizeSlug(slug: string) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeToken(token: string) {
  return token
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeTimestamp(value: string) {
  const normalized = value.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z");
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeOptionalTimestamp(value: unknown) {
  const rawValue = stringValue(value);
  return rawValue ? normalizeTimestamp(rawValue) : undefined;
}

function normalizeLineStatus(value: unknown): LineStatus {
  return oneOf(value, ["active", "paused", "archived", "unknown"]) ?? "unknown";
}

function normalizePriority(value: unknown): Priority {
  return oneOf(value, ["high", "medium", "low", "unknown"]) ?? "unknown";
}

function normalizeEntryStatus(value: unknown): EntryStatus {
  return oneOf(value, ["new", "active", "validated", "uncertain", "archived"]) ?? "active";
}

function normalizeActionStatus(value: unknown): ActionStatus {
  return oneOf(value, ["pending", "in_progress", "done", "blocked"]) ?? "pending";
}

function normalizeSourceKind(value: unknown): SourceKind {
  return oneOf(value, ["web", "document", "repo", "dataset", "person", "other"]) ?? "other";
}

function oneOf<T extends string>(value: unknown, allowed: T[]) {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : undefined;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function coerceArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      return record.items;
    }

    if (Array.isArray(record.findings)) {
      return record.findings;
    }

    if (Array.isArray(record.actions)) {
      return record.actions;
    }

    if (Array.isArray(record.sources)) {
      return record.sources;
    }
  }

  return [];
}

async function readArtifactPaths(artifactsDir: string, lineSlug: string, entryFolder: string) {
  if (!(await exists(artifactsDir))) {
    return [] as string[];
  }

  const files = await safeReadDir(artifactsDir);
  return files
    .filter((file) => file.isFile())
    .map((file) => path.posix.join("research", "lines", lineSlug, "entries", entryFolder.slice(0, 4), entryFolder, "artifacts", file.name));
}

async function latestTimestamp(paths: string[]) {
  const stats = await Promise.all(paths.map(async (currentPath) => {
    try {
      return await fs.stat(currentPath);
    } catch {
      return undefined;
    }
  }));

  const latest = stats
    .filter((stat): stat is NonNullable<typeof stat> => Boolean(stat))
    .sort((left, right) => right.mtime.toISOString().localeCompare(left.mtime.toISOString()))[0];

  return latest?.mtime.toISOString() ?? new Date().toISOString();
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readText(targetPath: string) {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return "";
  }
}

async function readJsonFile<T>(targetPath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function readJsonArray(targetPath: string) {
  return readJsonFile<unknown>(targetPath);
}

async function safeReadDir(targetPath: string) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
