import { Link } from "react-router-dom";

import type { ResearchLine } from "@shared/domain";

import { compactDate } from "../lib/data";

interface LineCardProps {
  line: ResearchLine;
  matchingEntries: number;
  href: string;
}

export function LineCard({ line, matchingEntries, href }: LineCardProps) {
  return (
    <article className="line-card">
      <div className="line-card__header">
        <div>
          <p className="eyebrow">{line.origins.length > 1 ? "hybrid" : line.origins[0]}</p>
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
    </article>
  );
}
