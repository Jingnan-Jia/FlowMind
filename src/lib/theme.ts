import type { ThemeMode } from '../types';

export const ACCENT = '#3B6EF6';

export const PALETTE: Record<ThemeMode, string[]> = {
  light: ['#3B6EF6', '#E8873A', '#2FA05A', '#8C5BE0', '#E05252', '#2B9FCC', '#D9A21B', '#38A3A5'],
  dark: ['#6E96FF', '#FFA45C', '#4ED08A', '#B08BFF', '#FF7B7B', '#5BC8F0', '#EFC24D', '#57C9C4'],
};

export const BG: Record<ThemeMode, string> = {
  light: '#FAFAFB',
  dark: '#0F1116',
};

export const GRID_DOT: Record<ThemeMode, string> = {
  light: '#E4E7EE',
  dark: '#232833',
};

export interface NodeStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  text: string;
}

export function nodeStyle(depth: number, color: string, theme: ThemeMode): NodeStyle {
  if (depth === 0) {
    return {
      fill: theme === 'light' ? '#111827' : '#F3F4F6',
      fillOpacity: 1,
      stroke: 'transparent',
      strokeOpacity: 0,
      text: theme === 'light' ? '#FFFFFF' : '#111827',
    };
  }
  return {
    fill: color,
    fillOpacity: theme === 'light' ? (depth === 1 ? 0.12 : 0.08) : depth === 1 ? 0.2 : 0.13,
    stroke: color,
    strokeOpacity: depth === 1 ? 0.34 : 0.16,
    text: theme === 'light' ? '#1F2937' : '#E5E7EB',
  };
}

export const MARKER_COLORS: Record<number, string> = {
  1: '#E05252',
  2: '#D9A21B',
  3: '#2FA05A',
};
