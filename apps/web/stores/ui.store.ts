import { create } from "zustand";

type UiState = {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (value: boolean) => void;
  isMobileNavOpen: boolean;
  toggleMobileNav: () => void;
  setMobileNavOpen: (value: boolean) => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (value: boolean) => void;
  isShortcutsOpen: boolean;
  setShortcutsOpen: (value: boolean) => void;
  isCreateWorkspaceOpen: boolean;
  setCreateWorkspaceOpen: (value: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (value) => set({ isSidebarOpen: value }),
  isMobileNavOpen: false,
  toggleMobileNav: () => set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),
  setMobileNavOpen: (value) => set({ isMobileNavOpen: value }),
  isCommandPaletteOpen: false,
  setCommandPaletteOpen: (value) => set({ isCommandPaletteOpen: value }),
  isShortcutsOpen: false,
  setShortcutsOpen: (value) => set({ isShortcutsOpen: value }),
  isCreateWorkspaceOpen: false,
  setCreateWorkspaceOpen: (value) => set({ isCreateWorkspaceOpen: value }),
}));
