import type { ResearchIndex } from "@shared/domain";
import type { VisualStatus } from "@shared/ui-state";

const indexUrl = `${import.meta.env.BASE_URL}data/generated/index.json`;
const API_PORT = import.meta.env.VITE_INDEXER_API_PORT || "3456";
const API_URL = `http://127.0.0.1:${API_PORT}`;

export async function loadResearchIndex() {
  const response = await fetch(indexUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`No se pudo cargar ${indexUrl}. Ejecuta primero npm run index.`);
  }

  return response.json() as Promise<ResearchIndex>;
}

export function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function matchesQuery(haystack: string, query: string) {
  const normalizedQuery = normalizeForSearch(query);

  if (!normalizedQuery) {
    return true;
  }

  const normalizedHaystack = normalizeForSearch(haystack);
  return normalizedQuery.split(/\s+/).every((part) => normalizedHaystack.includes(part));
}

export function formatDate(value?: string) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function compactDate(value?: string) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(date);
}

export async function updateLineVisualStatus(lineSlug: string, status: VisualStatus): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_URL}/api/lines/${encodeURIComponent(lineSlug)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();

    if (response.ok && data.status === "success") {
      return { success: true, message: `Línea ${status === "active" ? "restaurada" : status === "hidden" ? "ocultada" : "archivada"} correctamente` };
    } else {
      return { success: false, message: data.message || "Error desconocido" };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, message: "Tiempo de espera agotado" };
    }
    return { success: false, message: `Error de conexión: ${err instanceof Error ? err.message : "Desconocido"}` };
  }
}
