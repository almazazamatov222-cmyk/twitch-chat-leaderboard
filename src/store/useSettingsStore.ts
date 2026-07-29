import { create } from 'zustand';

export interface OverlaySettings {
  // General
  width: string;
  height: string;
  scale: number;
  opacity: number;
  paddings: string;
  alignX: string;
  alignY: string;
  bgGradient: string;
  bgImage: string;
  bgBlur: string;
  borderWidth: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;

  // Title
  showTitle: boolean;
  titleText: string;
  titleFont: string;
  titleSize: string;
  titleWeight: string;
  titleItalic: boolean;
  titleColor: string;
  titleOpacity: number;
  titleGradient: string;
  titleStrokeWidth: string;
  titleStrokeColor: string;
  titleShadow: string;
  titleLetterSpacing: string;
  titleLineHeight: string;
  titleAlign: string;
  titleMarginTop: string;
  titleMarginBottom: string;
  
  // Position
  showPosition: boolean;
  positionFormat: string;
  positionSize: string;
  positionColor: string;
  positionFont: string;
  positionStroke: string;
  positionWidth: string;
  top1Color: string;
  top2Color: string;
  top3Color: string;
  
  // Username
  showUsername: boolean;
  usernameFont: string;
  usernameSize: string;
  usernameWeight: string;
  usernameColor: string;
  usernameStroke: string;
  usernameShadow: string;
  usernameMaxLength: number;
  usernameTransform: string;
  showAvatar: boolean;
  avatarSize: string;
  avatarRadius: string;
  
  // Counter
  showCounter: boolean;
  counterFont: string;
  counterSize: string;
  counterColor: string;
  counterStroke: string;
  counterShadow: string;
  counterFormat: string;
  
  // Rows
  topCount: number;
  rowWidth: string;
  rowMinHeight: string;
  rowMaxHeight: string;
  rowPadding: string;
  rowBackground: string;
  rowGradient: string;
  rowBorderWidth: string;
  rowBorderColor: string;
  rowRadius: string;
  rowShadow: string;
  rowInnerGap: string;
  rowEvenBg: string;
  rowOddBg: string;
  rowGap: number;
  
  // Layout
  layoutDirection: string;
  layoutReverse: boolean;
  rowTemplate: string;
  
  // Animation
  animationType: string;
  animationDuration: number;
  animationDelay: number;
  animationEasing: string;
  animationIntensity: number;
  highlightNew: boolean;
  highlightDuration: number;
  highlightColor: string;
  
  // Filters
  ignoreCommands: boolean;
  ignoreStreamer: boolean;
  ignoreMods: boolean;
  ignoreVips: boolean;
  excludedUsers: string[];
  botUsers: string[];
  minMessageLength: number;
  spamProtection: boolean;
}

export type PreviewMode = 'demo' | 'real' | 'empty' | 'simulate';

interface SettingsState {
  settings: OverlaySettings;
  previewMode: PreviewMode;
  updateSettings: (newSettings: Partial<OverlaySettings>) => void;
  setAllSettings: (settings: OverlaySettings) => void;
  setPreviewMode: (mode: PreviewMode) => void;
}

export const defaultSettings: OverlaySettings = {
  width: '100%', height: '100%', scale: 1.0, opacity: 1.0, paddings: '24px',
  alignX: 'center', alignY: 'top', bgGradient: 'none', bgImage: '', bgBlur: '0px',
  borderWidth: '0px', borderColor: 'transparent', borderRadius: '0px', boxShadow: 'none', backgroundColor: 'transparent',
  textColor: '#ffffff', fontFamily: 'Inter',
  
  showTitle: true, titleText: 'Топ чата', titleFont: 'Inter', titleSize: '24px', titleWeight: 'bold',
  titleItalic: false, titleColor: '#ffffff', titleOpacity: 1.0, titleGradient: 'none', titleStrokeWidth: '0px',
  titleStrokeColor: 'transparent', titleShadow: 'none', titleLetterSpacing: 'normal', titleLineHeight: '1.2',
  titleAlign: 'center', titleMarginTop: '0px', titleMarginBottom: '24px',
  
  showPosition: true, positionFormat: '#{position}', positionSize: '16px', positionColor: '#ffffff',
  positionFont: 'Inter', positionStroke: 'none', positionWidth: '30px', top1Color: '#ffd700', top2Color: '#c0c0c0', top3Color: '#cd7f32',
  
  showUsername: true, usernameFont: 'Inter', usernameSize: '16px', usernameWeight: 'medium', usernameColor: '#ffffff',
  usernameStroke: 'none', usernameShadow: 'none', usernameMaxLength: 20, usernameTransform: 'none', showAvatar: false, avatarSize: '24px', avatarRadius: '50%',
  
  showCounter: true, counterFont: 'Inter', counterSize: '16px', counterColor: '#ffffff', counterStroke: 'none', counterShadow: 'none', counterFormat: '{messages}',
  
  topCount: 10, rowWidth: '100%', rowMinHeight: 'auto', rowMaxHeight: 'auto', rowPadding: '12px 16px', rowBackground: 'rgba(0, 0, 0, 0.5)',
  rowGradient: 'none', rowBorderWidth: '0px', rowBorderColor: 'transparent', rowRadius: '8px', rowShadow: 'none', rowInnerGap: '16px', rowEvenBg: 'transparent', rowOddBg: 'transparent', rowGap: 8,
  
  layoutDirection: 'vertical', layoutReverse: false, rowTemplate: '{position} {avatar} {username} {messages}',
  
  animationType: 'fade', animationDuration: 0.3, animationDelay: 0, animationEasing: 'easeOut', animationIntensity: 1,
  highlightNew: true, highlightDuration: 1, highlightColor: 'rgba(255,255,255,0.2)',
  
  ignoreCommands: true, ignoreStreamer: false, ignoreMods: false, ignoreVips: false, excludedUsers: [], botUsers: [], minMessageLength: 1, spamProtection: false
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  previewMode: 'demo',
  updateSettings: (newSettings) => 
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  setAllSettings: (settings) => set({ settings }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
}));
