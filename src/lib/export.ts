import type { ThemeMode } from '../types';
import { edgePath, type LayoutResult } from './layout';
import { FONT_STACK, LINE_HEIGHT, PAD_X, PAD_Y } from './text';
import { BG, MARKER_COLORS, nodeStyle } from './theme';

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface SvgPayload {
  svg: string;
  width: number;
  height: number;
}

export function buildSvg(layout: LayoutResult, theme: ThemeMode, pad = 64): SvgPayload {
  const bounds = layout.bounds;
  const x = bounds.x - pad;
  const y = bounds.y - pad;
  const width = Math.ceil(bounds.w + pad * 2);
  const height = Math.ceil(bounds.h + pad * 2);
  const fontFamily = FONT_STACK.replace(/"/g, "'");

  const parts: string[] = [];
  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${BG[theme]}"/>`);

  for (const edge of layout.edges) {
    const from = layout.byId[edge.from];
    const to = layout.byId[edge.to];
    if (!from || !to) continue;
    parts.push(
      `<path d="${edgePath(from, to, edge.vertical)}" fill="none" stroke="${to.color}" stroke-opacity="0.5" stroke-width="1.8" stroke-linecap="round"/>`,
    );
  }

  for (const node of layout.nodes) {
    const style = nodeStyle(node.depth, node.color, theme);
    const radius = node.depth === 0 ? 12 : 9;
    parts.push(
      `<rect x="${(node.x - node.w / 2).toFixed(2)}" y="${(node.y - node.h / 2).toFixed(2)}" width="${node.w.toFixed(2)}" height="${node.h.toFixed(2)}" rx="${radius}" fill="${style.fill}" fill-opacity="${style.fillOpacity}" stroke="${style.stroke}" stroke-opacity="${style.strokeOpacity}" stroke-width="${node.depth === 1 ? 1.4 : 1}"/>`,
    );

    node.lines.forEach((line, index) => {
      const textY = node.y - node.h / 2 + PAD_Y + LINE_HEIGHT * (index + 0.5);
      parts.push(
        `<text x="${(node.x - node.w / 2 + PAD_X).toFixed(2)}" y="${textY.toFixed(2)}" dominant-baseline="middle" font-family="${fontFamily}" font-size="${node.fontSize}" font-weight="${node.depth === 0 ? 600 : 450}" fill="${style.text}">${escapeText(line)}</text>`,
      );
    });

    if (node.marker) {
      parts.push(
        `<circle cx="${(node.x + node.w / 2 - 7).toFixed(2)}" cy="${(node.y - node.h / 2 + 7).toFixed(2)}" r="3.5" fill="${MARKER_COLORS[node.marker]}"/>`,
      );
    }

    if (node.hidden > 0) {
      const badgeX = node.x + node.dir * (node.w / 2 + 11);
      parts.push(
        `<circle cx="${badgeX.toFixed(2)}" cy="${node.y.toFixed(2)}" r="9" fill="${BG[theme]}" stroke="${node.color}" stroke-opacity="0.5"/>`,
        `<text x="${badgeX.toFixed(2)}" y="${node.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}" font-size="10" fill="${style.text}" fill-opacity="0.65">${node.hidden}</text>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">
${parts.join('\n')}
</svg>`;

  return { svg, width, height };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type }));
}

export async function downloadSvgPng(filename: string, payload: SvgPayload, scale = 2): Promise<void> {
  const svgBlob = new Blob([payload.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG 渲染失败'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(payload.width * scale);
    canvas.height = Math.round(payload.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建画布');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, payload.width, payload.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadBlob(filename, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
