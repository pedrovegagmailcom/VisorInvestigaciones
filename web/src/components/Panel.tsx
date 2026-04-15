import type { PropsWithChildren, ReactNode } from "react";

interface PanelProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}

export function Panel({ title, subtitle, aside, children }: PanelProps) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
