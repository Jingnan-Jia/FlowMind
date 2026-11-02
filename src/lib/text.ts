export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

export const LINE_HEIGHT = 21;
export const PAD_X = 14;
export const PAD_Y = 9;
const MAX_LINES = 8;

export interface Measured {
  lines: string[];
  w: number;
  h: number;
  fs: number;
  weight: number;
}

export function fontSizeFor(depth: number): number {
  return depth === 0 ? 16 : depth === 1 ? 14 : 13;
}

function weightFor(depth: number): number {
  return depth === 0 ? 600 : 450;
}

function maxTextWidth(depth: number): number {
  return depth === 0 ? 240 : depth === 1 ? 200 : 186;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  return measureCtx as CanvasRenderingContext2D;
}

function widthOf(text: string, fs: number, weight: number): number {
  const c = ctx();
  c.font = `${weight} ${fs}px ${FONT_STACK}`;
  return c.measureText(text).width;
}

const TOKEN_RE = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]|[A-Za-z0-9_@#.$%&+\-/=]+|\s+|./gu;

function wrapText(text: string, maxW: number, fs: number, weight: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    const tokens = para.match(TOKEN_RE) ?? [];
    let line = '';
    for (const token of tokens) {
      const candidate = line + token;
      if (line && widthOf(candidate, fs, weight) > maxW) {
        out.push(line.replace(/\s+$/, ''));
        line = token.replace(/^\s+/, '');
      } else {
        line = candidate;
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  if (out.length > MAX_LINES) {
    const trimmed = out.slice(0, MAX_LINES);
    trimmed[MAX_LINES - 1] = `${trimmed[MAX_LINES - 1].slice(0, -1)}…`;
    return trimmed;
  }
  return out.length ? out : [''];
}

const cache = new Map<string, Measured>();

export function measureNode(text: string, depth: number): Measured {
  const key = `${depth}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const fs = fontSizeFor(depth);
  const weight = weightFor(depth);
  const lines = wrapText(text || ' ', maxTextWidth(depth), fs, weight);
  let maxLineWidth = 0;
  for (const line of lines) maxLineWidth = Math.max(maxLineWidth, widthOf(line, fs, weight));

  const measured: Measured = {
    lines,
    w: Math.ceil(maxLineWidth) + PAD_X * 2,
    h: lines.length * LINE_HEIGHT + PAD_Y * 2,
    fs,
    weight,
  };
  cache.set(key, measured);
  if (cache.size > 3000) cache.clear();
  return measured;
}
