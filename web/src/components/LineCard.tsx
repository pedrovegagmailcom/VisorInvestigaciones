import { Link } from "react-router-dom";

import type { ResearchLine } from "@shared/domain";
import type { VisualStatus } from "@shared/ui-state";

import { compactDate } from "../lib/data";

interface LineCardProps {
  line: ResearchLine;
  matchingEntries: number;
  href: string;
  onStatusChange?: (lineSlug: string, status: VisualStatus) => void;
  showActions?: boolean;
}

export function LineCard({ line, matchingEntries, href, onStatusChange, showActions = true }: LineCardProps) {
  const visualStatus = line.visualStatus ?? "active";
  const isArchived = visualStatus === "archived";
  const isHidden = visualStatus === "hidden";

  return (
    <article className={`line-card ${isArchived ? "line-card--archived" : ""} ${isHidden ? "line-card--hidden" : ""}`}>
      <div className="line-card__header">
        <div>
          <p className="eyebrow">
            {line.origins.length > 1 ? "hybrid" : line.origins[0]}
            {visualStatus !== "active" && (
              <span className={`visual-status-badge visual-status-badge--${visualStatus}`}>
                {visualStatus === "archived" ? "📦 Archivada" : "👁️ Oculta"}
              </span>
            )}
          </p>
          <h3>
            <Link to={href}>{line.title}</Link>
          </h3>
        </div>
        <div className="badges">
          <span className="badge">{line.status}</span>
          <span className="badge">{line.priority}</span>
        </div>
      </div>
      <p>{line.description}</p>
      <div className="badges">
        {line.tags.map((tag) => (
          <span className="badge badge--soft" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <dl className="line-card__stats">
        <div>
          <dt>Entradas</dt>
          <dd>{line.entries.length}</dd>
        </div>
        <div>
          <dt>Hallazgos</dt>
          <dd>{line.findings.length}</dd>
        </div>
        <div>
          <dt>Acciones</dt>
          <dd>{line.actions.length}</dd>
        </div>
        <div>
          <dt>Fuentes</dt>
          <dd>{line.sources.length}</dd>
        </div>
      </dl>
      <footer className="line-card__footer">
        <span>Actualizado {compactDate(line.lastUpdated)}</span>
        <span>{matchingEntries} coincidencias en timeline</span>
        <Link className="button button--ghost button--small" to={href}>
          Abrir linea
        </Link>
      </footer>
      
      {showActions && onStatusChange && (
        <div className="line-card__actions">
          {visualStatus === "active" && (
            <>
              <button
                className="button button--ghost button--small"
                onClick={() => onStatusChange(line.slug, "hidden")}
                title="Oculta la línea de la vista principal (no borra datos)"
              >
                👁️ Ocultar
              </button>
              <button
                className="button button--ghost button--small"
                onClick={() => onStatusChange(line.slug, "archived")}
                title="Mueve la línea a archivadas (no borra datos)"
              >
                📦 Archivar
              </button>
            </>
          )}
          {visualStatus === "hidden" && (
            <>
              <button
                className="button button--primary button--small"
                onClick={() => onStatusChange(line.slug, "active")}
                title="Restaura la línea a la vista principal"
              >
                🔄 Restaurar
              </button>
              <button
                className="button button--ghost button--small"
                onClick={() => onStatusChange(line.slug, "archived")}
                title="Mueve la línea a archivadas"
              >
                📦 Archivar
              </button>
            </>
          )}
          {visualStatus === "archived" && (
            <button
              className="button button--primary button--small"
              onClick={() => onStatusChange(line.slug, "active")}
              title="Restaura la línea desde archivadas"
            >
              🔄 Restaurar
            </button>
          )}
        </div>
      )}
    </article>
  );
}
