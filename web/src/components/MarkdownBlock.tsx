import ReactMarkdown from "react-markdown";

interface MarkdownBlockProps {
  markdown: string;
  emptyMessage?: string;
}

export function MarkdownBlock({ markdown, emptyMessage = "Sin contenido." }: MarkdownBlockProps) {
  const value = markdown.trim();

  if (!value) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="markdown-block">
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}
