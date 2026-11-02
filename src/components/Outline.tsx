import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';

interface Row {
  id: string;
  text: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  marker?: number;
}

export default function Outline() {
  const doc = useStore((state) => (state.currentId ? state.docs[state.currentId] ?? null : null));
  const selectedId = useStore((state) => state.selectedId);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo<Row[]>(() => {
    if (!doc) return [];
    const result: Row[] = [];
    const walk = (id: string, depth: number): void => {
      const node = doc.nodes[id];
      if (!node) return;
      result.push({
        id,
        text: node.text,
        depth,
        hasChildren: node.children.length > 0,
        collapsed: !!node.collapsed,
        marker: node.marker,
      });
      if (!node.collapsed) node.children.forEach((child) => walk(child, depth + 1));
    };
    walk(doc.rootId, 0);
    return result;
  }, [doc]);

  if (!doc) return null;

  const commitEdit = (): void => {
    if (!editing) return;
    useStore.getState().setTextWithHistory(editing.id, editing.value.trim());
    setEditing(null);
  };

  return (
    <div className="outline">
      {rows.map((row) => {
        const isEditing = editing?.id === row.id;
        return (
          <div
            key={row.id}
            className={`outline-row${selectedId === row.id ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + row.depth * 14 }}
            onClick={() => {
              useStore.getState().select(row.id);
              useStore.getState().focusNode(row.id);
            }}
            onDoubleClick={() => {
              setEditing({ id: row.id, value: row.text });
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {row.hasChildren ? (
              <button
                type="button"
                className={`outline-caret${row.collapsed ? ' collapsed' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  useStore.getState().toggleCollapse(row.id);
                }}
              >
                ▾
              </button>
            ) : (
              <span className="outline-caret placeholder" />
            )}

            {row.marker ? <span className={`outline-marker m${row.marker}`} /> : <span className="outline-marker empty" />}

            {isEditing ? (
              <input
                ref={inputRef}
                className="outline-input"
                value={editing.value}
                onChange={(event) => setEditing({ id: row.id, value: event.target.value })}
                onBlur={commitEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitEdit();
                  }
                  if (event.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <span className={`outline-text${row.text.trim() ? '' : ' muted'}`}>
                {row.text.trim() || (row.depth === 0 ? '中心主题' : '未命名节点')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
