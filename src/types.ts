export type LayoutMode = 'mindmap' | 'logic' | 'org';
export type ThemeMode = 'light' | 'dark';
export type Marker = 1 | 2 | 3;

export interface MindNode {
  id: string;
  text: string;
  children: string[];
  collapsed?: boolean;
  marker?: Marker;
}

export interface Doc {
  id: string;
  title: string;
  rootId: string;
  nodes: Record<string, MindNode>;
  layout: LayoutMode;
  theme: ThemeMode;
  createdAt: number;
  updatedAt: number;
}

export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  mindmap: '思维导图',
  logic: '逻辑图',
  org: '结构图',
};
