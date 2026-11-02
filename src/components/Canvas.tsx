import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeLayout, edgePath } from '../lib/layout';
import { LINE_HEIGHT, PAD_X, PAD_Y } from '../lib/text';
import { ACCENT, BG, GRID_DOT, MARKER_COLORS, nodeStyle } from '../lib/theme';
import { useStore } from '../store';
import NodeEditor from './NodeEditor';

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function Canvas() {
  const doc = useStore((state) => (state.currentId ? state.docs[state.currentId] ?? null : null));
  const selectedId = useStore((state) => state.selectedId);
  const editingId = useStore((state) => state.editingId);
  const fitToken = useStore((state) => state.fitToken);
  const focus = useStore((state) => state.focus);
  const theme = doc?.theme ?? 'light';

  const layout = useMemo(() => (doc ? computeLayout(doc) : null), [doc]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || !layout) return;
    const rect = el.getBoundingClientRect();
    const bounds = layout.bounds;
    const scale = clamp(
      Math.min((rect.width - 160) / Math.max(bounds.w, 80), (rect.height - 160) / Math.max(bounds.h, 80), 1.15),
      MIN_SCALE,
      MAX_SCALE,
    );
    setView({
      s: scale,
      x: rect.width / 2 - (bounds.x + bounds.w / 2) * scale,
      y: rect.height / 2 - (bounds.y + bounds.h / 2) * scale,
    });
  }, [layout]);

  const docId = doc?.id ?? null;
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!docId || !layout) return;
    if (fittedFor.current === docId) return;
    fittedFor.current = docId;
    requestAnimationFrame(() => fit());
  }, [docId, layout, fit]);

  const lastFitToken = useRef(fitToken);
  useEffect(() => {
    if (fitToken === lastFitToken.current) return;
    lastFitToken.current = fitToken;
    fit();
  }, [fitToken, fit]);

  const lastFocusToken = useRef(0);
  useEffect(() => {
    if (!focus || focus.token === lastFocusToken.current || !layout) return;
    lastFocusToken.current = focus.token;
    const node = layout.byId[focus.id];
    const el = containerRef.current;
    if (!node || !el) return;
    const rect = el.getBoundingClientRect();
    setView((current) => ({
      ...current,
      x: rect.width / 2 - node.x * current.s,
      y: rect.height / 2 - node.y * current.s,
    }));
  }, [focus, layout]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        setView((current) => {
          const scale = clamp(current.s * Math.exp(-event.deltaY * 0.0022), MIN_SCALE, MAX_SCALE);
          const ratio = scale / current.s;
          return {
            s: scale,
            x: px - (px - current.x) * ratio,
            y: py - (py - current.y) * ratio,
          };
        });
      } else {
        setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (factor: number): void => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setView((current) => {
      const scale = clamp(current.s * factor, MIN_SCALE, MAX_SCALE);
      const ratio = scale / current.s;
      const px = rect.width / 2;
      const py = rect.height / 2;
      return { s: scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
    });
  };

  const onBackgroundPointerDown = (event: React.PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-node-id]') || target.closest('[data-ui]')) return;

    useStore.getState().select(null);
    const start = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    const move = (nativeEvent: PointerEvent): void => {
      setView((current) => ({
        ...current,
        x: start.vx + (nativeEvent.clientX - start.x),
        y: start.vy + (nativeEvent.clientY - start.y),
      }));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onNodePointerDown = (event: React.PointerEvent, id: string): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const state = useStore.getState();
    state.select(id);

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let overId: string | null = null;

    const move = (nativeEvent: PointerEvent): void => {
      if (!dragging && Math.hypot(nativeEvent.clientX - startX, nativeEvent.clientY - startY) > 5) {
        dragging = true;
        document.body.style.cursor = 'grabbing';
      }
      if (!dragging) return;
      const element = document.elementFromPoint(nativeEvent.clientX, nativeEvent.clientY);
      const host = element?.closest('[data-node-id]') as HTMLElement | null;
      const candidate = host?.getAttribute('data-node-id') ?? null;
      overId = candidate && candidate !== id ? candidate : null;
      setDrag({ id, x: nativeEvent.clientX, y: nativeEvent.clientY, over: overId });
    };

    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      setDrag(null);
      if (dragging) {
        if (overId) useStore.getState().moveNode(id, overId);
      } else {
        useStore.getState().startEdit(id);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    const moveSelection = (direction: 'parent' | 'child' | 'prev' | 'next'): void => {
      const state = useStore.getState();
      const currentDoc = state.currentId ? state.docs[state.currentId] : null;
      const selected = state.selectedId;
      if (!currentDoc || !selected) return;
      const node = currentDoc.nodes[selected];
      if (!node) return;

      const parentId = Object.keys(currentDoc.nodes).find((key) =>
        currentDoc.nodes[key].children.includes(selected),
      );

      if (direction === 'child') {
        if (node.collapsed && node.children.length) {
          state.toggleCollapse(selected);
          return;
        }
        const first = node.children.find((child) => currentDoc.nodes[child]);
        if (first) state.select(first);
        return;
      }
      if (direction === 'parent') {
        if (parentId) state.select(parentId);
        return;
      }
      if (!parentId) return;
      const siblings = currentDoc.nodes[parentId].children.filter((child) => currentDoc.nodes[child]);
      const index = siblings.indexOf(selected);
      const next = siblings[index + (direction === 'next' ? 1 : -1)];
      if (next) state.select(next);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useStore.getState();
      if (state.editingId) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (event.key === 'Escape') {
        state.select(null);
        return;
      }

      const selected = state.selectedId;
      if (!selected) return;

      switch (event.key) {
        case 'Tab':
          event.preventDefault();
          state.addChild(selected);
          return;
        case 'Enter':
          event.preventDefault();
          state.addSibling(selected);
          return;
        case 'Backspace':
        case 'Delete':
          event.preventDefault();
          state.deleteNode(selected);
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveSelection('prev');
          return;
        case 'ArrowDown':
          event.preventDefault();
          moveSelection('next');
          return;
        case 'ArrowLeft':
          event.preventDefault();
          moveSelection('parent');
          return;
        case 'ArrowRight':
          event.preventDefault();
          moveSelection('child');
          return;
        case 'F2':
        case ' ':
          event.preventDefault();
          state.startEdit(selected);
          return;
        default:
          break;
      }

      if (!meta && !event.altKey && event.key.length === 1) {
        event.preventDefault();
        state.startEdit(selected, event.key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!doc || !layout) return <div className="canvas loading" />;

  const selectedLaid = selectedId ? layout.byId[selectedId] : undefined;
  const editingLaid = editingId ? layout.byId[editingId] : undefined;
  const dotColor = GRID_DOT[theme];

  return (
    <div className="canvas" ref={containerRef} style={{ background: BG[theme] }} onPointerDown={onBackgroundPointerDown}>
      <div
        className="stage"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      >
        <svg className="mind-svg" width={1} height={1}>
          <defs>
            <pattern id="fm-dots" width={24} height={24} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill={dotColor} />
            </pattern>
          </defs>
          <rect
            x={layout.bounds.x - 6000}
            y={layout.bounds.y - 6000}
            width={layout.bounds.w + 12000}
            height={layout.bounds.h + 12000}
            fill="url(#fm-dots)"
          />

          {layout.edges.map((edge) => {
            const from = layout.byId[edge.from];
            const to = layout.byId[edge.to];
            if (!from || !to) return null;
            const active = selectedId === edge.from || selectedId === edge.to;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={edgePath(from, to, edge.vertical)}
                fill="none"
                stroke={to.color}
                strokeOpacity={active ? 0.95 : 0.5}
                strokeWidth={active ? 2.4 : 1.8}
                strokeLinecap="round"
              />
            );
          })}

          {layout.nodes.map((node) => {
            const style = nodeStyle(node.depth, node.color, theme);
            const selected = selectedId === node.id;
            const isDragging = drag?.id === node.id;
            const isTarget = drag?.over === node.id;
            const isEditing = editingId === node.id;
            const radius = node.depth === 0 ? 12 : 9;
            const badgeX = node.dir > 0 ? node.w / 2 + 11 : -node.w / 2 - 11;

            return (
              <g
                key={node.id}
                data-node-id={node.id}
                transform={`translate(${node.x},${node.y})`}
                opacity={isDragging ? 0.45 : 1}
                style={{
                  cursor: 'pointer',
                  pointerEvents: isDragging ? 'none' : 'auto',
                }}
                onPointerDown={(event) => onNodePointerDown(event, node.id)}
              >
                <rect
                  x={-node.w / 2}
                  y={-node.h / 2}
                  width={node.w}
                  height={node.h}
                  rx={radius}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={selected ? ACCENT : style.stroke}
                  strokeOpacity={selected ? 1 : style.strokeOpacity}
                  strokeWidth={selected ? 2 : node.depth === 1 ? 1.4 : 1}
                />
                {isTarget && (
                  <rect
                    x={-node.w / 2 - 5}
                    y={-node.h / 2 - 5}
                    width={node.w + 10}
                    height={node.h + 10}
                    rx={radius + 4}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                )}

                {!isEditing &&
                  node.lines.map((line, index) => (
                    <text
                      key={index}
                      x={-node.w / 2 + PAD_X}
                      y={-node.h / 2 + PAD_Y + LINE_HEIGHT * (index + 0.5)}
                      dominantBaseline="middle"
                      fontSize={node.fontSize}
                      fontWeight={node.depth === 0 ? 600 : 450}
                      fill={style.text}
                      style={{ userSelect: 'none' }}
                    >
                      {line}
                    </text>
                  ))}

                {node.marker && (
                  <circle
                    cx={node.w / 2 - 8}
                    cy={-node.h / 2 + 8}
                    r={3.6}
                    fill={MARKER_COLORS[node.marker]}
                  />
                )}

                {node.hidden > 0 && (
                  <g
                    data-ui="badge"
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      useStore.getState().toggleCollapse(node.id);
                    }}
                  >
                    <circle
                      cx={badgeX}
                      cy={0}
                      r={9}
                      fill={BG[theme]}
                      stroke={node.color}
                      strokeOpacity={0.55}
                    />
                    <text
                      x={badgeX}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill={style.text}
                      fillOpacity={0.7}
                    >
                      {node.hidden}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {editingLaid && <NodeEditor key={editingLaid.id} laid={editingLaid} theme={theme} />}

        {selectedLaid && !editingId && (
          <div
            className="node-actions"
            data-ui="actions"
            style={{ left: selectedLaid.x, top: selectedLaid.y - selectedLaid.h / 2 - 40 }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {[1, 2, 3].map((marker) => (
              <button
                key={marker}
                type="button"
                className={`marker-dot${selectedLaid.marker === marker ? ' active' : ''}`}
                style={{ background: MARKER_COLORS[marker] }}
                title={`优先级 ${marker}`}
                onClick={() => {
                  const state = useStore.getState();
                  state.setMarker(selectedLaid.id, selectedLaid.marker === marker ? null : (marker as 1 | 2 | 3));
                }}
              />
            ))}
            {selectedLaid.hasChildren && (
              <button
                type="button"
                className="mini-btn"
                title={selectedLaid.collapsed ? '展开分支' : '折叠分支'}
                onClick={() => useStore.getState().toggleCollapse(selectedLaid.id)}
              >
                {selectedLaid.collapsed ? '展开' : '折叠'}
              </button>
            )}
            {selectedLaid.depth > 0 && (
              <button
                type="button"
                className="mini-btn"
                title="删除节点（含子节点）"
                onClick={() => useStore.getState().deleteNode(selectedLaid.id)}
              >
                删除
              </button>
            )}
          </div>
        )}
      </div>

      <div className="canvas-hint">
        <span>
          <kbd>Tab</kbd> 子节点
        </span>
        <span>
          <kbd>Enter</kbd> 同级
        </span>
        <span>
          <kbd>⇧Enter</kbd> 换行
        </span>
        <span>拖拽换父级</span>
        <span>⌘+滚轮缩放</span>
      </div>

      <div className="zoom-controls" data-ui="zoom">
        <button type="button" onClick={() => zoomBy(1.2)} title="放大">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} title="缩小">
          −
        </button>
        <button type="button" onClick={fit} title="适应屏幕">
          ⤢
        </button>
      </div>
    </div>
  );
}
