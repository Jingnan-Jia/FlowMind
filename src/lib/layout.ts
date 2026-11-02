import type { Doc, Marker } from '../types';
import { measureNode } from './text';
import { PALETTE } from './theme';

const H_GAP = 56;
const V_GAP = 18;
const LEVEL_GAP = 76;
const SIB_GAP_X = 24;

export interface LaidNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  depth: number;
  dir: 1 | -1;
  color: string;
  parentId: string | null;
  hidden: number;
  marker?: Marker;
  hasChildren: boolean;
  collapsed: boolean;
}

export interface LaidEdge {
  from: string;
  to: string;
  vertical: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  nodes: LaidNode[];
  edges: LaidEdge[];
  byId: Record<string, LaidNode>;
  bounds: Bounds;
}

interface Item {
  id: string;
  depth: number;
  w: number;
  h: number;
  lines: string[];
  fs: number;
  kids: Item[];
  hidden: number;
  parentId: string | null;
  marker?: Marker;
  hasChildren: boolean;
  collapsed: boolean;
}

function countDescendants(doc: Doc, id: string, seen: Set<string>): number {
  const node = doc.nodes[id];
  if (!node) return 0;
  let total = 0;
  for (const childId of node.children) {
    if (!doc.nodes[childId] || seen.has(childId)) continue;
    seen.add(childId);
    total += 1 + countDescendants(doc, childId, seen);
  }
  return total;
}

function buildItem(doc: Doc, id: string, depth: number, path: Set<string>, parentId: string | null): Item {
  const node = doc.nodes[id];
  const raw = node?.text ?? '';
  const placeholder = depth === 0 ? '中心主题' : '新节点';
  const measured = measureNode(raw.trim() ? raw : placeholder, depth);
  const childIds = (node?.children ?? []).filter((c) => doc.nodes[c] && !path.has(c));
  const collapsed = !!node?.collapsed;

  const nextPath = new Set(path);
  nextPath.add(id);

  return {
    id,
    depth,
    w: measured.w,
    h: measured.h,
    lines: raw.trim() ? measured.lines : [],
    fs: measured.fs,
    kids: collapsed ? [] : childIds.map((c) => buildItem(doc, c, depth + 1, nextPath, id)),
    hidden: collapsed ? countDescendants(doc, id, new Set([id])) : 0,
    parentId,
    marker: node?.marker,
    hasChildren: childIds.length > 0,
    collapsed,
  };
}

function makeNode(item: Item, x: number, y: number, dir: 1 | -1, color: string): LaidNode {
  return {
    id: item.id,
    x,
    y,
    w: item.w,
    h: item.h,
    lines: item.lines,
    fontSize: item.fs,
    depth: item.depth,
    dir,
    color,
    parentId: item.parentId,
    hidden: item.hidden,
    marker: item.marker,
    hasChildren: item.hasChildren,
    collapsed: item.collapsed,
  };
}

/** 水平方向生长（思维导图 / 逻辑图）：列宽取同层最大值，纵向用堆叠带居中 */
function layoutForestH(
  items: Item[],
  dir: 1 | -1,
  origin: { x: number; y: number },
  rootHalf: number,
  colors: string[],
  palette: string[],
): { nodes: LaidNode[]; edges: LaidEdge[] } {
  if (!items.length) return { nodes: [], edges: [] };

  const colW = new Map<number, number>();
  const walk = (item: Item): void => {
    colW.set(item.depth, Math.max(colW.get(item.depth) ?? 0, item.w));
    item.kids.forEach(walk);
  };
  items.forEach(walk);

  const depths = [...colW.keys()].sort((a, b) => a - b);
  const centerOffset = new Map<number, number>();
  let previousEdge = rootHalf;
  for (const depth of depths) {
    const center = previousEdge + H_GAP + (colW.get(depth) ?? 0) / 2;
    centerOffset.set(depth, center);
    previousEdge = center + (colW.get(depth) ?? 0) / 2;
  }

  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  let cursor = 0;

  const place = (item: Item, color: string): LaidNode => {
    const kids = item.kids.map((kid) => place(kid, color));
    let y: number;
    if (!kids.length) {
      y = cursor + item.h / 2;
      cursor += item.h + V_GAP;
    } else if (kids.length === 1) {
      y = kids[0].y;
    } else {
      y = (kids[0].y + kids[kids.length - 1].y) / 2;
    }
    const node = makeNode(item, dir * (centerOffset.get(item.depth) ?? 0), y, dir, color);
    nodes.push(node);
    kids.forEach((kid) => edges.push({ from: item.id, to: kid.id, vertical: false }));
    return node;
  };

  items.forEach((item, index) => place(item, colors[index] ?? palette[index % palette.length]));

  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minY = Math.min(minY, node.y - node.h / 2);
    maxY = Math.max(maxY, node.y + node.h / 2);
  }
  const shift = origin.y - (minY + maxY) / 2;
  for (const node of nodes) {
    node.x += origin.x;
    node.y += shift;
  }
  return { nodes, edges };
}

