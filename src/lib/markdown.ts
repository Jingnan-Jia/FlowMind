import type { Doc, MindNode } from '../types';
import { uid } from './id';

export interface ParsedNode {
  text: string;
  children: ParsedNode[];
}

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/^\s*(?:>\s*)+/, '')
    .trim();
}

interface RawItem {
  level: number;
  text: string;
}

export function parseOutline(markdown: string): ParsedNode[] {
  const lines = markdown.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];

  const hasHeading = lines.some((line) => /^\s{0,3}#{1,6}\s+/.test(line));
  const raw: RawItem[] = [];
  let lastHeadingLevel = -1;

  for (const line of lines) {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      lastHeadingLevel = heading[1].length - 1;
      raw.push({ level: lastHeadingLevel, text: stripInline(heading[2]) });
      continue;
    }

    const listItem = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    const indent = (listItem?.[1] ?? line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '  ').length;
    const text = stripInline(listItem?.[2] ?? line.trim());
    if (!text) continue;

    if (hasHeading) {
      raw.push({ level: (lastHeadingLevel < 0 ? -1 : lastHeadingLevel) + 1 + Math.floor(indent / 2), text });
    } else {
      raw.push({ level: Math.floor(indent / 2), text });
    }
  }

  if (!raw.length) return [];

  // 规整层级，避免出现跳跃层
  const items: RawItem[] = [];
  let previous = 0;
  for (const item of raw) {
    const level = Math.min(item.level, previous + 1);
    items.push({ level: Math.max(level, 0), text: item.text });
    previous = items[items.length - 1].level;
  }

  const roots: ParsedNode[] = [];
  const stack: { level: number; node: ParsedNode }[] = [];
  for (const item of items) {
    const node: ParsedNode = { text: item.text, children: [] };
    while (stack.length && stack[stack.length - 1].level >= item.level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ level: item.level, node });
  }
  return roots;
}

export function docFromParsed(parsed: ParsedNode[], title: string): Doc {
  const nodes: Record<string, MindNode> = {};
  const rootId = uid();

  let rootText = title || '导入的导图';
  let topItems = parsed;
  if (parsed.length === 1) {
    rootText = parsed[0].text || rootText;
    topItems = parsed[0].children;
  }
  nodes[rootId] = { id: rootId, text: rootText, children: [] };

  const append = (parsedNode: ParsedNode, parentId: string): void => {
    const id = uid();
    nodes[id] = { id, text: parsedNode.text, children: [] };
    nodes[parentId].children.push(id);
    parsedNode.children.forEach((child) => append(child, id));
  };
  topItems.forEach((item) => append(item, rootId));

  return {
    id: uid(),
    title: title || '导入的导图',
    rootId,
    nodes,
    layout: 'mindmap',
    theme: 'light',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function toMarkdown(doc: Doc): string {
  const out: string[] = [];
  const root = doc.nodes[doc.rootId];

  const walk = (id: string, depth: number): void => {
    const node = doc.nodes[id];
    if (!node) return;
    const text = node.text.trim() || '未命名节点';
    if (depth === 0) out.push(`# ${text}`);
    else out.push(`${'  '.repeat(depth - 1)}- ${text}`);
    node.children.forEach((childId) => walk(childId, depth + 1));
  };

  if (root) walk(doc.rootId, 0);
  return out.join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toOpml(doc: Doc): string {
  const build = (id: string, indent: string): string => {
    const node = doc.nodes[id];
    if (!node) return '';
    const text = escapeXml(node.text.trim() || '未命名节点');
    if (!node.children.length) return `${indent}<outline text="${text}"/>\n`;
    const inner = node.children.map((childId) => build(childId, `${indent}  `)).join('');
    return `${indent}<outline text="${text}">\n${inner}${indent}</outline>\n`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(doc.title)}</title>
  </head>
  <body>
${build(doc.rootId, '    ')}  </body>
</opml>`;
}
