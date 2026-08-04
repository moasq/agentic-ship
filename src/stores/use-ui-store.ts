import { create } from "zustand";

/**
 * Example store — delete it or rename it for your first real domain.
 *
 * Read the state rules in AGENTS.md before adding another one. The order of
 * preference is server state through RSC props, then URL state, and only then
 * a store. Reaching for a store first is the classic generated-code smell.
 *
 * Rules this file demonstrates:
 *  - one store per domain, named use-<domain>-store.ts
 *  - state and actions declared together in a single typed interface
 *  - no data fetching here — that belongs in a server component or an action
 */
interface UiState {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

/**
 * Select narrowly at the call site so a component only re-renders when the
 * slice it uses changes:
 *
 *   const sidebarOpen = useUiStore((s) => s.sidebarOpen);
 *
 * Never do this — it subscribes the component to every field in the store:
 *
 *   const store = useUiStore();
 */