/** 垂直方向生长（结构图）：层高取同层最大值，横向用堆叠带居中 */
function layoutForestV(
  items: Item[],
  origin: { x: number; y: number },
  rootHalf: number,
  colors: string[],
  palette: string[],
): { nodes: LaidNode[]; edges: LaidEdge[] } {
  if (!items.length) return { nodes: [], edges: [] };

  const levelH = new Map<number, number>();
  const walk = (item: Item): void => {
    levelH.set(item.depth, Math.max(levelH.get(item.depth) ?? 0, item.h));
    item.kids.forEach(walk);
  };
  items.forEach(walk);

  const depths = [...levelH.keys()].sort((a, b) => a - b);
  const centerOffset = new Map<number, number>();
  let previousEdge = rootHalf;
  for (const depth of depths) {
    const center = previousEdge + LEVEL_GAP + (levelH.get(depth) ?? 0) / 2;
    centerOffset.set(depth, center);
    previousEdge = center + (levelH.get(depth) ?? 0) / 2;
  }

  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  let cursor = 0;

  const place = (item: Item, color: string): LaidNode => {
    const kids = item.kids.map((kid) => place(kid, color));
    let x: number;
    if (!kids.length) {
      x = cursor + item.w / 2;
      cursor += item.w + SIB_GAP_X;
    } else if (kids.length === 1) {
      x = kids[0].x;
    } else {
      x = (kids[0].x + kids[kids.length - 1].x) / 2;
    }
    const node = makeNode(item, x, centerOffset.get(item.depth) ?? 0, 1, color);
    nodes.push(node);
    kids.forEach((kid) => edges.push({ from: item.id, to: kid.id, vertical: true }));
    return node;
  };

  items.forEach((item, index) => place(item, colors[index] ?? palette[index % palette.length]));

  let minX = Infinity;
  let maxX = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.w / 2);
    maxX = Math.max(maxX, node.x + node.w / 2);
  }
  const shift = origin.x - (minX + maxX) / 2;
  for (const node of nodes) {
    node.x += shift;
    node.y += origin.y;
  }
  return { nodes, edges };
}

export function computeLayout(doc: Doc): LayoutResult {
  const palette = PALETTE[doc.theme];
  const rootItem = buildItem(doc, doc.rootId, 0, new Set(), null);
  const rootNode = makeNode(rootItem, 0, 0, 1, palette[0]);

  const nodes: LaidNode[] = [rootNode];
  let edges: LaidEdge[] = [];
  const topKids = rootItem.kids;

  if (topKids.length && doc.layout === 'org') {
    const result = layoutForestV(topKids, { x: 0, y: 0 }, rootItem.h / 2, palette, palette);
    nodes.push(...result.nodes);
    edges = result.edges;
  } else if (topKids.length && doc.layout === 'logic') {
    const result = layoutForestH(topKids, 1, { x: 0, y: 0 }, rootItem.w / 2, palette, palette);
    nodes.push(...result.nodes);
    edges = result.edges;
  } else if (topKids.length) {
    const half = Math.ceil(topKids.length / 2);
    const rightItems = topKids.slice(0, half);
    const leftItems = topKids.slice(half);
    const rightColors = rightItems.map((_, i) => palette[i % palette.length]);
    const leftColors = leftItems.map((_, i) => palette[(half + i) % palette.length]);
    const right = layoutForestH(rightItems, 1, { x: 0, y: 0 }, rootItem.w / 2, rightColors, palette);
    const left = layoutForestH(leftItems, -1, { x: 0, y: 0 }, rootItem.w / 2, leftColors, palette);
    nodes.push(...right.nodes, ...left.nodes);
    edges = [...right.edges, ...left.edges];
  }

  const vertical = doc.layout === 'org';
  for (const child of topKids) edges.push({ from: doc.rootId, to: child.id, vertical });

  const byId: Record<string, LaidNode> = {};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    byId[node.id] = node;
    minX = Math.min(minX, node.x - node.w / 2);
    maxX = Math.max(maxX, node.x + node.w / 2);
    minY = Math.min(minY, node.y - node.h / 2);
    maxY = Math.max(maxY, node.y + node.h / 2);
  }

  return {
    nodes,
    edges,
    byId,
    bounds: { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) },
  };
}

export function edgePath(a: LaidNode, b: LaidNode, vertical: boolean): string {
  if (vertical) {
    const y1 = a.y + a.h / 2;
    const y2 = b.y - b.h / 2;
    const mid = (y1 + y2) / 2;
    return `M ${a.x} ${y1} C ${a.x} ${mid} ${b.x} ${mid} ${b.x} ${y2}`;
  }
  const right = b.x >= a.x;
  const x1 = a.x + (right ? a.w / 2 : -a.w / 2);
  const x2 = b.x + (right ? -b.w / 2 : b.w / 2);
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${a.y} C ${mid} ${a.y} ${mid} ${b.y} ${x2} ${b.y}`;
}
