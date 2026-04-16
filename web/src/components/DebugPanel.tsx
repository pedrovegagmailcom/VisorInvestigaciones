import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DebugReport } from "@shared/debug";

const API_PORT = import.meta.env.VITE_INDEXER_API_PORT || "3456";
const API_URL = `http://127.0.0.1:${API_PORT}`;

type FilterSeverity = "all" | "error" | "warning" | "info";

export function DebugPanel() {
  const [report, setReport] = useState<DebugReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterSeverity>("all");
  const [activeTab, setActiveTab] = useState<"overview" | "files" | "entries" | "references">("overview");

  useEffect(() => {
    loadDebugReport();
    const interval = setInterval(loadDebugReport, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  async function loadDebugReport() {
    try {
      const response = await fetch(`${API_URL}/api/debug`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando reporte");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="debug-panel"><p>Cargando diagnóstico...</p></div>;
  }

  if (error || !report) {
    return (
      <div className="debug-panel">
        <div className="debug-error">
          <h3>❌ Error cargando diagnóstico</h3>
          <p>{error || "No se pudo cargar el reporte"}</p>
          <button onClick={loadDebugReport} className="button button--primary">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const hasErrors = report.errors.length > 0;
  const hasWarnings = report.warnings.length > 0;
  const hasIgnored = report.ignoredFiles.length > 0;
  const hasInvalid = report.invalidEntries.length > 0;

  return (
    <div className="debug-panel">
      <header className="debug-header">
        <h2>🔧 Panel de Diagnóstico</h2>
        <div className="debug-meta">
          <span className={report.isSampleData ? "badge badge--warning" : "badge badge--success"}>
            {report.isSampleData ? "📁 Datos de ejemplo" : "📂 Datos reales"}
          </span>
          <span className="badge">⏱️ {report.durationMs}ms</span>
          <span className="badge">🕐 {new Date(report.generatedAt).toLocaleString()}</span>
        </div>
      </header>

      <section className="debug-path">
        <strong>Ruta indexada:</strong>
        <code>{report.sourcePath}</code>
      </section>

      <nav className="debug-tabs">
        <button
          className={activeTab === "overview" ? "active" : ""}
          onClick={() => setActiveTab("overview")}
        >
          📊 Resumen
          {(hasErrors || hasWarnings) && <span className="tab-badge">⚠️</span>}
        </button>
        <button
          className={activeTab === "files" ? "active" : ""}
          onClick={() => setActiveTab("files")}
        >
          📁 Archivos
          {hasIgnored && <span className="tab-badge">{report.ignoredFiles.length}</span>}
        </button>
        <button
          className={activeTab === "entries" ? "active" : ""}
          onClick={() => setActiveTab("entries")}
        >
          📝 Entradas
          {hasInvalid && <span className="tab-badge">{report.invalidEntries.length}</span>}
        </button>
        <button
          className={activeTab === "references" ? "active" : ""}
          onClick={() => setActiveTab("references")}
        >
          🔗 Referencias
          {report.unresolvedReferences.length > 0 && (
            <span className="tab-badge">{report.unresolvedReferences.length}</span>
          )}
        </button>
      </nav>

      {activeTab === "overview" && (
        <OverviewTab report={report} filter={filter} setFilter={setFilter} />
      )}
      {activeTab === "files" && <FilesTab report={report} />}
      {activeTab === "entries" && <EntriesTab report={report} />}
      {activeTab === "references" && <ReferencesTab report={report} />}
    </div>
  );
}

function OverviewTab({
  report,
  filter,
  setFilter,
}: {
  report: DebugReport;
  filter: FilterSeverity;
  setFilter: (f: FilterSeverity) => void;
}) {
  return (
    <>
      <section className="debug-stats">
        <div className="stat-card">
          <span className="stat-value">{report.summary.totalLines}</span>
          <span className="stat-label">Líneas</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{report.summary.totalEntries}</span>
          <span className="stat-label">Entradas</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{report.summary.totalFindings}</span>
          <span className="stat-label">Hallazgos</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{report.summary.totalSources}</span>
          <span className="stat-label">Fuentes</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{report.summary.totalActions}</span>
          <span className="stat-label">Acciones</span>
        </div>
      </section>

      <section className="debug-formats">
        <h4>Formatos detectados</h4>
        <div className="format-badges">
          <span className="badge">
            🏛️ Legacy: {report.detectedFormats.legacyLines.length}
          </span>
          <span className="badge">
            🏗️ Estructurado: {report.detectedFormats.structuredLines.length}
          </span>
        </div>
      </section>

      <section className="debug-issues">
        <div className="issues-header">
          <h4>
            {report.errors.length > 0 && <span className="error-count">{report.errors.length} errores</span>}
            {report.warnings.length > 0 && <span className="warning-count">{report.warnings.length} warnings</span>}
            {report.errors.length === 0 && report.warnings.length === 0 && "✅ Sin problemas detectados"}
          </h4>
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterSeverity)}>
            <option value="all">Todos</option>
            <option value="error">Errores</option>
            <option value="warning">Warnings</option>
          </select>
        </div>

        <div className="issues-list">
          {(filter === "all" || filter === "error") &&
            report.errors.map((err, i) => (
              <div key={`err-${i}`} className="issue-item issue-error">
                <span className="issue-icon">❌</span>
                <span className="issue-text">{err}</span>
              </div>
            ))}
          {(filter === "all" || filter === "warning") &&
            report.warnings.map((warn, i) => (
              <div key={`warn-${i}`} className="issue-item issue-warning">
                <span className="issue-icon">⚠️</span>
                <span className="issue-text">{warn}</span>
              </div>
            ))}
          {filter !== "all" &&
            ((filter === "error" && report.errors.length === 0) ||
              (filter === "warning" && report.warnings.length === 0)) && (
              <p className="muted">No hay {filter === "error" ? "errores" : "warnings"}</p>
            )}
        </div>
      </section>
    </>
  );
}

function FilesTab({ report }: { report: DebugReport }) {
  if (report.ignoredFiles.length === 0) {
    return <p className="muted">No se ignoraron archivos</p>;
  }

  const grouped = report.ignoredFiles.reduce((acc, file) => {
    if (!acc[file.reason]) {
      acc[file.reason] = [];
    }
    acc[file.reason]!.push(file);
    return acc;
  }, {} as Record<string, typeof report.ignoredFiles>);

  return (
    <section className="debug-files">
      <h4>🚫 Archivos ignorados ({report.ignoredFiles.length})</h4>
      {Object.entries(grouped).map(([reason, files]) => (
        <div key={reason} className="file-group">
          <h5 className="file-reason">{formatReason(reason)}</h5>
          <ul className="file-list">
            {files.map((file, i) => (
              <li key={i} className="file-item">
                <code className="file-path" title={file.path}>
                  {file.path.replace(report.sourcePath, "...")}
                </code>
                {file.detail && <span className="file-detail">{file.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function EntriesTab({ report }: { report: DebugReport }) {
  return (
    <section className="debug-entries">
      <h4>✅ Entradas cargadas ({report.loadedEntries.length})</h4>
      {report.loadedEntries.length > 0 ? (
        <ul className="entry-list">
          {report.loadedEntries.slice(0, 20).map((entry) => (
            <li key={entry.id} className="entry-item">
              <Link to={`/lines/${entry.lineSlug}/entries/${encodeURIComponent(entry.id)}`}>
                {entry.title}
              </Link>
              <span className="entry-meta">{entry.lineSlug}</span>
            </li>
          ))}
          {report.loadedEntries.length > 20 && (
            <li className="muted">...y {report.loadedEntries.length - 20} más</li>
          )}
        </ul>
      ) : (
        <p className="muted">No hay entradas cargadas</p>
      )}

      {report.invalidEntries.length > 0 && (
        <>
          <h4>❌ Entradas inválidas ({report.invalidEntries.length})</h4>
          <ul className="invalid-list">
            {report.invalidEntries.map((entry, i) => (
              <li key={i} className="invalid-item">
                <code>{entry.path.replace(report.sourcePath, "...")}</code>
                <span className="invalid-reason">{formatReason(entry.reason)}</span>
                {entry.detail && <span className="invalid-detail">{entry.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ReferencesTab({ report }: { report: DebugReport }) {
  if (report.unresolvedReferences.length === 0) {
    return <p className="muted">No hay referencias rotas</p>;
  }

  return (
    <section className="debug-references">
      <h4>🔗 Referencias no resueltas ({report.unresolvedReferences.length})</h4>
      <ul className="reference-list">
        {report.unresolvedReferences.map((ref, i) => (
          <li key={i} className="reference-item">
            <span className="ref-type">{ref.type}</span>
            <code>{ref.fromId}</code>
            →
            <code className="ref-missing">{ref.toId}</code>
            <span className="ref-context">{ref.context}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatReason(reason: string): string {
  const reasons: Record<string, string> = {
    unexpected_filename: "Nombre inesperado",
    unexpected_location: "Ubicación incorrecta",
    missing_required_file: "Falta archivo requerido",
    invalid_json: "JSON inválido",
    invalid_schema: "Esquema inválido",
    unsupported_extension: "Extensión no soportada",
    duplicate_id: "ID duplicado",
    invalid_timestamp: "Timestamp inválido",
    unresolved_source_reference: "Referencia a fuente no encontrada",
    unresolved_finding_reference: "Referencia a hallazgo no encontrada",
    empty_entry: "Entrada vacía",
    unknown_line_format: "Formato de línea desconocido",
    not_a_directory: "No es un directorio",
    access_denied: "Acceso denegado",
  };
  return reasons[reason] || reason;
}
