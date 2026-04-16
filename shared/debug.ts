export type DiagnosticSeverity = "info" | "warning" | "error";

export type IgnoredReason =
  | "unexpected_filename"
  | "unexpected_location"
  | "missing_required_file"
  | "invalid_json"
  | "invalid_schema"
  | "unsupported_extension"
  | "duplicate_id"
  | "invalid_timestamp"
  | "unresolved_source_reference"
  | "unresolved_finding_reference"
  | "empty_entry"
  | "unknown_line_format"
  | "not_a_directory"
  | "access_denied";

export interface IgnoredFile {
  path: string;
  kind: "file" | "directory";
  reason: IgnoredReason;
  detail?: string;
}

export interface InvalidEntry {
  path: string;
  lineSlug?: string;
  entryId?: string;
  reason: string;
  detail?: string;
}

export interface UnresolvedReference {
  type: "source" | "finding";
  fromId: string;
  toId: string;
  context: string;
}

export interface LoadedLine {
  slug: string;
  title: string;
  format: "legacy" | "structured";
  path: string;
  entryCount: number;
  sourceCount: number;
  findingCount: number;
}

export interface LoadedEntry {
  id: string;
  lineSlug: string;
  title: string;
  path: string;
  timestamp: string;
}

export interface DebugReport {
  version: 1;
  sourcePath: string;
  isSampleData: boolean;
  generatedAt: string;
  durationMs: number;
  
  // Resumen
  summary: {
    totalLines: number;
    totalEntries: number;
    totalFindings: number;
    totalSources: number;
    totalActions: number;
  };
  
  // Problemas
  errors: string[];
  warnings: string[];
  
  // Archivos ignorados
  ignoredFiles: IgnoredFile[];
  
  // Entradas cargadas vs inválidas
  loadedLines: LoadedLine[];
  loadedEntries: LoadedEntry[];
  invalidEntries: InvalidEntry[];
  
  // Referencias rotas
  unresolvedReferences: UnresolvedReference[];
  
  // Detección de formatos
  detectedFormats: {
    legacyLines: string[];
    structuredLines: string[];
  };
}

export const DEFAULT_DEBUG_REPORT: DebugReport = {
  version: 1,
  sourcePath: "",
  isSampleData: false,
  generatedAt: new Date().toISOString(),
  durationMs: 0,
  summary: {
    totalLines: 0,
    totalEntries: 0,
    totalFindings: 0,
    totalSources: 0,
    totalActions: 0,
  },
  errors: [],
  warnings: [],
  ignoredFiles: [],
  loadedLines: [],
  loadedEntries: [],
  invalidEntries: [],
  unresolvedReferences: [],
  detectedFormats: {
    legacyLines: [],
    structuredLines: [],
  },
};
