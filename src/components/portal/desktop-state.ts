/**
 * Window-manager state for the client desktop: which windows are open,
 * minimized or zoomed, where the client dragged them, and their z-order.
 * Only what the client changed is stored, so defaults can adapt to the
 * viewport; "Tidy up" clears it all.
 */
export interface WinState {
  open: boolean;
  minimized: boolean;
  zoomed: boolean;
  x: number | null;
  y: number | null;
}

export interface DesktopState {
  v: 1;
  windows: Record<string, Partial<WinState>>;
  /** Bottom to top. */
  order: string[];
  /** Project Viewer tabs (project listIds) in the order they were opened; undefined = defaults. */
  tabs?: string[];
  /** The active viewer tab, when the client chose one. */
  activeTab?: string | null;
}

export const REVIEW_ID = "review";
export const UPNEXT_ID = "upnext";
export const ARCHIVE_ID = "archive";
export const NOTE_ID = "note";
export const FINDER_ID = "finder";
export const VIEWER_ID = "viewer";

export function projectWindowId(listId: string): string {
  return `project:${listId}`;
}

export function listIdOfWindow(id: string): string | null {
  return id.startsWith("project:") ? id.slice("project:".length) : null;
}

export const EMPTY_STATE: DesktopState = { v: 1, windows: {}, order: [] };

export function desktopStorageKey(token: string, focusListId: string | null): string {
  return focusListId ? `portal:desktop:${token}:${focusListId}` : `portal:desktop:${token}`;
}

export function bootStorageKey(token: string): string {
  return `portal:booted:${token}`;
}

export function loadDesktopState(key: string): DesktopState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<DesktopState>;
    if (!parsed || parsed.v !== 1 || typeof parsed.windows !== "object" || !Array.isArray(parsed.order)) {
      return EMPTY_STATE;
    }
    return {
      v: 1,
      windows: parsed.windows ?? {},
      order: parsed.order.filter((s) => typeof s === "string"),
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs.filter((s) => typeof s === "string") : undefined,
      activeTab: typeof parsed.activeTab === "string" ? parsed.activeTab : undefined,
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveDesktopState(key: string, state: DesktopState): void {
  try {
    if (state.order.length === 0 && Object.keys(state.windows).length === 0 && state.tabs === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(state));
    }
  } catch {
    /* storage unavailable: the desktop still works, it just forgets */
  }
}

export function patchWindow(state: DesktopState, id: string, patch: Partial<WinState>): DesktopState {
  return { ...state, windows: { ...state.windows, [id]: { ...state.windows[id], ...patch } } };
}

export function raiseWindow(state: DesktopState, id: string, defaultOrder: string[]): DesktopState {
  const order = mergeOrder(state.order, defaultOrder).filter((w) => w !== id);
  order.push(id);
  return { ...state, order };
}

/** Persisted order first (dropping windows that no longer exist), then any new windows in default order. */
export function mergeOrder(persisted: string[], defaultOrder: string[]): string[] {
  const known = new Set(defaultOrder);
  const kept = persisted.filter((id) => known.has(id));
  const seen = new Set(kept);
  for (const id of defaultOrder) if (!seen.has(id)) kept.push(id);
  return kept;
}
