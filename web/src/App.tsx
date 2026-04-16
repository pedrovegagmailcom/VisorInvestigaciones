import { useEffect, useMemo, useState } from "react";
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from "react-router-dom";

import type {
  ActionItem,
  Finding,
  ResearchEntry,
  ResearchIndex,
  ResearchLine,
  RepeatedTopic,
  Source,
  TopicReference,
} from "@shared/domain";
import { entryStatuses, lineStatuses, priorities } from "@shared/domain";
import type { VisualStatus } from "@shared/ui-state";

import { DebugPanel } from "./components/DebugPanel";
import { LineCard } from "./components/LineCard";
import { MarkdownBlock } from "./components/MarkdownBlock";
import { Panel } from "./components/Panel";
import { compactDate, formatDate, loadResearchIndex, matchesQuery, updateLineVisualStatus } from "./lib/data";

type SearchParamsSetter = ReturnType<typeof useSearchParams>[1];

const POLL_INTERVAL_MS = 5000;
const API_PORT = import.meta.env.VITE_INDEXER_API_PORT || "3456";
const API_URL = `http://127.0.0.1:${API_PORT}`;

type ReindexStatus = "idle" | "loading" | "success" | "error";

export function App() {
  const [index, setIndex] = useState<ResearchIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [lastUpdateType, setLastUpdateType] = useState<"auto" | "manual">("auto");
  const [reindexStatus, setReindexStatus] = useState<ReindexStatus>("idle");
  const [reindexMessage, setReindexMessage] = useState<string>("");
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  // Check API availability on mount and periodically
  useEffect(() => {
    async function checkApi() {
      try {
        const response = await fetch(`${API_URL}/api/status`, { method: "GET", signal: AbortSignal.timeout(2000) });
        setApiAvailable(response.ok);
      } catch {
        setApiAvailable(false);
      }
    }
    checkApi();
    
    // Recheck API availability every 10 seconds
    const apiInterval = setInterval(checkApi, 10000);
    return () => clearInterval(apiInterval);
  }, []);

  // Poll for index changes
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const nextIndex = await loadResearchIndex();
        if (!isMounted) return;

        setIndex((prevIndex) => {
          if (prevIndex && nextIndex.generatedAt !== prevIndex.generatedAt) {
            // Only mark as auto-update if we're not in the middle of a manual reindex
            // and the previous state was not already showing success
            setLastUpdate(new Date().toLocaleTimeString());
            setLastUpdateType((currentType) => {
              // If we were showing success from manual, keep it until user interacts again
              if (currentType === "manual" && reindexStatus === "idle") {
                return "auto";
              }
              return currentType === "manual" ? currentType : "auto";
            });
          }
          return nextIndex;
        });
        setError(null);
      } catch (nextError) {
        if (!isMounted) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }

    load();

    const interval = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReindex() {
    if (reindexStatus === "loading") return;

    setReindexStatus("loading");
    setReindexMessage("Reindexando datos...");

    try {
      const response = await fetch(`${API_URL}/api/reindex`, {
        method: "POST",
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json();

      if (response.ok && data.status === "success") {
        setReindexStatus("success");
        setReindexMessage(`Datos actualizados en ${data.duration}ms · ${data.stats.lineCount} líneas`);
        setLastUpdateType("manual");
        setLastUpdate(new Date().toLocaleTimeString());
        setTimeout(() => {
          setReindexStatus("idle");
          setReindexMessage("");
        }, 4000);
      } else if (data.status === "busy") {
        setReindexStatus("error");
        setReindexMessage("El indexador está ocupado. Inténtalo en unos segundos.");
        setTimeout(() => {
          setReindexStatus("idle");
          setReindexMessage("");
        }, 4000);
      } else {
        setReindexStatus("error");
        const errorMsg = data.message || "Error desconocido del indexador";
        setReindexMessage(`Error: ${errorMsg}`);
        setTimeout(() => {
          setReindexStatus("idle");
          setReindexMessage("");
        }, 6000);
      }
    } catch (err) {
      setReindexStatus("error");
      if (err instanceof Error && err.name === "AbortError") {
        setReindexMessage("Tiempo de espera agotado (30s). El índice puede ser muy grande.");
      } else if (err instanceof Error && err.name === "TypeError") {
        setReindexMessage(`No se pudo conectar al indexador en ${API_URL}. ¿Está ejecutándose 'npm run index:watch'?`);
      } else {
        setReindexMessage(`Error de conexión: ${err instanceof Error ? err.message : "Desconocido"}`);
      }
      setTimeout(() => {
        setReindexStatus("idle");
        setReindexMessage("");
      }, 6000);
    }
  }

  return (
    <HashRouter>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">
              VisorInvestigaciones
              {index && (
                <span className="live-indicator" title={`Auto-refresh cada ${POLL_INTERVAL_MS / 1000}s`}>
                  {lastUpdate && ` • ${lastUpdateType === "manual" ? "🔄" : "●"} ${lastUpdate}`}
                </span>
              )}
            </p>
            <h1>Memoria operativa local de investigacion</h1>
            <p className="subtitle">
              Indexado local desde archivos en disco, soporte legado y estructurado, y navegacion centrada en lineas, timeline, hallazgos, fuentes y acciones.
            </p>
          </div>
          <div className="header-actions">
            {apiAvailable !== null && (
              <>
                <button
                  className={`reindex-button reindex-button--${reindexStatus}`}
                  disabled={reindexStatus === "loading" || !apiAvailable}
                  onClick={handleReindex}
                  title={apiAvailable ? "Actualizar datos manualmente desde Gema" : "El servidor de indexado no está disponible. Ejecuta 'npm run index:watch' en otra terminal."}
                >
                  {reindexStatus === "loading" && "⏳ Actualizando..."}
                  {reindexStatus === "success" && "✅ Actualizado"}
                  {reindexStatus === "error" && "❌ Error"}
                  {reindexStatus === "idle" && (apiAvailable ? "🔄 Actualizar datos" : "⚠️ API no disponible")}
                </button>
                {!apiAvailable && reindexStatus === "idle" && (
                  <span className="reindex-hint">
                    Ejecuta <code>npm run index:watch</code> para habilitar
                  </span>
                )}
              </>
            )}
            {reindexMessage && reindexStatus !== "idle" && (
              <span className={`reindex-message reindex-message--${reindexStatus}`}>{reindexMessage}</span>
            )}
            <nav aria-label="Navegacion principal" className="top-nav">
              <NavLink className={({ isActive }) => navClassName(isActive)} to="/">
                Lineas
              </NavLink>
              <NavLink className={({ isActive }) => navClassName(isActive)} to="/debug">
                🔧 Debug
              </NavLink>
            </nav>
          </div>
        </header>

        {error ? (
          <main className="state-panel">
            <h2>No se pudo cargar el indice</h2>
            <p>{error}</p>
          </main>
        ) : null}

        {!error && !index ? (
          <main className="state-panel">
            <h2>Cargando indice...</h2>
            <p>Si es la primera vez, ejecuta `npm run index` antes de abrir la web.</p>
          </main>
        ) : null}

        {index ? (
          <>
            <section className="overview-grid" aria-label="Resumen global del indice">
              <StatCard label="Lineas" value={index.stats.lineCount} />
              <StatCard label="Entradas" value={index.stats.entryCount} />
              <StatCard label="Hallazgos" value={index.stats.findingCount} />
              <StatCard label="Acciones" value={index.stats.actionCount} />
              <StatCard label="Fuentes" value={index.stats.sourceCount} />
            </section>

            <Routes>
              <Route path="/" element={<HomePage index={index} />} />
              <Route path="/debug" element={<DebugPage />} />
              <Route path="/lines/:lineSlug" element={<LinePage index={index} />} />
              <Route path="/lines/:lineSlug/entries/:entryId" element={<EntryPage index={index} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        ) : null}
      </div>
    </HashRouter>
  );
}

function DebugPage() {
  return (
    <main className="content-stack">
      <div className="breadcrumbs">
        <Link to="/">Líneas</Link>
        <span>/</span>
        <span>Diagnóstico</span>
      </div>
      <DebugPanel />
    </main>
  );
}

function HomePage({ index }: { index: ResearchIndex }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const query = searchParams.get("q") ?? "";
  const format = searchParams.get("format") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const priority = searchParams.get("priority") ?? "all";
  const visualFilter = (searchParams.get("visual") ?? "active") as VisualStatus | "all";
  const selectedTopicId = searchParams.get("topic") ?? "";
  const selectedTopic = findTopic(index, selectedTopicId);

  const filteredLines = useMemo(() => {
    return index.lines.filter((line) => {
      const lineFormat = line.origins.length > 1 ? "hybrid" : line.origins[0];
      const searchBlob = buildLineSearchBlob(line);
      const matchesFormat = format === "all" || lineFormat === format;
      const matchesStatus = status === "all" || line.status === status;
      const matchesPriority = priority === "all" || line.priority === priority;
      const matchesTopic = !selectedTopic || selectedTopic.lineSlugs.includes(line.slug);
      const lineVisualStatus = line.visualStatus ?? "active";
      const matchesVisual = visualFilter === "all" || lineVisualStatus === visualFilter;

      return matchesFormat && matchesStatus && matchesPriority && matchesTopic && matchesVisual && matchesQuery(searchBlob, query);
    });
  }, [format, index.lines, priority, query, selectedTopic, status, visualFilter]);

  const lineCountsByVisual = useMemo(() => {
    return {
      active: index.lines.filter((l) => (l.visualStatus ?? "active") === "active").length,
      hidden: index.lines.filter((l) => l.visualStatus === "hidden").length,
      archived: index.lines.filter((l) => l.visualStatus === "archived").length,
    };
  }, [index.lines]);

  const repeatedTopics = useMemo(() => {
    return index.repeatedTopics
      .filter((topic) => {
        const visibleByQuery = matchesQuery(`${topic.label} ${topic.lineSlugs.join(" ")}`, query);
        const visibleByLine = filteredLines.some((line) => topic.lineSlugs.includes(line.slug));
        return visibleByQuery && visibleByLine;
      })
      .slice(0, 12);
  }, [filteredLines, index.repeatedTopics, query]);

  const hasActiveFilters = query || format !== "all" || status !== "all" || priority !== "all" || selectedTopicId || visualFilter !== "active";

  async function handleStatusChange(lineSlug: string, newStatus: VisualStatus) {
    const result = await updateLineVisualStatus(lineSlug, newStatus);
    if (result.success) {
      setStatusMessage({ type: "success", text: result.message });
    } else {
      setStatusMessage({ type: "error", text: result.message });
    }
    setTimeout(() => setStatusMessage(null), 4000);
  }

  return (
    <main className="content-stack">
      <Panel
        title="Exploracion"
        subtitle={`Indice generado el ${formatDate(index.generatedAt)} desde ${index.sourcePath}`}
        aside={
          hasActiveFilters ? (
            <button
              className="button button--ghost"
              onClick={() => clearParams(setSearchParams, ["q", "format", "status", "priority", "topic"])}
              type="button"
            >
              Limpiar filtros
            </button>
          ) : undefined
        }
      >
        <div className="filters-grid">
          <label>
            <span>Busqueda</span>
            <input
              onChange={(event) => updateParam(setSearchParams, searchParams, "q", event.target.value)}
              placeholder="timeline, mqtt, ruido, fuentes..."
              value={query}
            />
          </label>
          <label>
            <span>Formato</span>
            <select value={format} onChange={(event) => updateParam(setSearchParams, searchParams, "format", event.target.value)}>
              <option value="all">Todos</option>
              <option value="legacy">Legacy</option>
              <option value="structured">Structured</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={status} onChange={(event) => updateParam(setSearchParams, searchParams, "status", event.target.value)}>
              <option value="all">Todos</option>
              {lineStatuses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Prioridad</span>
            <select value={priority} onChange={(event) => updateParam(setSearchParams, searchParams, "priority", event.target.value)}>
              <option value="all">Todas</option>
              {priorities.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ActiveFilterBar
          items={[
            query ? `Busqueda: ${query}` : undefined,
            format !== "all" ? `Formato: ${format}` : undefined,
            status !== "all" ? `Estado: ${status}` : undefined,
            priority !== "all" ? `Prioridad: ${priority}` : undefined,
            selectedTopic ? `Tema: ${selectedTopic.label}` : undefined,
          ]}
        />

        {statusMessage && (
          <div className={`status-banner status-banner--${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}
      </Panel>

      <div className="layout-grid">
        <div className="content-stack">
          <Panel 
            title="Lineas de investigacion" 
            subtitle={`${filteredLines.length} lineas visibles`}
            aside={
              <div className="visual-tabs">
                <button
                  className={`visual-tab ${visualFilter === "active" ? "visual-tab--active" : ""}`}
                  onClick={() => updateParam(setSearchParams, searchParams, "visual", "active")}
                >
                  Activas ({lineCountsByVisual.active})
                </button>
                <button
                  className={`visual-tab ${visualFilter === "archived" ? "visual-tab--active" : ""}`}
                  onClick={() => updateParam(setSearchParams, searchParams, "visual", "archived")}
                >
                  Archivadas ({lineCountsByVisual.archived})
                </button>
                <button
                  className={`visual-tab ${visualFilter === "hidden" ? "visual-tab--active" : ""}`}
                  onClick={() => updateParam(setSearchParams, searchParams, "visual", "hidden")}
                >
                  Ocultas ({lineCountsByVisual.hidden})
                </button>
              </div>
            }
          >
            <div className="cards-grid">
              {filteredLines.map((line) => (
                <LineCard
                  href={linePath(line.slug, selectedTopic ? { topic: selectedTopic.id } : undefined)}
                  key={line.slug}
                  line={line}
                  matchingEntries={line.entries.filter((entry) => matchesQuery(buildEntrySearchBlob(entry), query)).length}
                  onStatusChange={handleStatusChange}
                />
              ))}
              {filteredLines.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">No hay líneas {visualFilter === "active" ? "activas" : visualFilter === "archived" ? "archivadas" : "ocultas"}.</p>
                  {visualFilter !== "active" && (
                    <button 
                      className="button button--ghost"
                      onClick={() => updateParam(setSearchParams, searchParams, "visual", "active")}
                    >
                      Ver líneas activas
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </Panel>
        </div>

        <aside className="sidebar-stack">
          <Panel
            title="Temas repetidos"
            subtitle="Ahora son filtros reales: selecciona uno para ver solo lo relacionado"
            aside={
              selectedTopic ? (
                <button className="button button--ghost" onClick={() => updateParam(setSearchParams, searchParams, "topic", "")} type="button">
                  Quitar tema
                </button>
              ) : undefined
            }
          >
            <TopicFilterList
              onToggle={(topicId) => toggleTopic(setSearchParams, searchParams, topicId)}
              selectedTopicId={selectedTopicId}
              topics={repeatedTopics}
            />
          </Panel>

          {selectedTopic ? <TopicFocusPanel index={index} topic={selectedTopic} /> : null}
        </aside>
      </div>
    </main>
  );
}

function LinePage({ index }: { index: ResearchIndex }) {
  const { lineSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const line = index.lines.find((candidate) => candidate.slug === lineSlug);

  if (!line) {
    return (
      <main className="state-panel">
        <h2>Linea no encontrada</h2>
        <p>La linea solicitada no existe en el indice actual.</p>
      </main>
    );
  }

  const query = searchParams.get("q") ?? "";
  const year = searchParams.get("year") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const selectedTopicId = searchParams.get("topic") ?? "";
  const lineTopics = index.repeatedTopics.filter((topic) => topic.lineSlugs.includes(line.slug)).slice(0, 12);
  const selectedTopic = lineTopics.find((topic) => topic.id === selectedTopicId);
  const years = [...new Set(line.entries.map((entry) => entry.year))].sort().reverse();

  const entries = line.entries.filter((entry) => {
    const matchesYear = year === "all" || entry.year === year;
    const matchesStatusFilter = status === "all" || entry.status === status;
    const matchesTopic = !selectedTopic || topicMatchesEntry(selectedTopic, entry);
    return matchesYear && matchesStatusFilter && matchesTopic && matchesQuery(buildEntrySearchBlob(entry), query);
  });

  const visibleFindings = line.findings.filter((finding) => {
    const matchesTopic = !selectedTopic || topicMatchesEntity(selectedTopic, line.slug, finding.id, finding.entryId);
    return matchesTopic && matchesQuery(`${finding.title} ${finding.summary} ${finding.detail ?? ""}`, query);
  });
  const visibleActions = line.actions.filter((action) => {
    const matchesTopic = !selectedTopic || topicMatchesEntity(selectedTopic, line.slug, action.id, action.entryId);
    return matchesTopic && matchesQuery(`${action.title} ${action.detail ?? ""}`, query);
  });
  const visibleSources = buildLineSourcesForView(line, selectedTopic).filter((source) => {
    return matchesQuery(`${source.title} ${source.note ?? ""}`, query);
  });
  // Todas las fuentes disponibles para la línea (para búsqueda de fuentes relacionadas en hallazgos)
  const allSources = [...line.sources, ...line.entries.flatMap((e) => e.sources)];
  const hasActiveFilters = query || year !== "all" || status !== "all" || selectedTopic;

  return (
    <main className="content-stack">
      <div className="breadcrumbs" aria-label="Breadcrumbs">
        <Link to="/">Lineas</Link>
        <span>/</span>
        <span aria-current="page">{line.title}</span>
      </div>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{line.slug}</p>
          <h2>{line.title}</h2>
          <p>{line.description}</p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/">
              Volver a lineas
            </Link>
          </div>
        </div>
        <div className="badges">
          <span className="badge">{line.status}</span>
          <span className="badge">{line.priority}</span>
          {line.origins.map((origin) => (
            <span className="badge badge--soft" key={origin}>
              {origin}
            </span>
          ))}
        </div>
      </section>

      <div className="layout-grid">
        <aside className="sidebar-stack">
          <Panel title="Estrategia" subtitle="Markdown de la linea">
            <MarkdownBlock markdown={line.strategyMarkdown} emptyMessage="La linea no tiene estrategia documentada." />
          </Panel>

          <Panel title="Fuentes" subtitle={`${visibleSources.length} fuentes visibles`}>
            <SourceList sources={visibleSources} />
          </Panel>

          <Panel
            title="Temas repetidos"
            subtitle="Selecciona un tema para enfocar timeline, hallazgos, acciones y fuentes"
            aside={
              selectedTopic ? (
                <button className="button button--ghost" onClick={() => updateParam(setSearchParams, searchParams, "topic", "")} type="button">
                  Quitar tema
                </button>
              ) : undefined
            }
          >
            <TopicFilterList
              onToggle={(topicId) => toggleTopic(setSearchParams, searchParams, topicId)}
              selectedTopicId={selectedTopicId}
              topics={lineTopics}
            />
          </Panel>

          {selectedTopic ? <TopicFocusPanel index={index} lineSlug={line.slug} topic={selectedTopic} /> : null}
        </aside>

        <div className="content-stack">
          <Panel title="Hallazgos" subtitle={`${visibleFindings.length} hallazgos visibles`}>
            <FindingList findings={visibleFindings.slice(0, 12)} availableSources={allSources} topicId={selectedTopic?.id} />
          </Panel>

          <Panel title="Acciones" subtitle={`${visibleActions.length} acciones visibles`}>
            <ActionList actions={visibleActions.slice(0, 12)} topicId={selectedTopic?.id} />
          </Panel>

          <Panel
            title="Timeline"
            subtitle={`${entries.length} entradas visibles`}
            aside={
              hasActiveFilters ? (
                <button
                  className="button button--ghost"
                  onClick={() => clearParams(setSearchParams, ["q", "year", "status", "topic"])}
                  type="button"
                >
                  Limpiar vista
                </button>
              ) : undefined
            }
          >
            <div className="filters-grid filters-grid--compact">
              <label>
                <span>Busqueda</span>
                <input
                  onChange={(event) => updateParam(setSearchParams, searchParams, "q", event.target.value)}
                  placeholder="benchmark, ruido, filtros..."
                  value={query}
                />
              </label>
              <label>
                <span>Año</span>
                <select value={year} onChange={(event) => updateParam(setSearchParams, searchParams, "year", event.target.value)}>
                  <option value="all">Todos</option>
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Estado</span>
                <select value={status} onChange={(event) => updateParam(setSearchParams, searchParams, "status", event.target.value)}>
                  <option value="all">Todos</option>
                  {entryStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ActiveFilterBar
              items={[
                query ? `Busqueda: ${query}` : undefined,
                year !== "all" ? `Año: ${year}` : undefined,
                status !== "all" ? `Estado: ${status}` : undefined,
                selectedTopic ? `Tema: ${selectedTopic.label}` : undefined,
              ]}
            />

            <div className="timeline-list">
              {entries.map((entry) => {
                const selectedByTopic = Boolean(selectedTopic && topicMatchesEntry(selectedTopic, entry));

                return (
                  <article className={`timeline-item${selectedByTopic ? " timeline-item--selected" : ""}`} key={entry.id}>
                    <div className="timeline-item__meta">
                      <span>{compactDate(entry.timestamp)}</span>
                      <div className="badges">
                        <span className="badge">{entry.status}</span>
                        <span className="badge">{entry.priority}</span>
                      </div>
                    </div>
                    <h3>
                      <Link to={entryPath(line.slug, entry.id, selectedTopic ? { topic: selectedTopic.id } : undefined)}>{entry.title}</Link>
                    </h3>
                    <p>{entry.summary}</p>
                    <div className="timeline-item__footer">
                      <span>{entry.findings.length} hallazgos</span>
                      <span>{entry.actions.length} acciones</span>
                      <span>{entry.sources.length} fuentes</span>
                      <Link className="button button--ghost button--small" to={entryPath(line.slug, entry.id, selectedTopic ? { topic: selectedTopic.id } : undefined)}>
                        Abrir detalle
                      </Link>
                    </div>
                  </article>
                );
              })}
              {entries.length === 0 ? <p className="muted">No hay entradas visibles para este filtro.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function EntryPage({ index }: { index: ResearchIndex }) {
  const { lineSlug, entryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const line = index.lines.find((candidate) => candidate.slug === lineSlug);
  const decodedEntryId = entryId ? decodeURIComponent(entryId) : undefined;
  const entry = line?.entries.find((candidate) => candidate.id === decodedEntryId);

  if (!line || !entry) {
    return (
      <main className="state-panel">
        <h2>Entrada no encontrada</h2>
        <p>La entrada solicitada no existe en el indice actual.</p>
      </main>
    );
  }

  const relatedTopics = index.repeatedTopics.filter((topic) => topic.entryIds.includes(entry.id)).slice(0, 10);
  const selectedTopicId = searchParams.get("topic") ?? "";
  const selectedTopic = relatedTopics.find((topic) => topic.id === selectedTopicId);
  const visibleSources = (entry.sources.length > 0 ? entry.sources : line.sources).filter((source) => {
    return !selectedTopic || topicMatchesEntity(selectedTopic, line.slug, source.id, source.entryId ?? entry.id);
  });
  // Todas las fuentes disponibles para búsqueda (entry + línea)
  const allSources = [...line.sources, ...entry.sources];
  const visibleFindings = entry.findings.filter((finding) => {
    return !selectedTopic || topicMatchesEntity(selectedTopic, line.slug, finding.id, finding.entryId);
  });
  const visibleActions = entry.actions.filter((action) => {
    return !selectedTopic || topicMatchesEntity(selectedTopic, line.slug, action.id, action.entryId);
  });

  const entryIndex = line.entries.findIndex((candidate) => candidate.id === entry.id);
  const previousEntry = entryIndex > 0 ? line.entries[entryIndex - 1] : undefined;
  const nextEntry = entryIndex >= 0 && entryIndex < line.entries.length - 1 ? line.entries[entryIndex + 1] : undefined;

  return (
    <main className="content-stack">
      <div className="breadcrumbs" aria-label="Breadcrumbs">
        <Link to="/">Lineas</Link>
        <span>/</span>
        <Link to={linePath(line.slug, selectedTopic ? { topic: selectedTopic.id } : undefined)}>{line.title}</Link>
        <span>/</span>
        <span aria-current="page">{entry.title}</span>
      </div>

      <section className="hero-card">
        <div>
          <p className="eyebrow">{formatDate(entry.timestamp)}</p>
          <h2>{entry.title}</h2>
          <p>{entry.summary}</p>
          <div className="hero-actions">
            <Link className="button button--primary" to={linePath(line.slug, selectedTopic ? { topic: selectedTopic.id } : undefined)}>
              Volver a la linea
            </Link>
            {previousEntry ? (
              <Link className="button button--ghost" to={entryPath(line.slug, previousEntry.id, selectedTopic ? { topic: selectedTopic.id } : undefined)}>
                Entrada anterior
              </Link>
            ) : null}
            {nextEntry ? (
              <Link className="button button--ghost" to={entryPath(line.slug, nextEntry.id, selectedTopic ? { topic: selectedTopic.id } : undefined)}>
                Entrada siguiente
              </Link>
            ) : null}
          </div>
        </div>
        <div className="badges">
          <span className="badge">{entry.status}</span>
          <span className="badge">{entry.priority}</span>
          {entry.tags.map((tag) => (
            <span className="badge badge--soft" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </section>

      <div className="layout-grid">
        <aside className="sidebar-stack">
          <Panel title="Resumen" subtitle="Markdown de la entrada">
            <MarkdownBlock markdown={entry.summaryMarkdown ?? entry.summary} />
          </Panel>

          <Panel
            title="Temas repetidos"
            subtitle="Selecciona uno para enfocar los elementos relacionados dentro de esta entrada"
            aside={
              selectedTopic ? (
                <button className="button button--ghost" onClick={() => updateParam(setSearchParams, searchParams, "topic", "")} type="button">
                  Quitar tema
                </button>
              ) : undefined
            }
          >
            <TopicFilterList
              onToggle={(topicId) => toggleTopic(setSearchParams, searchParams, topicId)}
              selectedTopicId={selectedTopicId}
              topics={relatedTopics}
            />
          </Panel>

          {selectedTopic ? <TopicFocusPanel index={index} lineSlug={line.slug} topic={selectedTopic} /> : null}
        </aside>

        <div className="content-stack">
          <Panel title="Hallazgos" subtitle={`${visibleFindings.length} hallazgos visibles`}>
            <FindingList findings={visibleFindings} availableSources={allSources} topicId={selectedTopic?.id} />
          </Panel>

          <Panel title="Acciones" subtitle={`${visibleActions.length} acciones visibles`}>
            <ActionList actions={visibleActions} topicId={selectedTopic?.id} />
          </Panel>

          <Panel title="Fuentes" subtitle={`${visibleSources.length} fuentes visibles`}>
            <SourceList sources={visibleSources} />
          </Panel>

          <Panel title="Artefactos" subtitle={`${entry.artifacts.length} rutas registradas`}>
            {entry.artifacts.length > 0 ? (
              <ul className="simple-list">
                {entry.artifacts.map((artifact) => (
                  <li key={artifact}>
                    <code>{artifact}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No hay artefactos asociados a esta entrada.</p>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}

function TopicFilterList({
  topics,
  selectedTopicId,
  onToggle,
}: {
  topics: RepeatedTopic[];
  selectedTopicId?: string;
  onToggle: (topicId: string) => void;
}) {
  if (topics.length === 0) {
    return <p className="muted">No hay temas repetidos disponibles en este contexto.</p>;
  }

  return (
    <div className="topic-list">
      {topics.map((topic) => {
        const isActive = topic.id === selectedTopicId;

        return (
          <button
            aria-pressed={isActive}
            className={`topic-button${isActive ? " topic-button--active" : ""}`}
            key={topic.id}
            onClick={() => onToggle(topic.id)}
            type="button"
          >
            <span className="topic-button__title">{topic.label}</span>
            <span>{topic.occurrenceCount} referencias</span>
            <small>{topic.lineSlugs.join(", ")}</small>
          </button>
        );
      })}
    </div>
  );
}

function TopicFocusPanel({
  index,
  topic,
  lineSlug,
}: {
  index: ResearchIndex;
  topic: RepeatedTopic;
  lineSlug?: string;
}) {
  const references = resolveTopicReferences(index, topic, lineSlug).slice(0, 10);

  return (
    <Panel title={`Tema activo: ${topic.label}`} subtitle="Elementos relacionados navegables en el indice">
      {references.length > 0 ? (
        <ul className="simple-list">
          {references.map((reference) => (
            <li key={`${reference.type}-${reference.entityId}`}>
              <div className="list-row__title">
                {reference.href ? (
                  <Link className="inline-link" to={appendParams(reference.href, { topic: topic.id })}>
                    {reference.title}
                  </Link>
                ) : (
                  <strong>{reference.title}</strong>
                )}
                <span className="badge badge--soft">{reference.type}</span>
              </div>
              <p>{reference.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No hay referencias visibles para este tema en el contexto actual.</p>
      )}
    </Panel>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return <p className="muted">No hay fuentes registradas.</p>;
  }

  return (
    <div className="detail-list">
      {sources.map((source, index) => (
        <details className="detail-card" key={source.id} open={index === 0}>
          <summary className="detail-card__summary">
            <div>
              <strong>{source.title}</strong>
              <span className="detail-card__hint">{source.url ? "Expandir y abrir enlace" : "Expandir para ver detalle"}</span>
            </div>
            <div className="badges">
              <span className="badge badge--soft">{source.kind}</span>
              {source.origin ? <span className="badge">{source.origin}</span> : null}
            </div>
          </summary>
          <div className="detail-card__body">
            {source.note ? <p>{source.note}</p> : <p className="muted">Sin nota adicional.</p>}
            {source.tags.length > 0 ? <TagList tags={source.tags} /> : null}
            <div className="detail-actions">
              {source.url ? (
                <a className="button button--ghost" href={source.url} rel="noreferrer" target="_blank">
                  Abrir fuente externa
                </a>
              ) : (
                <span className="pending-pill">Sin enlace externo</span>
              )}
              {source.createdAt ? <span className="muted">Registrada {compactDate(source.createdAt)}</span> : null}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function FindingList({ findings, availableSources, topicId }: { findings: Finding[]; availableSources: Source[]; topicId?: string }) {
  if (findings.length === 0) {
    return <p className="muted">No hay hallazgos registrados.</p>;
  }

  // Crear mapa de fuentes para búsqueda rápida
  const sourcesMap = new Map(availableSources.map(s => [s.id, s]));

  return (
    <div className="detail-list">
      {findings.map((finding, index) => {
        // Obtener fuentes relacionadas
        const relatedSources = (finding.sourceIds ?? [])
          .map(id => sourcesMap.get(id))
          .filter((s): s is Source => s !== undefined);

        const hasRelatedSources = relatedSources.length > 0;

        return (
          <details className="detail-card" key={finding.id} open={index === 0}>
            <summary className="detail-card__summary">
              <div>
                <strong>{finding.title}</strong>
                <span className="detail-card__hint">
                  {hasRelatedSources
                    ? `${relatedSources.length} fuente${relatedSources.length > 1 ? 's' : ''} relacionada${relatedSources.length > 1 ? 's' : ''}`
                    : finding.entryId
                      ? "Ver entrada para contexto completo"
                      : "Sin fuentes relacionadas"}
                </span>
              </div>
              <div className="badges">
                <span className="badge">{finding.status}</span>
                {finding.origin ? <span className="badge badge--soft">{finding.origin}</span> : null}
              </div>
            </summary>
            <div className="detail-card__body">
              <p>{finding.summary}</p>
              {finding.detail ? <p>{finding.detail}</p> : null}

              {/* Fuentes relacionadas */}
              <div className="finding-sources">
                <h4 className="finding-sources__title">
                  {hasRelatedSources ? "📚 Fuentes relacionadas" : "📚 Fuentes relacionadas"}
                </h4>
                {hasRelatedSources ? (
                  <ul className="finding-sources__list">
                    {relatedSources.map(source => (
                      <li key={source.id} className="finding-sources__item">
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="finding-sources__link"
                            title="Abrir fuente externa"
                          >
                            {source.title}
                          </a>
                        ) : (
                          <span className="finding-sources__name">{source.title}</span>
                        )}
                        {source.note && <span className="finding-sources__note">{source.note}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="finding-sources__empty">
                    Este hallazgo no tiene fuentes vinculadas.
                    {finding.origin === "legacy" && " (Formato legado no soporta vinculación explícita)"}
                  </p>
                )}
              </div>

              {finding.topicHints.length > 0 ? <TagList label="Temas" tags={finding.topicHints} /> : null}
              {finding.tags.length > 0 ? <TagList label="Tags" tags={finding.tags} /> : null}

              {/* Navegación */}
              <div className="detail-actions">
                {finding.entryId ? (
                  <Link
                    className="button button--primary button--small"
                    to={entryPath(finding.lineSlug, finding.entryId, topicId ? { topic: topicId } : undefined)}
                  >
                    📄 Ver entrada completa
                  </Link>
                ) : (
                  <span className="muted">Sin entrada asociada</span>
                )}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function ActionList({ actions, topicId }: { actions: ActionItem[]; topicId?: string }) {
  if (actions.length === 0) {
    return <p className="muted">No hay acciones registradas.</p>;
  }

  return (
    <div className="detail-list">
      {actions.map((action, index) => (
        <details className="detail-card" key={action.id} open={index === 0}>
          <summary className="detail-card__summary">
            <div>
              <strong>{action.title}</strong>
              <span className="detail-card__hint">Expandir para ver detalle</span>
            </div>
            <div className="badges">
              <span className="badge">{action.status}</span>
              <span className="badge">{action.priority}</span>
            </div>
          </summary>
          <div className="detail-card__body">
            {action.detail ? <p>{action.detail}</p> : <p className="muted">Sin detalle adicional.</p>}
            {action.tags.length > 0 ? <TagList label="Tags" tags={action.tags} /> : null}
            <div className="detail-actions">
              {action.owner ? <span className="muted">Responsable: {action.owner}</span> : <span className="pending-pill">Owner pendiente</span>}
              {action.dueDate ? <span className="muted">Vence {compactDate(action.dueDate)}</span> : null}
              {action.entryId ? (
                <Link className="button button--ghost button--small" to={entryPath(action.lineSlug, action.entryId, topicId ? { topic: topicId } : undefined)}>
                  Ir a la entrada
                </Link>
              ) : null}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function TagList({ label, tags }: { label?: string; tags: string[] }) {
  return (
    <div className="tag-block">
      {label ? <span className="detail-card__label">{label}</span> : null}
      <div className="badges">
        {tags.map((tag) => (
          <span className="badge badge--soft" key={tag}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActiveFilterBar({ items }: { items: Array<string | undefined> }) {
  const visibleItems = items.filter((item): item is string => Boolean(item));

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div aria-label="Filtros activos" className="active-filters">
      {visibleItems.map((item) => (
        <span className="badge badge--active" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function buildLineSearchBlob(line: ResearchLine) {
  return [
    line.title,
    line.description,
    line.strategyMarkdown,
    line.tags.join(" "),
    ...line.sources.map((source) => `${source.title} ${source.note ?? ""}`),
    ...line.findings.map((finding) => `${finding.title} ${finding.summary}`),
    ...line.actions.map((action) => `${action.title} ${action.detail ?? ""}`),
    ...line.entries.map((entry) => buildEntrySearchBlob(entry)),
  ].join(" ");
}

function buildEntrySearchBlob(entry: ResearchEntry) {
  return [
    entry.title,
    entry.summary,
    entry.summaryMarkdown ?? "",
    entry.tags.join(" "),
    ...entry.findings.map((finding) => `${finding.title} ${finding.summary}`),
    ...entry.actions.map((action) => `${action.title} ${action.detail ?? ""}`),
    ...entry.sources.map((source) => `${source.title} ${source.note ?? ""}`),
  ].join(" ");
}

function linePath(lineSlug: string, params?: Record<string, string>) {
  return withParams(`/lines/${lineSlug}`, params);
}

function entryPath(lineSlug: string, entryId: string, params?: Record<string, string>) {
  return withParams(`/lines/${lineSlug}/entries/${encodeURIComponent(entryId)}`, params);
}

function withParams(pathname: string, params?: Record<string, string>) {
  if (!params) {
    return pathname;
  }

  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function appendParams(pathname: string, params?: Record<string, string>) {
  const [basePath, currentQuery] = pathname.split("?");
  const resolvedPath = basePath ?? pathname;
  const next = new URLSearchParams(currentQuery ?? "");

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `${resolvedPath}?${query}` : resolvedPath;
}

function navClassName(isActive: boolean) {
  return `nav-link${isActive ? " nav-link--active" : ""}`;
}

function findTopic(index: ResearchIndex, topicId: string) {
  return index.repeatedTopics.find((topic) => topic.id === topicId);
}

function buildLineSourcesForView(line: ResearchLine, selectedTopic?: RepeatedTopic) {
  const combined = mergeById([...line.sources, ...line.entries.flatMap((entry) => entry.sources)]);
  return !selectedTopic
    ? line.sources
    : combined.filter((source) => topicMatchesEntity(selectedTopic, line.slug, source.id, source.entryId));
}

function resolveTopicReferences(index: ResearchIndex, topic: RepeatedTopic, lineSlug?: string) {
  return topic.references
    .filter((reference) => !lineSlug || reference.lineSlug === lineSlug)
    .map((reference) => resolveTopicReference(index, reference))
    .filter((reference): reference is ResolvedReference => Boolean(reference));
}

interface ResolvedReference {
  type: TopicReference["type"];
  entityId: string;
  title: string;
  description: string;
  href?: string;
}

function resolveTopicReference(index: ResearchIndex, reference: TopicReference): ResolvedReference | undefined {
  const line = index.lines.find((candidate) => candidate.slug === reference.lineSlug);

  if (!line) {
    return undefined;
  }

  switch (reference.type) {
    case "line":
      return {
        type: reference.type,
        entityId: line.slug,
        title: line.title,
        description: line.description,
        href: linePath(line.slug),
      };
    case "entry": {
      const entry = line.entries.find((candidate) => candidate.id === reference.entityId);
      return entry
        ? {
            type: reference.type,
            entityId: entry.id,
            title: entry.title,
            description: `${compactDate(entry.timestamp)} · ${entry.summary}`,
            href: entryPath(line.slug, entry.id),
          }
        : undefined;
    }
    case "finding": {
      const finding = line.findings.find((candidate) => candidate.id === reference.entityId);
      return finding
        ? {
            type: reference.type,
            entityId: finding.id,
            title: finding.title,
            description: finding.summary,
            href: finding.entryId ? entryPath(line.slug, finding.entryId) : linePath(line.slug),
          }
        : undefined;
    }
    case "action": {
      const action = line.actions.find((candidate) => candidate.id === reference.entityId);
      return action
        ? {
            type: reference.type,
            entityId: action.id,
            title: action.title,
            description: action.detail ?? "Accion sin detalle adicional.",
            href: action.entryId ? entryPath(line.slug, action.entryId) : linePath(line.slug),
          }
        : undefined;
    }
    case "source": {
      const source = [...line.sources, ...line.entries.flatMap((entry) => entry.sources)].find((candidate) => candidate.id === reference.entityId);
      return source
        ? {
            type: reference.type,
            entityId: source.id,
            title: source.title,
            description: source.note ?? source.url ?? "Fuente sin nota adicional.",
            href: source.entryId ? entryPath(line.slug, source.entryId) : linePath(line.slug),
          }
        : undefined;
    }
  }
}

function topicMatchesEntry(topic: RepeatedTopic, entry: ResearchEntry) {
  return topic.entryIds.length === 0 ? topic.lineSlugs.includes(entry.lineSlug) : topic.entryIds.includes(entry.id);
}

function topicMatchesEntity(topic: RepeatedTopic, lineSlug: string, entityId: string, entryId?: string) {
  return topic.references.some((reference) => {
    if (reference.entityId === entityId) {
      return true;
    }

    if (entryId && reference.entryId === entryId) {
      return true;
    }

    return reference.type === "line" && reference.lineSlug === lineSlug;
  });
}

function mergeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function toggleTopic(setSearchParams: SearchParamsSetter, current: URLSearchParams, topicId: string) {
  const next = new URLSearchParams(current);

  if (next.get("topic") === topicId) {
    next.delete("topic");
  } else {
    next.set("topic", topicId);
  }

  setSearchParams(next, { replace: true });
}

function clearParams(setSearchParams: SearchParamsSetter, keys: string[]) {
  const next = new URLSearchParams();

  for (const key of keys) {
    next.delete(key);
  }

  setSearchParams(next, { replace: true });
}

function updateParam(setSearchParams: SearchParamsSetter, current: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(current);

  if (value) {
    next.set(key, value);
  } else {
    next.delete(key);
  }

  setSearchParams(next, { replace: true });
}
