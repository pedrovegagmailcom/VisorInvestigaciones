import type { ResearchIndex } from "@shared/domain";

const indexUrl = `${import.meta.env.BASE_URL}data/generated/index.json`;

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
