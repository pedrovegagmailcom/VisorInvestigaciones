export type VisualStatus = "active" | "hidden" | "archived";

export interface LineVisualState {
  lineSlug: string;
  status: VisualStatus;
  updatedAt: string;
}

export interface UIState {
  version: 1;
  updatedAt: string;
  lines: LineVisualState[];
}

export const DEFAULT_UI_STATE: UIState = {
  version: 1,
  updatedAt: new Date().toISOString(),
  lines: [],
};

export function getVisualStatusLabel(status: VisualStatus): string {
  switch (status) {
    case "active":
      return "Activa";
    case "hidden":
      return "Oculta";
    case "archived":
      return "Archivada";
    default:
      return "Desconocida";
  }
}

export function isValidVisualStatus(status: string): status is VisualStatus {
  return ["active", "hidden", "archived"].includes(status);
}
