import { create } from 'zustand';

export interface OverlaySettings {
  // General
  topCount: number;
  showTitle: boolean;
  titleText: string;
  elementShowRank: boolean;
  elementShowName: boolean;
  elementShowCount: boolean;
  
  // Title Text
  titleFont: string;
  titleSize: string;
  titleWeight: string;
  titleColor: string;
  titleStrokeWidth: string;
  titleStrokeColor: string;
  titleShadowColor: string;
  titleShadowOpacity: number;
  titleOpacity: number;
  titleLetterSpacing: string;

  // Position Text
  positionFont: string;
  positionSize: string;
  positionWeight: string;
  positionColor: string;
  positionStrokeWidth: string;
  positionStrokeColor: string;
  positionShadowColor: string;
  positionShadowOpacity: number;
  positionOpacity: number;
  positionLetterSpacing: string;

  // Username Text
  usernameFont: string;
  usernameSize: string;
  usernameWeight: string;
  usernameColor: string;
  usernameStrokeWidth: string;
  usernameStrokeColor: string;
  usernameShadowColor: string;
  usernameShadowOpacity: number;
  usernameOpacity: number;
  usernameLetterSpacing: string;

  // Counter Text
  counterFont: string;
  counterSize: string;
  counterWeight: string;
  counterColor: string;
  counterStrokeWidth: string;
  counterStrokeColor: string;
  counterShadowColor: string;
  counterShadowOpacity: number;
  counterOpacity: number;
  counterLetterSpacing: string;

  // Rows
  rowColor: string; // Used in color picker visually
  rowOpacity: number;
  rowRadius: string;
  rowHeight: string;
  rowPadding: string;
  rowGap: number;
  rowWidth: string;
  rowBorderColor: string;
  rowBorderWidth: string;
  rowShadowEnabled: boolean;
  
  // Top 3 Colors
  top3HighlightEnabled: boolean;
  top1Color: string;
  top2Color: string;
  top3Color: string;

  // Background
  backgroundMode: 'transparent' | 'color' | 'image';
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundImagePath: string;
  backgroundImageFit: 'cover' | 'contain' | 'fill';
  backgroundImagePosition: string;
  backgroundImageOpacity: number;
  backgroundBlur: string;
  backgroundOverlayOpacity: number;
  overlayRadius: string;

  // Animation
  animationType: string;
  animationDuration: number;
  rankAnimationEnabled: boolean;
  counterAnimation: string;
  highlightNew: boolean;
  highlightColor: string;
  highlightDuration: number;
}

export type PreviewMode = 'demo' | 'real';

interface SettingsState {
  settings: OverlaySettings;
  previewMode: PreviewMode;
  updateSettings: (newSettings: Partial<OverlaySettings>) => void;
  setAllSettings: (settings: OverlaySettings) => void;
  setPreviewMode: (mode: PreviewMode) => void;
}

export const defaultSettings: OverlaySettings = {
  topCount: 10,
  showTitle: true,
  titleText: 'Топ чата',
  elementShowRank: true,
  elementShowName: true,
  elementShowCount: true,

  titleFont: 'Inter', titleSize: '24px', titleWeight: 'bold', titleColor: '#ffffff', titleStrokeWidth: '0px', titleStrokeColor: 'transparent', titleShadowColor: 'rgba(0,0,0,0.5)', titleShadowOpacity: 1, titleOpacity: 1, titleLetterSpacing: 'normal',
  
  positionFont: 'Inter', positionSize: '16px', positionWeight: 'bold', positionColor: '#ffffff', positionStrokeWidth: '0px', positionStrokeColor: 'transparent', positionShadowColor: 'rgba(0,0,0,0.5)', positionShadowOpacity: 1, positionOpacity: 1, positionLetterSpacing: 'normal',
  
  usernameFont: 'Inter', usernameSize: '16px', usernameWeight: 'normal', usernameColor: '#ffffff', usernameStrokeWidth: '0px', usernameStrokeColor: 'transparent', usernameShadowColor: 'rgba(0,0,0,0.5)', usernameShadowOpacity: 1, usernameOpacity: 1, usernameLetterSpacing: 'normal',
  
  counterFont: 'Inter', counterSize: '16px', counterWeight: 'normal', counterColor: '#ffffff', counterStrokeWidth: '0px', counterStrokeColor: 'transparent', counterShadowColor: 'rgba(0,0,0,0.5)', counterShadowOpacity: 1, counterOpacity: 1, counterLetterSpacing: 'normal',

  rowColor: '#000000', rowOpacity: 0.5, rowRadius: '8px', rowHeight: 'auto', rowPadding: '12px 16px', rowGap: 8, rowWidth: '100%', rowBorderColor: 'transparent', rowBorderWidth: '0px', rowShadowEnabled: false,
  
  top3HighlightEnabled: true, top1Color: '#ffd700', top2Color: '#c0c0c0', top3Color: '#cd7f32',

  backgroundMode: 'transparent', backgroundColor: '#000000', backgroundOpacity: 1, backgroundImagePath: '', backgroundImageFit: 'cover', backgroundImagePosition: 'center', backgroundImageOpacity: 1, backgroundBlur: '0px', backgroundOverlayOpacity: 0, overlayRadius: '0px',

  animationType: 'fade', animationDuration: 0.3, rankAnimationEnabled: true, counterAnimation: 'none', highlightNew: true, highlightColor: 'rgba(255,255,255,0.2)', highlightDuration: 1
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  previewMode: 'demo',
  updateSettings: (newSettings) => 
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  setAllSettings: (settings) => set({ settings }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
}));
