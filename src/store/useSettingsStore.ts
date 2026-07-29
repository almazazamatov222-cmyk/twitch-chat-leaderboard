import { create } from 'zustand';

export interface OverlaySettings {
  titleText: string;
  showTitle: boolean;
  topCount: number;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  rowBackground: string;
  rowRadius: number;
  rowGap: number;
  highlightNew: boolean;
}

interface SettingsState {
  settings: OverlaySettings;
  updateSettings: (newSettings: Partial<OverlaySettings>) => void;
  setAllSettings: (settings: OverlaySettings) => void;
}

export const defaultSettings: OverlaySettings = {
  titleText: 'Топ чата',
  showTitle: true,
  topCount: 10,
  backgroundColor: 'transparent',
  textColor: '#ffffff',
  fontFamily: 'Inter',
  rowBackground: 'rgba(0, 0, 0, 0.5)',
  rowRadius: 8,
  rowGap: 8,
  highlightNew: true,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  updateSettings: (newSettings) => 
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  setAllSettings: (settings) => set({ settings }),
}));
